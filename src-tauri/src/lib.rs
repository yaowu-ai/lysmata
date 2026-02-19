use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
async fn start_sidecar(app: tauri::AppHandle) -> Result<(), String> {
    // Resolve the app data directory so the sidecar writes to the same DB
    let db_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let db_path = db_dir.join("app.db").to_string_lossy().to_string();

    let sidecar_command = app
        .shell()
        .sidecar("hono-sidecar")
        .map_err(|e| e.to_string())?
        .env("PORT", "2620")
        .env("DB_PATH", db_path);

    let (_rx, _child) = sidecar_command.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "initial schema: bots, conversations, conversation_bots, messages",
        sql: include_str!("../migrations/0001_initial.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:app.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![start_sidecar])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
