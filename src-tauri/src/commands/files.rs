use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Log a separator line to mark the end of a transcription process
#[tauri::command]
pub fn log_separator() {
    tracing::info!("────────────────────────────────────────────────────────────────");
}

/// Open the app data directory in the system file explorer
#[tauri::command]
pub fn open_app_data_dir(app_handle: AppHandle) -> Result<(), String> {
    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(app_data)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        opener::open(app_data).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_recording_files(paths: Vec<String>) -> Result<(), String> {
    for path in paths {
        if !path.is_empty() {
            let _ = std::fs::remove_file(&path);
        }
    }
    Ok(())
}
