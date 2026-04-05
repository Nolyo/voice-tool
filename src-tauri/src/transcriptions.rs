use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreBuilder;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcription {
    pub id: String,
    pub date: String,
    pub time: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    #[serde(default)]
    pub is_streaming: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_cost: Option<f64>,
}

fn get_transcriptions_dir(app_handle: &AppHandle) -> Result<PathBuf> {
    let app_data = app_handle
        .path()
        .app_data_dir()
        .context("Could not resolve app data directory")?;
    let dir = app_data.join("transcriptions");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .with_context(|| format!("Failed to create transcriptions directory: {}", dir.display()))?;
    }
    Ok(dir)
}

/// Remove legacy transcription_history key from settings.json if present.
pub fn cleanup_legacy_transcriptions(app_handle: &AppHandle) -> Result<()> {
    let store = StoreBuilder::new(app_handle, "settings.json").build()?;
    if store.has("transcription_history") {
        store.delete("transcription_history");
        let _ = store.save();
        tracing::info!("Removed legacy transcription_history from settings.json");
    }
    Ok(())
}

#[tauri::command]
pub async fn list_transcriptions(app_handle: AppHandle) -> Result<Vec<Transcription>, String> {
    let dir = get_transcriptions_dir(&app_handle).map_err(|e| e.to_string())?;

    let mut transcriptions: Vec<Transcription> = Vec::new();

    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(t) = serde_json::from_str::<Transcription>(&content) {
                transcriptions.push(t);
            }
        }
    }

    // Sort by date + time descending (most recent first)
    transcriptions.sort_by(|a, b| {
        let dt_a = format!("{} {}", a.date, a.time);
        let dt_b = format!("{} {}", b.date, b.time);
        dt_b.cmp(&dt_a)
    });

    Ok(transcriptions)
}

#[tauri::command]
pub async fn save_transcription(
    app_handle: AppHandle,
    transcription: Transcription,
) -> Result<(), String> {
    let dir = get_transcriptions_dir(&app_handle).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.json", transcription.id));
    let json = serde_json::to_string_pretty(&transcription).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_transcription(
    app_handle: AppHandle,
    id: String,
) -> Result<(), String> {
    let dir = get_transcriptions_dir(&app_handle).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.json", id));

    // Read audio path before deleting
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(t) = serde_json::from_str::<Transcription>(&content) {
            if let Some(audio_path) = t.audio_path {
                let _ = fs::remove_file(&audio_path);
            }
        }
    }

    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn clear_transcriptions(app_handle: AppHandle) -> Result<(), String> {
    let dir = get_transcriptions_dir(&app_handle).map_err(|e| e.to_string())?;

    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(t) = serde_json::from_str::<Transcription>(&content) {
                if let Some(audio_path) = t.audio_path {
                    let _ = fs::remove_file(&audio_path);
                }
            }
        }
        let _ = fs::remove_file(&path);
    }

    Ok(())
}

#[tauri::command]
pub async fn update_transcription(
    app_handle: AppHandle,
    transcription: Transcription,
) -> Result<(), String> {
    save_transcription(app_handle, transcription).await
}
