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
    /// Vendor used for transcription ("OpenAI", "Groq", "Local", "Google").
    /// Absent on records created before this field existed.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub transcription_provider: Option<String>,
    /// Raw Whisper output before post-process. Present only when post-process
    /// actually modified the transcription, so old records remain unaffected.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub original_text: Option<String>,
    /// Mode applied by the post-process step (e.g. "auto", "list", "email").
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub post_process_mode: Option<String>,
    /// USD cost of the post-process LLM call, separate from `api_cost` (Whisper).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub post_process_cost: Option<f64>,
}

fn get_transcriptions_dir(app_handle: &AppHandle) -> Result<PathBuf> {
    let profile_dir = crate::profiles::get_active_profile_dir(app_handle)
        .context("Could not resolve active profile directory")?;
    let dir = profile_dir.join("transcriptions");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .with_context(|| format!("Failed to create transcriptions directory: {}", dir.display()))?;
    }
    Ok(dir)
}

/// Remove legacy transcription_history key from the active profile's settings.json if present.
pub fn cleanup_legacy_transcriptions(app_handle: &AppHandle) -> Result<()> {
    let store = StoreBuilder::new(app_handle, crate::profiles::settings_store_path(app_handle)).build()?;
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
    history_keep_last: Option<usize>,
) -> Result<(), String> {
    let dir = get_transcriptions_dir(&app_handle).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.json", transcription.id));
    let json = serde_json::to_string_pretty(&transcription).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    if let Some(keep) = history_keep_last {
        if let Err(err) = cleanup_old_transcriptions(&app_handle, keep) {
            tracing::warn!("History cleanup failed: {}", err);
        }
    }
    Ok(())
}

/// Remove oldest transcription JSONs beyond `keep_last`, deleting the
/// matching WAV alongside each purged record. Silent on individual file errors.
pub fn cleanup_old_transcriptions(app_handle: &AppHandle, keep_last: usize) -> Result<()> {
    let dir = get_transcriptions_dir(app_handle)?;

    let mut entries: Vec<(PathBuf, String)> = fs::read_dir(&dir)?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                return None;
            }
            let content = fs::read_to_string(&path).ok()?;
            let t: Transcription = serde_json::from_str(&content).ok()?;
            let dt = format!("{} {}", t.date, t.time);
            Some((path, dt))
        })
        .collect();

    // Newest first — identical ordering to list_transcriptions.
    entries.sort_by(|a, b| b.1.cmp(&a.1));

    for (path, _) in entries.iter().skip(keep_last) {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(t) = serde_json::from_str::<Transcription>(&content) {
                if let Some(audio_path) = t.audio_path {
                    let _ = fs::remove_file(&audio_path);
                }
            }
        }
        if let Err(err) = fs::remove_file(path) {
            tracing::warn!("Failed to purge transcription {}: {}", path.display(), err);
        } else {
            tracing::info!("Purged old transcription: {}", path.display());
        }
    }

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
    save_transcription(app_handle, transcription, None).await
}

const ALLOWED_EXPORT_EXTS: &[&str] = &["txt", "md", "json", "csv"];

/// Export the supplied payload to the OS Downloads folder.
///
/// Filename is sanitized (no traversal, no separators, no NUL) and the
/// extension must be in the whitelist above. Returns the absolute path
/// written, so the frontend can offer to reveal it.
#[tauri::command]
pub async fn export_transcriptions(
    app: AppHandle,
    payload: String,
    suggested_filename: String,
) -> Result<String, String> {
    if suggested_filename.is_empty() {
        return Err("empty filename".into());
    }
    if suggested_filename.contains("..")
        || suggested_filename.contains('/')
        || suggested_filename.contains('\\')
        || suggested_filename.contains('\0')
    {
        return Err("invalid filename".into());
    }
    let ext_ok = ALLOWED_EXPORT_EXTS
        .iter()
        .any(|e| suggested_filename.to_lowercase().ends_with(&format!(".{}", e)));
    if !ext_ok {
        return Err(format!(
            "filename must end with one of: {}",
            ALLOWED_EXPORT_EXTS
                .iter()
                .map(|e| format!(".{}", e))
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }

    let downloads = app
        .path()
        .download_dir()
        .map_err(|e| format!("cannot resolve download dir: {}", e))?;
    if !downloads.exists() {
        fs::create_dir_all(&downloads)
            .map_err(|e| format!("cannot create download dir: {}", e))?;
    }
    let path = downloads.join(&suggested_filename);
    fs::write(&path, payload.as_bytes())
        .map_err(|e| format!("cannot write export: {}", e))?;
    tracing::info!("transcription export written: {}", path.display());
    Ok(path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn export_extension_whitelist_blocks_unknown() {
        let exts = super::ALLOWED_EXPORT_EXTS;
        for bad in ["history.exe", "history.sh", "history.zip", "history"] {
            let ok = exts
                .iter()
                .any(|e| bad.to_lowercase().ends_with(&format!(".{}", e)));
            assert!(!ok, "{} should not be allowed", bad);
        }
        for good in ["history.txt", "history.md", "history.json", "history.csv"] {
            let ok = exts
                .iter()
                .any(|e| good.to_lowercase().ends_with(&format!(".{}", e)));
            assert!(ok, "{} should be allowed", good);
        }
    }

    #[test]
    fn export_filename_traversal_chars_are_listed() {
        let bad = ["../escape.txt", "sub/file.txt", "weird\\path.csv", "nul\0.md"];
        for f in bad {
            assert!(
                f.contains("..") || f.contains('/') || f.contains('\\') || f.contains('\0'),
                "{} should trip the guard",
                f
            );
        }
    }
}
