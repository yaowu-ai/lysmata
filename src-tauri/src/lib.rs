use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::Mutex;
use tauri::{Listener, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_sql::{Migration, MigrationKind};

// Store the sidecar child process handle
struct SidecarState {
    child: Mutex<Option<CommandChild>>,
}

const SHELL_ENV_START: &str = "__LYSMATA_SHELL_ENV_START__";
const SHELL_ENV_END: &str = "__LYSMATA_SHELL_ENV_END__";

#[derive(Default)]
struct CapturedShellEnv {
    env: HashMap<String, String>,
    shell: Option<String>,
    shell_kind: Option<String>,
}

fn get_lysmata_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let home_dir = app.path().home_dir().map_err(|e| e.to_string())?;
    Ok(home_dir.join(".lysmata"))
}

fn current_process_env() -> HashMap<String, String> {
    std::env::vars().collect()
}

fn basename(input: &str) -> String {
    Path::new(input)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(input)
        .to_string()
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack.windows(needle.len()).position(|window| window == needle)
}

fn parse_nul_env_block(bytes: &[u8]) -> HashMap<String, String> {
    bytes
        .split(|byte| *byte == 0)
        .filter_map(|entry| {
            if entry.is_empty() {
                return None;
            }
            let text = String::from_utf8_lossy(entry);
            let (key, value) = text.split_once('=')?;
            if key.is_empty() {
                return None;
            }
            Some((key.to_string(), value.to_string()))
        })
        .collect()
}

fn extract_marked_block(bytes: &[u8], start: &str, end: &str) -> Option<Vec<u8>> {
    let start_marker = format!("{start}\0");
    let end_marker = format!("{end}\0");
    let start_idx = find_bytes(bytes, start_marker.as_bytes())? + start_marker.len();
    let remaining = &bytes[start_idx..];
    let end_relative = find_bytes(remaining, end_marker.as_bytes())?;
    Some(remaining[..end_relative].to_vec())
}

#[cfg(not(windows))]
fn capture_unix_shell_env(shell: &str) -> Option<CapturedShellEnv> {
    let command = format!(
        "printf '{SHELL_ENV_START}\\0'; env -0; printf '{SHELL_ENV_END}\\0'"
    );

    for args in [
        vec!["-i", "-l", "-c", &command],
        vec!["-l", "-c", &command],
        vec!["-c", &command],
    ] {
        if let Ok(output) = std::process::Command::new(shell).args(&args).output() {
            if !output.status.success() {
                continue;
            }
            let block = match extract_marked_block(&output.stdout, SHELL_ENV_START, SHELL_ENV_END) {
                Some(block) => block,
                None => continue,
            };
            let env = parse_nul_env_block(&block);
            if env.is_empty() {
                continue;
            }
            return Some(CapturedShellEnv {
                env,
                shell: Some(shell.to_string()),
                shell_kind: Some(basename(shell)),
            });
        }
    }

    None
}

fn capture_shell_env() -> CapturedShellEnv {
    let mut merged = current_process_env();

    #[cfg(windows)]
    let captured: Option<CapturedShellEnv> = None;

    #[cfg(not(windows))]
    let captured = {
        let mut candidates: Vec<String> = Vec::new();
        for candidate in [
            std::env::var("LYSMATA_SHELL").ok(),
            std::env::var("SHELL").ok(),
            Some("/bin/zsh".to_string()),
            Some("/bin/bash".to_string()),
            Some("/bin/sh".to_string()),
        ] {
            if let Some(candidate) = candidate {
                if !candidate.trim().is_empty() && !candidates.contains(&candidate) {
                    candidates.push(candidate);
                }
            }
        }

        let mut resolved = None;
        for shell in candidates {
            if let Some(env) = capture_unix_shell_env(&shell) {
                resolved = Some(env);
                break;
            }
        }
        resolved
    };

    if let Some(captured) = captured {
        merged.extend(captured.env.clone());
        CapturedShellEnv {
            env: merged,
            shell: captured.shell,
            shell_kind: captured.shell_kind,
        }
    } else {
        #[cfg(windows)]
        let shell = std::env::var("COMSPEC").ok();
        #[cfg(not(windows))]
        let shell = None;

        CapturedShellEnv {
            env: merged,
            shell: shell.clone(),
            shell_kind: shell.map(|value| basename(&value)),
        }
    }
}

#[tauri::command]
async fn start_sidecar(app: tauri::AppHandle) -> Result<(), String> {
    use std::time::SystemTime;
    
    // Resolve the app data directory so the sidecar writes to the same DB
    let lysmata_dir = get_lysmata_dir(&app)?;
    let db_path = lysmata_dir.join("app.db").to_string_lossy().to_string();
    let config_dir = lysmata_dir.join("config").to_string_lossy().to_string();
    let logs_dir = lysmata_dir.join("logs");

    // Capture the user's shell-derived environment so the sidecar and any
    // external commands it spawns behave closer to an interactive terminal.
    let shell_env = capture_shell_env();
    let login_path = shell_env
        .env
        .get("PATH")
        .cloned()
        .unwrap_or_default();
    let shell_path = shell_env.shell.clone().unwrap_or_else(|| "unknown".to_string());
    let shell_kind = shell_env
        .shell_kind
        .clone()
        .unwrap_or_else(|| "unknown".to_string());

    // Log startup info
    let startup_log = logs_dir.join("sidecar-startup.log");
    let timestamp = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let startup_info = format!(
        "[{}] Starting sidecar\nDB_PATH: {}\nCONFIG_DIR: {}\nPORT: 2620\nSHELL: {}\nSHELL_KIND: {}\nPATH: {}\n",
        timestamp, db_path, config_dir, shell_path, shell_kind, login_path
    );
    let _ = fs::write(&startup_log, startup_info);

    let gateway_log_path = logs_dir.join("gateway.log").to_string_lossy().to_string();
    let lysmata_log_path = logs_dir.join("lysmata.log").to_string_lossy().to_string();

    let mut sidecar_command = app
        .shell()
        .sidecar("hono-sidecar")
        .map_err(|e| {
            let err_msg = format!("Failed to create sidecar command: {}", e);
            eprintln!("{}", err_msg);
            let _ = fs::write(&logs_dir.join("sidecar-error.log"), &err_msg);
            err_msg
        })?;

    for (key, value) in &shell_env.env {
        sidecar_command = sidecar_command.env(key, value);
    }

    sidecar_command = sidecar_command
        .env("LYSMATA_SHELL", shell_path)
        .env("LYSMATA_SHELL_KIND", shell_kind)
        .env("PORT", "2620")
        .env("DB_PATH", db_path)
        .env("CONFIG_DIR", config_dir)
        .env("GATEWAY_LOG_PATH", gateway_log_path)
        .env("LYSMATA_LOG_PATH", lysmata_log_path)
        .env("PATH", login_path);

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
        if let Some(child) = child_lock.take() {
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
                            if let Some(child) = child_lock.take() {
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
