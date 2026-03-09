use std::fs::{self, OpenOptions};
use std::io::Write;
use std::sync::Mutex;
use tauri::{Listener, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_sql::{Migration, MigrationKind};

// Store the sidecar child process handle
struct SidecarState {
    child: Mutex<Option<CommandChild>>,
}

fn get_lysmata_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let home_dir = app.path().home_dir().map_err(|e| e.to_string())?;
    Ok(home_dir.join(".lysmata"))
}

#[tauri::command]
async fn start_sidecar(app: tauri::AppHandle) -> Result<(), String> {
    use std::time::SystemTime;
    
    // Resolve the app data directory so the sidecar writes to the same DB
    let lysmata_dir = get_lysmata_dir(&app)?;
    let db_path = lysmata_dir.join("app.db").to_string_lossy().to_string();
    let config_dir = lysmata_dir.join("config").to_string_lossy().to_string();
    let logs_dir = lysmata_dir.join("logs");

    // Log startup info
    let startup_log = logs_dir.join("sidecar-startup.log");
    let timestamp = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let startup_info = format!(
        "[{}] Starting sidecar\nDB_PATH: {}\nCONFIG_DIR: {}\nPORT: 2620\n",
        timestamp, db_path, config_dir
    );
    let _ = fs::write(&startup_log, startup_info);

    let gateway_log_path = logs_dir.join("gateway.log").to_string_lossy().to_string();
    let lysmata_log_path = logs_dir.join("lysmata.log").to_string_lossy().to_string();

    let sidecar_command = app
        .shell()
        .sidecar("hono-sidecar")
        .map_err(|e| {
            let err_msg = format!("Failed to create sidecar command: {}", e);
            eprintln!("{}", err_msg);
            let _ = fs::write(&logs_dir.join("sidecar-error.log"), &err_msg);
            err_msg
        })?
        .env("PORT", "2620")
        .env("DB_PATH", db_path)
        .env("CONFIG_DIR", config_dir)
        .env("GATEWAY_LOG_PATH", gateway_log_path)
        .env("LYSMATA_LOG_PATH", lysmata_log_path);

    let (mut rx, child) = sidecar_command.spawn().map_err(|e| {
        let err_msg = format!("Failed to spawn sidecar: {}", e);
        eprintln!("{}", err_msg);
        let _ = fs::write(&logs_dir.join("sidecar-error.log"), &err_msg);
        err_msg
    })?;

    println!("Sidecar spawned successfully, logging to {:?}", logs_dir.join("sidecar.log"));

    // Store the child process handle in app state
    if let Some(state) = app.try_state::<SidecarState>() {
        let mut child_lock = state.child.lock().unwrap();
        *child_lock = Some(child);
    }

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

        // Write startup marker
        let _ = log_file.write_all(b"\n=== Sidecar started ===\n");

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let log_line = format!("[stdout] {}\n", String::from_utf8_lossy(&line));
                    print!("{}", log_line); // Also print to console
                    if let Err(e) = log_file.write_all(log_line.as_bytes()) {
                        eprintln!("Failed to write to log file: {}", e);
                    }
                    let _ = log_file.flush();
                }
                CommandEvent::Stderr(line) => {
                    let log_line = format!("[stderr] {}\n", String::from_utf8_lossy(&line));
                    eprint!("{}", log_line); // Also print to console
                    if let Err(e) = log_file.write_all(log_line.as_bytes()) {
                        eprintln!("Failed to write to log file: {}", e);
                    }
                    let _ = log_file.flush();
                }
                CommandEvent::Terminated(payload) => {
                    let log_line = format!("[terminated] code: {:?}, signal: {:?}\n", payload.code, payload.signal);
                    eprintln!("{}", log_line);
                    let _ = log_file.write_all(log_line.as_bytes());
                    let _ = log_file.flush();
                }
                CommandEvent::Error(err) => {
                    let log_line = format!("[error] {}\n", err);
                    eprintln!("{}", log_line);
                    let _ = log_file.write_all(log_line.as_bytes());
                    let _ = log_file.flush();
                }
                _ => {}
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn get_sidecar_logs(app: tauri::AppHandle) -> Result<String, String> {
    let lysmata_dir = get_lysmata_dir(&app)?;
    let logs_dir = lysmata_dir.join("logs");
    
    let mut result = String::new();
    
    // Read startup log
    let startup_log = logs_dir.join("sidecar-startup.log");
    if startup_log.exists() {
        if let Ok(content) = fs::read_to_string(&startup_log) {
            result.push_str("=== Startup Log ===\n");
            result.push_str(&content);
            result.push_str("\n\n");
        }
    }
    
    // Read error log
    let error_log = logs_dir.join("sidecar-error.log");
    if error_log.exists() {
        if let Ok(content) = fs::read_to_string(&error_log) {
            result.push_str("=== Error Log ===\n");
            result.push_str(&content);
            result.push_str("\n\n");
        }
    }
    
    // Read main log (last 100 lines)
    let main_log = logs_dir.join("sidecar.log");
    if main_log.exists() {
        if let Ok(content) = fs::read_to_string(&main_log) {
            result.push_str("=== Sidecar Log (last 100 lines) ===\n");
            let lines: Vec<&str> = content.lines().collect();
            let start = if lines.len() > 100 { lines.len() - 100 } else { 0 };
            result.push_str(&lines[start..].join("\n"));
        }
    }
    
    if result.is_empty() {
        result = "No logs found".to_string();
    }
    
    Ok(result)
}

#[tauri::command]
async fn stop_sidecar(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(state) = app.try_state::<SidecarState>() {
        let mut child_lock = state.child.lock().unwrap();
        if let Some(mut child) = child_lock.take() {
            child.kill().map_err(|e| format!("Failed to kill sidecar: {}", e))?;
            println!("Sidecar process terminated");
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .manage(SidecarState {
            child: Mutex::new(None),
        })
        .setup(|app| {
            // Open devtools in debug builds
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            
            // Register global shortcut for devtools (F12 or Ctrl+Shift+I)
            let window = app.get_webview_window("main").unwrap();
            let window_clone = window.clone();
            let app_handle = app.handle().clone();
            
            // Listen for window close event to cleanup sidecar
            window.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::CloseRequested { .. } => {
                        println!("Window close requested, stopping sidecar...");
                        // Kill sidecar process before window closes
                        if let Some(state) = app_handle.try_state::<SidecarState>() {
                            let mut child_lock = state.child.lock().unwrap();
                            if let Some(mut child) = child_lock.take() {
                                let _ = child.kill();
                                println!("Sidecar process killed on window close");
                            }
                        }
                    }
                    tauri::WindowEvent::Focused(focused) => {
                        if *focused {
                            // Window is focused, keyboard shortcuts will work
                        }
                    }
                    _ => {}
                }
            });
            
            // Listen for F12 key
            window.listen("toggle-devtools", move |_| {
                if window_clone.is_devtools_open() {
                    let _ = window_clone.close_devtools();
                } else {
                    window_clone.open_devtools();
                }
            });
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
                Migration {
                    version: 3,
                    description: "add llm_config to bots",
                    sql: include_str!("../migrations/0003_llm_config.sql"),
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
        .invoke_handler(tauri::generate_handler![start_sidecar, get_sidecar_logs, stop_sidecar])
        .on_menu_event(|app, event| {
            if event.id() == "devtools" {
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_devtools_open() {
                        let _ = window.close_devtools();
                    } else {
                        window.open_devtools();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
