use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreBuilder;

const MAX_LOGS: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppLog {
    pub id: String,
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

fn get_logs_path(app_handle: &AppHandle) -> Result<PathBuf> {
    let app_data = app_handle
        .path()
        .app_data_dir()
        .context("Could not resolve app data directory")?;
    let dir = app_data.join("logs");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .with_context(|| format!("Failed to create logs directory: {}", dir.display()))?;
    }
    Ok(dir.join("logs.json"))
}

fn read_logs_from_file(path: &PathBuf) -> Vec<AppLog> {
    if !path.exists() {
        return Vec::new();
    }
    match fs::read_to_string(path) {
        Ok(content) => match serde_json::from_str::<Vec<AppLog>>(&content) {
            Ok(logs) => logs,
            Err(e) => {
                tracing::warn!("Corrupt logs file, returning empty array: {}", e);
                Vec::new()
            }
        },
        Err(e) => {
            tracing::warn!("Failed to read logs file: {}", e);
            Vec::new()
        }
    }
}

/// Remove legacy app_logs key from the active profile's settings.json if present.
pub fn cleanup_legacy_logs(app_handle: &AppHandle) -> Result<()> {
    let store = StoreBuilder::new(app_handle, crate::profiles::settings_store_path(app_handle)).build()?;
    if store.has("app_logs") {
        store.delete("app_logs");
        let _ = store.save();
        tracing::info!("Removed legacy app_logs from settings.json");
    }
    Ok(())
}

#[tauri::command]
pub async fn list_logs(app_handle: AppHandle) -> Result<Vec<AppLog>, String> {
    let path = get_logs_path(&app_handle).map_err(|e| e.to_string())?;
    Ok(read_logs_from_file(&path))
}

#[tauri::command]
pub async fn save_log(app_handle: AppHandle, log: AppLog) -> Result<(), String> {
    let path = get_logs_path(&app_handle).map_err(|e| e.to_string())?;
    let mut logs = read_logs_from_file(&path);
    logs.push(log);

    // Enforce cap
    if logs.len() > MAX_LOGS {
        let drain_count = logs.len() - MAX_LOGS;
        logs.drain(..drain_count);
    }

    let json = serde_json::to_string_pretty(&logs).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn clear_logs(app_handle: AppHandle) -> Result<(), String> {
    let path = get_logs_path(&app_handle).map_err(|e| e.to_string())?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
