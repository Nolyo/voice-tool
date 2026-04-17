use anyhow::{Context, Result, anyhow};
use chrono::Local;
use hound::{SampleFormat, WavSpec, WavWriter};
use reqwest::multipart;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const CHANNELS: u16 = 1;
const BITS_PER_SAMPLE: u16 = 16;

/// OpenAI Whisper API response
#[derive(Debug, Deserialize)]
struct WhisperResponse {
    text: String,
}

/// Get the recordings directory for the active profile, creating it if it doesn't exist
pub fn get_recordings_dir(app: &AppHandle) -> Result<PathBuf> {
    let profile_dir = crate::profiles::get_active_profile_dir(app)
        .context("Could not resolve active profile directory")?;
    let recordings_dir = profile_dir.join("recordings");

    if !recordings_dir.exists() {
        fs::create_dir_all(&recordings_dir)
            .context("Failed to create recordings directory")?;
    } else if !recordings_dir.is_dir() {
        return Err(anyhow!(
            "Recordings path exists but is not a directory: {}",
            recordings_dir.display()
        ));
    }

    Ok(recordings_dir)
}

/// Save audio samples to a WAV file in the active profile's recordings directory.
/// Returns the path to the created file.
pub fn save_audio_to_wav(app: &AppHandle, samples: &[i16], sample_rate: u32) -> Result<PathBuf> {
    let recordings_dir = get_recordings_dir(app)?;

    tracing::info!(
        "Saving {} audio samples to WAV at {} Hz",
        samples.len(),
        sample_rate
    );

    // Calculate duration
    let duration_seconds = samples.len() as f32 / sample_rate as f32;
    tracing::info!("Audio duration: {:.2} seconds", duration_seconds);

    // Calculate RMS to check if there's actual sound
    let rms: f32 = if samples.is_empty() {
        0.0
    } else {
        let sum: f64 = samples
            .iter()
            .map(|&s| {
                let normalized = s as f64 / 32768.0;
                normalized * normalized
            })
            .sum();
        ((sum / samples.len() as f64).sqrt() * 100.0) as f32
    };
    tracing::info!("Audio RMS level: {:.2}%", rms);

    if samples.is_empty() {
        return Err(anyhow!("No audio samples to save"));
    }

    // Warn if audio level is too low
    if rms < 0.5 {
        tracing::warn!(
            "Audio level is extremely low ({:.2}%). Transcription may fail",
            rms
        );
        tracing::warn!("Check your microphone settings and volume!");
    }

    // Use samples directly without amplification to avoid distortion
    // If volume is too low, user should adjust their microphone settings
    let final_samples = samples;

    // Generate filename with timestamp
    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S");
    let filename = format!("recording_{}.wav", timestamp);
    let wav_path = recordings_dir.join(filename);

    // Create WAV file
    let spec = WavSpec {
        channels: CHANNELS,
        sample_rate,
        bits_per_sample: BITS_PER_SAMPLE,
        sample_format: SampleFormat::Int,
    };

    let mut writer = WavWriter::create(&wav_path, spec).context("Failed to create WAV file")?;

    // Write samples directly (no amplification to avoid distortion)
    for &sample in final_samples {
        writer
            .write_sample(sample)
            .context("Failed to write audio sample")?;
    }

    writer.finalize().context("Failed to finalize WAV file")?;

    tracing::info!("Audio file saved successfully: {}", wav_path.display());
    Ok(wav_path)
}

/// Clean up old recording files in the active profile, keeping only the last N files
pub fn cleanup_old_recordings(app: &AppHandle, keep_last: usize) -> Result<()> {
    let recordings_dir = get_recordings_dir(app)?;

    // Get all WAV files with their metadata
    let mut files: Vec<(PathBuf, std::time::SystemTime)> = fs::read_dir(&recordings_dir)?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();

            // Only process WAV files
            if path.extension()?.to_str()? == "wav" {
                let metadata = entry.metadata().ok()?;
                let modified = metadata.modified().ok()?;
                Some((path, modified))
            } else {
                None
            }
        })
        .collect();

    // Sort by modification time (newest first)
    files.sort_by(|a, b| b.1.cmp(&a.1));

    // Delete files beyond keep_last
    for (path, _) in files.iter().skip(keep_last) {
        tracing::info!("Deleting old recording: {}", path.display());
        fs::remove_file(path).context(format!("Failed to delete file: {:?}", path))?;
    }

    Ok(())
}

/// Generic transcription over any OpenAI-compatible Whisper HTTP API.
///
/// Both OpenAI and Groq expose the exact same shape (multipart fields, Bearer auth,
/// JSON response). Only `base_url`, `model` and the provider label (used in logs/errors)
/// change between providers.
async fn transcribe_via_whisper_http(
    provider_label: &str,
    base_url: &str,
    model: &str,
    wav_path: &Path,
    api_key: &str,
    language: &str,
    dictionary: &str,
    translate: bool,
) -> Result<String> {
    tracing::info!("Reading audio file for transcription");
    let audio_bytes = fs::read(wav_path).context("Failed to read WAV file")?;

    let file_size_kb = audio_bytes.len() / 1024;
    tracing::info!("Audio file size: {} KB", file_size_kb);

    // Extract ISO-639-1 language code (first 2 characters)
    // "fr-FR" -> "fr", "en-US" -> "en"
    let lang_code = if language.len() >= 2 {
        &language[..2].to_lowercase()
    } else {
        language
    };

    let action = if translate { "translation" } else { "transcription" };
    tracing::info!(
        "Preparing {} request via {} (model: {}, language: {})",
        action,
        provider_label,
        model,
        lang_code
    );

    // Create multipart form
    let file_part = multipart::Part::bytes(audio_bytes)
        .file_name("audio.wav")
        .mime_str("audio/wav")?;

    let mut form = multipart::Form::new()
        .part("file", file_part)
        .text("model", model.to_string())
        .text("response_format", "json");

    // Only add language parameter for transcription (not for translation)
    if !translate {
        form = form.text("language", lang_code.to_string());
    }

    if !dictionary.is_empty() {
        form = form.text("prompt", dictionary.to_string());
    }

    let endpoint = if translate {
        format!("{}/audio/translations", base_url)
    } else {
        format!("{}/audio/transcriptions", base_url)
    };

    tracing::info!("Sending request to {} Whisper API...", provider_label);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .context("Failed to create HTTP client")?;

    let response = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                tracing::error!("Request timed out: {}", e);
                anyhow!("Request timed out. Check your internet connection or disable your VPN.")
            } else if e.is_connect() {
                tracing::error!("Connection error: {}", e);
                anyhow!(
                    "Cannot connect to {} API. Check your internet connection or disable your VPN.",
                    provider_label
                )
            } else if e.is_request() {
                tracing::error!("Request error: {}", e);
                anyhow!("Failed to send request. Check your network connection.")
            } else {
                tracing::error!("HTTP error: {}", e);
                anyhow!("Connection error: {}", e)
            }
        })?;

    tracing::info!(
        "Received response from {} (status: {})",
        provider_label,
        response.status()
    );

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        tracing::error!("{} API error {}: {}", provider_label, status, error_text);
        return Err(anyhow!(
            "{} API error {}: {}",
            provider_label,
            status,
            error_text
        ));
    }

    tracing::info!("Parsing transcription response...");
    let whisper_response: WhisperResponse = response
        .json()
        .await
        .context(format!("Failed to parse {} response", provider_label))?;

    tracing::info!(
        "Transcription text received ({} characters)",
        whisper_response.text.len()
    );
    Ok(whisper_response.text)
}

/// Transcribe audio file using OpenAI Whisper API
pub async fn transcribe_with_openai(
    wav_path: &Path,
    api_key: &str,
    language: &str,
    dictionary: &str,
    translate: bool,
) -> Result<String> {
    if api_key.is_empty() {
        return Err(anyhow!("OpenAI API key not configured"));
    }

    transcribe_via_whisper_http(
        "OpenAI",
        "https://api.openai.com/v1",
        "whisper-1",
        wav_path,
        api_key,
        language,
        dictionary,
        translate,
    )
    .await
}

/// Transcribe audio file using Groq's OpenAI-compatible Whisper endpoint.
/// Defaults to `whisper-large-v3-turbo` (fastest/cheapest) if `model` is empty.
pub async fn transcribe_with_groq(
    wav_path: &Path,
    api_key: &str,
    language: &str,
    dictionary: &str,
    translate: bool,
    model: &str,
) -> Result<String> {
    if api_key.is_empty() {
        return Err(anyhow!("Groq API key not configured"));
    }

    let effective_model = if model.is_empty() {
        "whisper-large-v3-turbo"
    } else {
        model
    };

    transcribe_via_whisper_http(
        "Groq",
        "https://api.groq.com/openai/v1",
        effective_model,
        wav_path,
        api_key,
        language,
        dictionary,
        translate,
    )
    .await
}
