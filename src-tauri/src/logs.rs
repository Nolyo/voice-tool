use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreBuilder;

const MAX_LOGS: usize = 500;

/// Serializes concurrent writes to `logs.json` so tracing events firing from
/// multiple threads don't clobber each other.
static LOGS_FILE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppLog {
    pub id: String,
    pub timestamp: String,
    pub level: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
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

/// Append a log to disk with the usual cap enforcement. Used by the tracing
/// layer so every log (including those emitted during `setup()` before the
/// webview exists) is persisted.
pub fn append_log(app_handle: &AppHandle, log: AppLog) -> Result<()> {
    let path = get_logs_path(app_handle)?;
    let _guard = LOGS_FILE_LOCK.lock().unwrap_or_else(|p| p.into_inner());

    let mut logs = read_logs_from_file(&path);
    logs.push(log);

    if logs.len() > MAX_LOGS {
        let drain_count = logs.len() - MAX_LOGS;
        logs.drain(..drain_count);
    }

    let json = serde_json::to_string_pretty(&logs)
        .context("Failed to serialize logs")?;
    fs::write(&path, json)
        .with_context(|| format!("Failed to write logs file: {}", path.display()))?;
    Ok(())
}

#[tauri::command]
pub async fn save_log(app_handle: AppHandle, log: AppLog) -> Result<(), String> {
    append_log(&app_handle, log).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_logs(app_handle: AppHandle) -> Result<(), String> {
    let path = get_logs_path(&app_handle).map_err(|e| e.to_string())?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
