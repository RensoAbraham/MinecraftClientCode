use serde::Serialize;
use std::{env, path::PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Launcher {
    id: &'static str,
    name: &'static str,
    detected: bool,
    executable: Option<String>,
    install_mode: &'static str,
}

struct LauncherDefinition {
    id: &'static str,
    name: &'static str,
    executable_names: &'static [&'static str],
    candidate_dirs: Vec<PathBuf>,
    install_mode: &'static str,
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

/// Detecta instalaciones conocidas sin modificar archivos de ningún launcher.
#[tauri::command]
fn detect_launchers() -> Vec<Launcher> {
    definitions().into_iter().map(|definition| {
        let executable = find_executable(&definition);
        Launcher { id: definition.id, name: definition.name, detected: executable.is_some(), executable: executable.map(|path| path.to_string_lossy().into_owned()), install_mode: definition.install_mode }
    }).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![detect_launchers])
        .run(tauri::generate_context!())
        .expect("error while running Tenso Installer");
}
