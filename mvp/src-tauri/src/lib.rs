use serde::Serialize;
use std::{env, path::PathBuf, process::Command};
use sysinfo::{Disks, System};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Launcher {
    id: &'static str,
    name: &'static str,
    detected: bool,
    executable: Option<String>,
    icon_data_url: Option<String>,
    install_mode: &'static str,
}

struct LauncherDefinition {
    id: &'static str,
    name: &'static str,
    executable_names: &'static [&'static str],
    candidate_dirs: Vec<PathBuf>,
    install_mode: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemDiagnostic {
    operating_system: String,
    cpu: String,
    cpu_cores: usize,
    total_memory_mb: u64,
    available_memory_mb: u64,
    disk_free_gb: u64,
}

fn app_data(name: &str) -> Option<PathBuf> {
    env::var_os(name).map(PathBuf::from)
}

fn definitions() -> Vec<LauncherDefinition> {
    let appdata = app_data("APPDATA");
    let localappdata = app_data("LOCALAPPDATA");
    let program_files = app_data("ProgramFiles");
    let program_files_x86 = app_data("ProgramFiles(x86)");

    vec![
        LauncherDefinition {
            id: "modrinth", name: "Modrinth App", executable_names: &["Modrinth App.exe", "modrinth-app.exe"],
            candidate_dirs: vec![appdata.clone().map(|p| p.join("ModrinthApp")), localappdata.clone().map(|p| p.join("Programs/Modrinth App")), localappdata.clone().map(|p| p.join("Modrinth App"))].into_iter().flatten().collect(),
            install_mode: "Abrir el modpack publicado en Modrinth",
        },
        LauncherDefinition {
            id: "prism", name: "Prism Launcher", executable_names: &["prismlauncher.exe", "PrismLauncher.exe"],
            candidate_dirs: vec![appdata.clone().map(|p| p.join("PrismLauncher")), localappdata.clone().map(|p| p.join("Programs/PrismLauncher")), program_files.clone().map(|p| p.join("Prism Launcher"))].into_iter().flatten().collect(),
            install_mode: "Importar un .mrpack con el protocolo de Prism",
        },
        LauncherDefinition {
            id: "polymc", name: "PolyMC", executable_names: &["polymc.exe", "PolyMC.exe"],
            candidate_dirs: vec![appdata.clone().map(|p| p.join("PolyMC")), localappdata.clone().map(|p| p.join("Programs/PolyMC")), program_files_x86.clone().map(|p| p.join("PolyMC"))].into_iter().flatten().collect(),
            install_mode: "Descargar e importar un pack compatible con MultiMC",
        },
        LauncherDefinition {
            id: "sklauncher", name: "SKLauncher", executable_names: &["SKlauncher.exe", "SKLauncher.exe"],
            candidate_dirs: vec![appdata.clone().map(|p| p.join("SKLauncher")), localappdata.clone().map(|p| p.join("Programs/SKLauncher")), program_files.clone().map(|p| p.join("SKLauncher"))].into_iter().flatten().collect(),
            install_mode: "Preparar un perfil sin conexión o una cuenta Microsoft",
        },
        LauncherDefinition {
            id: "curseforge", name: "CurseForge", executable_names: &["CurseForge.exe", "curseforge.exe"],
            candidate_dirs: vec![localappdata.clone().map(|p| p.join("Programs/CurseForge")), program_files.clone().map(|p| p.join("CurseForge Windows")), program_files_x86.map(|p| p.join("Overwolf/CurseForge"))].into_iter().flatten().collect(),
            install_mode: "Abrir la página oficial del modpack en CurseForge",
        },
    ]
}

fn find_executable(definition: &LauncherDefinition) -> Option<PathBuf> {
    definition.candidate_dirs.iter().find_map(|dir| {
        definition.executable_names.iter().map(|name| dir.join(name)).find(|candidate| candidate.is_file())
    })
}

/// Windows guarda el icono de cada launcher dentro de su ejecutable. Lo leemos
/// localmente para que la interfaz use la imagen real sin descargar ni
/// redistribuir marcas de terceros. Si PowerShell no está disponible, la UI usa
/// su marca textual de respaldo.
fn executable_icon(path: &PathBuf) -> Option<String> {
    let escaped = path.to_string_lossy().replace('\'', "''");
    let script = format!(
        "Add-Type -AssemblyName System.Drawing; $i=[System.Drawing.Icon]::ExtractAssociatedIcon('{}'); if($null -ne $i){{ $b=$i.ToBitmap(); $m=New-Object IO.MemoryStream; $b.Save($m,[System.Drawing.Imaging.ImageFormat]::Png); [Convert]::ToBase64String($m.ToArray()) }}",
        escaped,
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .ok()?;
    if !output.status.success() { return None; }
    let encoded = String::from_utf8(output.stdout).ok()?;
    let encoded = encoded.trim();
    (!encoded.is_empty()).then(|| format!("data:image/png;base64,{encoded}"))
}

/// Detecta instalaciones conocidas sin modificar archivos de ningún launcher.
#[tauri::command]
fn detect_launchers() -> Vec<Launcher> {
    definitions().into_iter().map(|definition| {
        let executable = find_executable(&definition);
        let icon_data_url = executable.as_ref().and_then(executable_icon);
        Launcher { id: definition.id, name: definition.name, detected: executable.is_some(), executable: executable.map(|path| path.to_string_lossy().into_owned()), icon_data_url, install_mode: definition.install_mode }
    }).collect()
}

/// Diagnóstico exclusivamente local para informar requisitos y optimización.
/// No contiene nombre de usuario, seriales, IP ni identificadores del equipo.
#[tauri::command]
fn get_system_diagnostic() -> SystemDiagnostic {
    let system = System::new_all().ok();
    let cpu = system.as_ref().and_then(|value| value.cpus().first()).map(|item| item.brand().to_string()).unwrap_or_else(|| "CPU no identificada".into());
    let disks = Disks::new_with_refreshed_list().ok();
    let disk_free_gb = disks.as_ref().map(|value| value.iter().map(|disk| disk.available_space()).sum::<u64>() / 1024 / 1024 / 1024).unwrap_or(0);
    let operating_system = [System::name(), System::os_version()].into_iter().flatten().collect::<Vec<_>>().join(" ");
    SystemDiagnostic {
        operating_system,
        cpu,
        cpu_cores: system.as_ref().map(|value| value.cpus().len()).unwrap_or(0),
        total_memory_mb: system.as_ref().map(|value| value.total_memory() / 1024 / 1024).unwrap_or(0),
        available_memory_mb: system.as_ref().map(|value| value.available_memory() / 1024 / 1024).unwrap_or(0),
        disk_free_gb,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![detect_launchers, get_system_diagnostic])
        .run(tauri::generate_context!())
        .expect("error while running Tenso Installer");
}
