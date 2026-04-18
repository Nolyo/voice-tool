use std::fs;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub const RESET_CONFIRMATION_PHRASE: &str = "EFFACER TOUTES MES DONNÉES";

/// Wipe every entry under the application's app_data_dir, then restart the
/// process. The frontend must collect a typed confirmation phrase from the
/// user; the same phrase is verified server-side as defense in depth.
#[tauri::command]
pub async fn reset_app_data(app_handle: AppHandle, confirmation: String) -> Result<(), String> {
    if confirmation != RESET_CONFIRMATION_PHRASE {
        tracing::warn!("reset_app_data refused: confirmation phrase mismatch");
        return Err("Confirmation phrase mismatch".to_string());
    }

    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {}", e))?;

    tracing::warn!("Resetting all app data at {}", app_data.display());

    if app_data.exists() {
        let entries = fs::read_dir(&app_data)
            .map_err(|e| format!("Failed to read app data directory: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            let result = if path.is_dir() {
                fs::remove_dir_all(&path)
            } else {
                fs::remove_file(&path)
            };

            if let Err(e) = result {
                tracing::warn!("Failed to remove {}: {}", path.display(), e);
            }
        }
    }

    tracing::info!("App data wiped, scheduling restart");

    // Give the frontend a moment to acknowledge the IPC reply before we
    // tear the process down. Restart from a background thread so the
    // current command can return cleanly first.
    let handle = app_handle.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(200));
        handle.restart();
    });

    Ok(())
}
