use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::AppHandle;

use crate::transcription::{cleanup_old_recordings, save_audio_to_wav, transcribe_with_openai};
use crate::transcription_local;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionResponse {
    text: String,
    audio_path: String,
}

#[tauri::command]
pub async fn transcribe_audio(
    app_handle: AppHandle,
    audio_samples: Vec<i16>,
    sample_rate: u32,
    api_key: String,
    language: String,
    keep_last: usize,
    provider: Option<String>,
    local_model_size: Option<String>,
    dictionary: Option<String>,
    translate: Option<bool>,
) -> Result<TranscriptionResponse, String> {
    let translate = translate.unwrap_or(false);
    tracing::info!(
        "transcribe_audio called with {} samples at {} Hz (Provider: {:?}, Translate: {})",
        audio_samples.len(),
        sample_rate,
        provider,
        translate
    );

    let wav_path = save_audio_to_wav(&app_handle, &audio_samples, sample_rate)
        .map_err(|e| format!("Failed to save audio: {}", e))?;

    let dict = dictionary.as_deref().unwrap_or("");
    let effective_provider = provider.as_deref();

    let transcription_result = if effective_provider == Some("Local") {
        let model = local_model_size.unwrap_or_else(|| "base".to_string());
        transcription_local::transcribe_local(
            &app_handle,
            &audio_samples,
            sample_rate,
            &model,
            &language,
            dict,
            translate,
        )
        .await
        .map_err(|e| {
            tracing::error!("Local transcription failed: {}", e);
            format!("Local transcription failed: {}", e)
        })
    } else {
        transcribe_with_openai(&wav_path, &api_key, &language, dict, translate)
            .await
            .map_err(|e| {
                tracing::error!("Transcription failed: {}", e);
                format!("Transcription failed: {}", e)
            })
    };

    let transcription = transcription_result?;

    let _ = cleanup_old_recordings(&app_handle, keep_last);

    tracing::info!(
        "Transcription completed successfully: {} characters",
        transcription.len()
    );

    Ok(TranscriptionResponse {
        text: transcription,
        audio_path: wav_path.to_string_lossy().replace('\\', "/").to_string(),
    })
}

/// Load a recorded audio file and return its raw bytes for playback.
#[tauri::command]
pub fn load_recording(app_handle: AppHandle, audio_path: String) -> Result<Vec<u8>, String> {
    use tauri::Manager;

    let requested_path = PathBuf::from(&audio_path);

    // Allow access to any recording under app_data_dir/profiles/*/recordings/
    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {}", e))?;
    let profiles_dir = app_data.join("profiles");
    let canonical_profiles = profiles_dir
        .canonicalize()
        .unwrap_or(profiles_dir);

    let canonical_file = requested_path
        .canonicalize()
        .map_err(|e| format!("Audio not found: {}", e))?;

    if !canonical_file.starts_with(&canonical_profiles) {
        return Err("Audio file access denied.".to_string());
    }

    fs::read(&canonical_file).map_err(|e| format!("Unable to read audio: {}", e))
}
