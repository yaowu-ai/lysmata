// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri_plugin_shell::ShellExt;

#[tauri::command]
async fn start_sidecar(app: tauri::AppHandle) -> Result<(), String> {
    let sidecar_command = app
        .shell()
        .sidecar("hono-sidecar")
        .map_err(|e| e.to_string())?
        .env("PORT", "3000");

    let (_rx, _child) = sidecar_command.spawn().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, start_sidecar])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


