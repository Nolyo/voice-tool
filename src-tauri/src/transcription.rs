use anyhow::{Context, Result, anyhow};
use chrono::Local;
use hound::{SampleFormat, WavSpec, WavWriter};
use reqwest::multipart;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

const CHANNELS: u16 = 1;
const BITS_PER_SAMPLE: u16 = 16;

/// OpenAI Whisper API response
#[derive(Debug, Deserialize)]
struct WhisperResponse {
    text: String,
}

/// Get the recordings directory, creating it if it doesn't exist
pub fn get_recordings_dir() -> Result<PathBuf> {
    let app_data = std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .context("Could not find application data directory")?;

    let base_dir = PathBuf::from(&app_data).join("com.nolyo.voice-tool");
    let recordings_dir = base_dir.join("recordings");
    let legacy_dir = PathBuf::from(app_data)
        .join("voice-tool")
        .join("recordings");

    if !recordings_dir.exists() {
        fs::create_dir_all(&base_dir).with_context(|| {
            format!(
                "Failed to create application data directory: {}",
                base_dir.display()
            )
        })?;

        if legacy_dir.exists() && legacy_dir.is_dir() {
            match fs::rename(&legacy_dir, &recordings_dir) {
                Ok(_) => {
                    tracing::info!(
                        "Migrated recordings directory from legacy location: {} -> {}",
                        legacy_dir.display(),
                        recordings_dir.display()
                    );
                }
                Err(rename_err) => {
                    tracing::warn!(
                        "Failed to move legacy recordings directory: {} -> {} ({}). Falling back to copy.",
                        legacy_dir.display(),
                        recordings_dir.display(),
                        rename_err
                    );
                    fs::create_dir_all(&recordings_dir)
                        .context("Failed to create recordings directory")?;

                    if let Ok(entries) = fs::read_dir(&legacy_dir) {
                        for entry in entries.flatten() {
                            let src = entry.path();
                            let file_name = match src.file_name() {
                                Some(name) => name,
                                None => continue,
                            };
                            let dest = recordings_dir.join(file_name);
                            if dest.exists() {
                                continue;
                            }
                            if let Err(copy_err) = fs::copy(&src, &dest) {
                                tracing::warn!(
                                    "Failed to copy legacy recording {}: {}",
                                    src.display(),
                                    copy_err
                                );
                            }
                        }
                    }
                }
            }
        } else {
            fs::create_dir_all(&recordings_dir).context("Failed to create recordings directory")?;
        }
    } else if !recordings_dir.is_dir() {
        return Err(anyhow!(
            "Recordings path exists but is not a directory: {}",
            recordings_dir.display()
        ));
    }

    Ok(recordings_dir)
}

/// Save audio samples to a WAV file
/// Returns the path to the created file
pub fn save_audio_to_wav(samples: &[i16], sample_rate: u32) -> Result<PathBuf> {
    let recordings_dir = get_recordings_dir()?;

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

/// Clean up old recording files, keeping only the last N files
pub fn cleanup_old_recordings(keep_last: usize) -> Result<()> {
    let recordings_dir = get_recordings_dir()?;

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

/// Transcribe audio file using OpenAI Whisper API
pub async fn transcribe_with_openai(
    wav_path: &Path,
    api_key: &str,
    language: &str,
) -> Result<String> {
    if api_key.is_empty() {
        return Err(anyhow!("OpenAI API key not configured"));
    }

    tracing::info!("Reading audio file for transcription");
    // Read the audio file
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

    tracing::info!("Preparing transcription request (language: {})", lang_code);

    // Create multipart form
    let file_part = multipart::Part::bytes(audio_bytes)
        .file_name("audio.wav")
        .mime_str("audio/wav")?;

    let form = multipart::Form::new()
        .part("file", file_part)
        .text("model", "whisper-1")
        .text("language", lang_code.to_string())
        .text("response_format", "json");

    tracing::info!("Sending request to OpenAI Whisper API...");
    // Send request to OpenAI with timeout
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .context("Failed to create HTTP client")?;

    let response = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                tracing::error!("Request timed out: {}", e);
                anyhow!("Délai d'attente dépassé. Vérifiez votre connexion internet ou désactivez votre VPN.")
            } else if e.is_connect() {
                tracing::error!("Connection error: {}", e);
                anyhow!("Impossible de se connecter à l'API OpenAI. Vérifiez votre connexion internet ou désactivez votre VPN.")
            } else if e.is_request() {
                tracing::error!("Request error: {}", e);
                anyhow!("Erreur lors de l'envoi de la requête. Vérifiez votre connexion réseau.")
            } else {
                tracing::error!("HTTP error: {}", e);
                anyhow!("Erreur de connexion: {}", e)
            }
        })?;

    tracing::info!(
        "Received response from OpenAI (status: {})",
        response.status()
    );

    // Check for errors
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        tracing::error!("OpenAI API error {}: {}", status, error_text);
        return Err(anyhow!("OpenAI API error {}: {}", status, error_text));
    }

    tracing::info!("Parsing transcription response...");
    // Parse response
    let whisper_response: WhisperResponse = response
        .json()
        .await
        .context("Failed to parse OpenAI response")?;

    tracing::info!(
        "Transcription text received ({} characters)",
        whisper_response.text.len()
    );
    Ok(whisper_response.text)
}
