use anyhow::{bail, Context, Result};
use clap::{Parser, ValueEnum};
use reqwest::blocking::Client;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{env, fs::{self, File}, io::{BufReader, Read}, path::{Path, PathBuf}};
use walkdir::WalkDir;

#[derive(Parser)]
#[command(name = "tenso-publisher", about = "Publishes Tenso overrides to the private R2 Worker")]
struct Cli {
    #[arg(long)] source: PathBuf,
    #[arg(long)] pack_id: String,
    #[arg(long)] version: String,
    #[arg(long)] minecraft: String,
    #[arg(long)] loader: String,
    #[arg(long)] server: String,
    #[arg(long, value_enum)] base_source: BaseSource,
    #[arg(long)] base_url: String,
    #[arg(long)] endpoint: String,
    #[arg(long, default_value = "TENSO_PUBLISHER_TOKEN")] token_env: String,
}

#[derive(Clone, ValueEnum, Serialize)]
#[serde(rename_all = "lowercase")]
enum BaseSource { Modrinth, Curseforge }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OverlayFile { path: String, sha256: String, size: u64 }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BasePack { source: BaseSource, url: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    schema_version: u8,
    id: String,
    version: String,
    minecraft: String,
    loader: String,
    server_address: String,
    base_pack: BasePack,
    overlay: Vec<OverlayFile>,
}

fn safe_segment(value: &str) -> bool {
    !value.is_empty() && value.len() <= 80 && value.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

fn relative_path(root: &Path, file: &Path) -> Result<String> {
    let relative = file.strip_prefix(root)?.to_string_lossy().replace('\\', "/");
    if relative.is_empty() || relative.len() > 300 || relative.split('/').any(|part| !safe_segment(part)) { bail!("Ruta de override no permitida: {relative}"); }
    Ok(relative)
}

fn digest(path: &Path) -> Result<(String, u64)> {
    let file = File::open(path).with_context(|| format!("No se pudo leer {}", path.display()))?;
    let mut reader = BufReader::new(file);
    let mut hash = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop { let count = reader.read(&mut buffer)?; if count == 0 { break; } hash.update(&buffer[..count]); }
    Ok((format!("{:x}", hash.finalize()), fs::metadata(path)?.len()))
}

fn collect(source: &Path) -> Result<Vec<(PathBuf, OverlayFile)>> {
    if !source.is_dir() { bail!("La carpeta de overrides no existe: {}", source.display()); }
    let mut files = Vec::new();
    for entry in WalkDir::new(source).follow_links(false) {
        let entry = entry?;
        if entry.file_type().is_symlink() { bail!("No se permiten enlaces simbólicos: {}", entry.path().display()); }
        if !entry.file_type().is_file() { continue; }
        let path = relative_path(source, entry.path())?;
        let (sha256, size) = digest(entry.path())?;
        files.push((entry.path().to_path_buf(), OverlayFile { path, sha256, size }));
    }
    files.sort_by(|left, right| left.1.path.cmp(&right.1.path));
    Ok(files)
}

fn publish(cli: Cli) -> Result<()> {
    if !safe_segment(&cli.pack_id) || !safe_segment(&cli.version) { bail!("pack_id y version solo aceptan letras, números, punto, guion y guion bajo"); }
    if !cli.base_url.starts_with("https://") || !cli.endpoint.starts_with("https://") { bail!("Las URLs deben usar HTTPS"); }
    let token = env::var(&cli.token_env).with_context(|| format!("Falta la variable de entorno {}", cli.token_env))?;
    let endpoint = cli.endpoint.trim_end_matches('/');
    let client = Client::builder().build()?;
    let files = collect(&cli.source)?;
    println!("Publicando {} archivo(s) de overrides…", files.len());
    for (local, meta) in &files {
        let url = format!("{endpoint}/v1/admin/packs/{}/{}/files/{}", cli.pack_id, cli.version, meta.path);
        let response = client.put(url).bearer_auth(&token).header("x-tenso-sha256", &meta.sha256).body(fs::read(local)?).send()?;
        response.error_for_status().with_context(|| format!("Falló la subida de {}", meta.path))?;
        println!("  ✓ {}", meta.path);
    }
    let manifest = Manifest { schema_version: 1, id: cli.pack_id.clone(), version: cli.version.clone(), minecraft: cli.minecraft, loader: cli.loader, server_address: cli.server, base_pack: BasePack { source: cli.base_source, url: cli.base_url }, overlay: files.into_iter().map(|(_, file)| file).collect() };
    client.put(format!("{endpoint}/v1/admin/packs/{}/{}/manifest", cli.pack_id, cli.version)).bearer_auth(&token).json(&manifest).send()?.error_for_status()?.text()?;
    client.post(format!("{endpoint}/v1/admin/packs/{}/{}/promote", cli.pack_id, cli.version)).bearer_auth(&token).send()?.error_for_status()?;
    println!("Versión {} publicada y promovida correctamente.", cli.version);
    Ok(())
}

fn main() { if let Err(error) = publish(Cli::parse()) { eprintln!("Error: {error:#}"); std::process::exit(1); } }
