use anyhow::{bail, Context, Result};
use clap::{Parser, ValueEnum};
use reqwest::{blocking::Client, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{env, fs::{self, File}, io::{BufReader, Read, Write}, path::{Path, PathBuf}};
use walkdir::WalkDir;
use zip::{write::FileOptions, CompressionMethod, ZipWriter};

const MAX_OVERLAY_BYTES: u64 = 250 * 1024 * 1024;

#[derive(Parser)]
#[command(name = "tenso-publisher", about = "Packages Tenso overrides and publishes a GitHub Release")]
struct Cli {
    #[arg(long)] source: PathBuf,
    #[arg(long)] pack_id: String,
    #[arg(long)] version: String,
    #[arg(long)] minecraft: String,
    #[arg(long)] loader: String,
    #[arg(long)] server: String,
    #[arg(long, value_enum)] base_source: BaseSource,
    #[arg(long)] base_url: String,
    #[arg(long)] repo: String,
    #[arg(long, default_value = "GITHUB_TOKEN")] token_env: String,
    #[arg(long)] dry_run: bool,
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

#[derive(Serialize)]
struct CreateRelease<'a> {
    tag_name: &'a str,
    name: &'a str,
    generate_release_notes: bool,
}

#[derive(Deserialize)]
struct Release { upload_url: String, html_url: String }

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
    let mut total = 0;
    for entry in WalkDir::new(source).follow_links(false) {
        let entry = entry?;
        if entry.file_type().is_symlink() { bail!("No se permiten enlaces simbólicos: {}", entry.path().display()); }
        if !entry.file_type().is_file() { continue; }
        let path = relative_path(source, entry.path())?;
        let (sha256, size) = digest(entry.path())?;
        total += size;
        if total > MAX_OVERLAY_BYTES { bail!("Los overrides superan el límite gratuito interno de 250 MiB"); }
        files.push((entry.path().to_path_buf(), OverlayFile { path, sha256, size }));
    }
    files.sort_by(|left, right| left.1.path.cmp(&right.1.path));
    Ok(files)
}

fn package(pack_id: &str, version: &str, manifest: &Manifest, files: &[(PathBuf, OverlayFile)]) -> Result<PathBuf> {
    let target = env::temp_dir().join(format!("tenso-{pack_id}-{version}-{}.zip", std::process::id()));
    let file = File::create(&target).with_context(|| format!("No se pudo crear {}", target.display()))?;
    let mut archive = ZipWriter::new(file);
    let options = FileOptions::default().compression_method(CompressionMethod::Deflated).unix_permissions(0o644);
    for (local, meta) in files {
        archive.start_file(format!("overrides/{}", meta.path), options)?;
        let mut input = File::open(local)?;
        std::io::copy(&mut input, &mut archive)?;
    }
    archive.start_file("tenso-pack.json", options)?;
    archive.write_all(&serde_json::to_vec_pretty(manifest)?)?;
    archive.finish()?;
    Ok(target)
}

fn publish(cli: Cli) -> Result<()> {
    if !safe_segment(&cli.pack_id) || !safe_segment(&cli.version) { bail!("pack_id y version solo aceptan letras, números, punto, guion y guion bajo"); }
    if !cli.base_url.starts_with("https://") || cli.repo.split('/').count() != 2 { bail!("base_url debe usar HTTPS y repo debe tener el formato propietario/repositorio"); }
    let files = collect(&cli.source)?;
    let manifest = Manifest { schema_version: 1, id: cli.pack_id.clone(), version: cli.version.clone(), minecraft: cli.minecraft, loader: cli.loader, server_address: cli.server, base_pack: BasePack { source: cli.base_source, url: cli.base_url }, overlay: files.iter().map(|(_, file)| OverlayFile { path: file.path.clone(), sha256: file.sha256.clone(), size: file.size }).collect() };
    let archive = package(&cli.pack_id, &cli.version, &manifest, &files)?;
    if cli.dry_run {
        let size = fs::metadata(&archive)?.len();
        fs::remove_file(&archive)?;
        println!("Paquete validado: {} archivo(s), {size} bytes. No se contactó GitHub.", files.len());
        return Ok(());
    }
    let token = env::var(&cli.token_env).with_context(|| format!("Falta la variable de entorno {}", cli.token_env))?;
    let tag = format!("tenso-{}-{}", cli.pack_id, cli.version);
    let asset_name = archive.file_name().and_then(|name| name.to_str()).context("Nombre de archivo inválido")?.to_owned();
    let client = Client::builder().user_agent("Tenso Publisher").build()?;
    let result = (|| -> Result<Release> {
        let release: Release = client.post(format!("https://api.github.com/repos/{}/releases", cli.repo))
            .bearer_auth(&token).header("X-GitHub-Api-Version", "2022-11-28")
            .json(&CreateRelease { tag_name: &tag, name: &format!("Tenso {} {}", cli.pack_id, cli.version), generate_release_notes: false })
            .send()?.error_for_status()?.json()?;
        let upload_base = release.upload_url.trim_end_matches("{?name,label}");
        let mut upload_url = Url::parse(upload_base)?;
        upload_url.query_pairs_mut().append_pair("name", &asset_name);
        client.post(upload_url).bearer_auth(&token).header("X-GitHub-Api-Version", "2022-11-28")
            .header("Content-Type", "application/zip").body(fs::read(&archive)?)
            .send()?.error_for_status()?;
        Ok(release)
    })();
    let cleanup = fs::remove_file(&archive);
    let release = match result { Ok(release) => { cleanup?; release }, Err(error) => { let _ = cleanup; return Err(error); } };
    println!("Versión publicada sin Cloudflare: {}", release.html_url);
    Ok(())
}

fn main() { if let Err(error) = publish(Cli::parse()) { eprintln!("Error: {error:#}"); std::process::exit(1); } }
