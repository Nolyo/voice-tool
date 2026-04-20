use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::AppHandle;

use crate::audio_trim;
use crate::transcription::{
    cleanup_old_recordings, save_audio_to_wav, transcribe_with_groq, transcribe_with_openai,
};
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
    initial_prompt: Option<String>,
    translate: Option<bool>,
    keep_model_in_memory: Option<bool>,
    groq_model: Option<String>,
    trim_silence: Option<bool>,
) -> Result<TranscriptionResponse, String> {
    let translate = translate.unwrap_or(false);
    tracing::info!(
        "transcribe_audio called with {} samples at {} Hz (Provider: {:?}, Translate: {})",
        audio_samples.len(),
        sample_rate,
        provider,
        translate
    );

    let audio_samples = if trim_silence.unwrap_or(true) {
        let input_len = audio_samples.len();
        let result = audio_trim::trim_silence(&audio_samples, sample_rate);
        tracing::info!(
            "Silence trim: peak={:.4}, threshold={:.4}, -{}ms start, -{}ms end ({} → {} samples)",
            result.peak_rms,
            result.threshold,
            result.trimmed_start_ms,
            result.trimmed_end_ms,
            input_len,
            result.samples.len(),
        );
        result.samples
    } else {
        audio_samples
    };

    let wav_path = save_audio_to_wav(&app_handle, &audio_samples, sample_rate)
        .map_err(|e| format!("Failed to save audio: {}", e))?;

    let dict = dictionary.as_deref().unwrap_or("").trim();
    let prompt = initial_prompt.as_deref().unwrap_or("").trim();
    let combined_prompt = match (prompt.is_empty(), dict.is_empty()) {
        (false, false) => format!("{}\n\n{}", prompt, dict),
        (false, true) => prompt.to_string(),
        (true, false) => dict.to_string(),
        (true, true) => String::new(),
    };
    let effective_provider = provider.as_deref();

    let transcription_result = if effective_provider == Some("Local") {
        let model = local_model_size.unwrap_or_else(|| "base".to_string());
        transcription_local::transcribe_local(
            &app_handle,
            &audio_samples,
            sample_rate,
            &model,
            &language,
            &combined_prompt,
            translate,
            keep_model_in_memory,
        )
        .await
        .map_err(|e| {
            tracing::error!("Local transcription failed: {}", e);
            format!("Local transcription failed: {}", e)
        })
    } else if effective_provider == Some("Groq") {
        let model = groq_model.unwrap_or_else(|| "whisper-large-v3-turbo".to_string());
        transcribe_with_groq(
            &wav_path,
            &api_key,
            &language,
            &combined_prompt,
            translate,
            &model,
        )
        .await
        .map_err(|e| {
            tracing::error!("Groq transcription failed: {}", e);
            format!("Groq transcription failed: {}", e)
        })
    } else {
        transcribe_with_openai(&wav_path, &api_key, &language, &combined_prompt, translate)
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
