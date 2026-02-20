use std::fs::{self, OpenOptions};
use std::io::Write;
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_sql::{Migration, MigrationKind};

fn get_lysmata_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let home_dir = app.path().home_dir().map_err(|e| e.to_string())?;
    Ok(home_dir.join(".lysmata"))
}

#[tauri::command]
async fn start_sidecar(app: tauri::AppHandle) -> Result<(), String> {
    // Resolve the app data directory so the sidecar writes to the same DB
    let lysmata_dir = get_lysmata_dir(&app)?;
    let db_path = lysmata_dir.join("app.db").to_string_lossy().to_string();
    let config_dir = lysmata_dir.join("config").to_string_lossy().to_string();
    let logs_dir = lysmata_dir.join("logs");

    let sidecar_command = app
        .shell()
        .sidecar("hono-sidecar")
        .map_err(|e| e.to_string())?
        .env("PORT", "2620")
        .env("DB_PATH", db_path)
        .env("CONFIG_DIR", config_dir);

    let (mut rx, _child) = sidecar_command.spawn().map_err(|e| e.to_string())?;

    tauri::async_runtime::spawn(async move {
        let log_file_path = logs_dir.join("sidecar.log");
        let mut log_file = match OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_file_path)
        {
            Ok(file) => file,
            Err(e) => {
                eprintln!("Failed to open log file: {}", e);
                return;
            }
        };

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let log_line = format!("[stdout] {}\n", String::from_utf8_lossy(&line));
                    if let Err(e) = log_file.write_all(log_line.as_bytes()) {
                        eprintln!("Failed to write to log file: {}", e);
                    }
                }
                CommandEvent::Stderr(line) => {
                    let log_line = format!("[stderr] {}\n", String::from_utf8_lossy(&line));
                    if let Err(e) = log_file.write_all(log_line.as_bytes()) {
                        eprintln!("Failed to write to log file: {}", e);
                    }
                }
                _ => {}
            }
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle();
            let home_dir = handle
                .path()
                .home_dir()
                .expect("Failed to get home dir");
            let lysmata_dir = home_dir.join(".lysmata");

            // Create directories
            fs::create_dir_all(&lysmata_dir).expect("Failed to create .lysmata dir");
            fs::create_dir_all(lysmata_dir.join("config")).expect("Failed to create config dir");
            fs::create_dir_all(lysmata_dir.join("logs")).expect("Failed to create logs dir");

            let migrations = vec![
                Migration {
                    version: 1,
                    description: "initial schema: bots, conversations, conversation_bots, messages",
                    sql: include_str!("../migrations/0001_initial.sql"),
                    kind: MigrationKind::Up,
                },
                Migration {
                    version: 2,
                    description: "add openclaw_agent_id to bots",
                    sql: include_str!("../migrations/0002_bot_agent_id.sql"),
                    kind: MigrationKind::Up,
                },
            ];

            let db_path = lysmata_dir.join("app.db");
            let db_url = format!("sqlite:{}", db_path.to_string_lossy());

            app.handle().plugin(
                tauri_plugin_sql::Builder::default()
                    .add_migrations(&db_url, migrations)
                    .build(),
            )?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![start_sidecar])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
