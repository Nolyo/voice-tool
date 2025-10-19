use anyhow::{anyhow, Context, Result};
use hound::{SampleFormat, WavSpec, WavWriter};
use reqwest::multipart;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use chrono::Local;

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

    let recordings_dir = PathBuf::from(app_data).join("voice-tool").join("recordings");

    if !recordings_dir.exists() {
        fs::create_dir_all(&recordings_dir)
            .context("Failed to create recordings directory")?;
    }

    Ok(recordings_dir)
}

/// Save audio samples to a WAV file
/// Returns the path to the created file
pub fn save_audio_to_wav(samples: &[i16], sample_rate: u32) -> Result<PathBuf> {
    let recordings_dir = get_recordings_dir()?;

    println!("Saving {} audio samples to WAV at {} Hz", samples.len(), sample_rate);

    // Calculate duration
    let duration_seconds = samples.len() as f32 / sample_rate as f32;
    println!("Audio duration: {:.2} seconds", duration_seconds);

    // Calculate RMS to check if there's actual sound
    let rms: f32 = if samples.is_empty() {
        0.0
    } else {
        let sum: f64 = samples.iter().map(|&s| {
            let normalized = s as f64 / 32768.0;
            normalized * normalized
        }).sum();
        ((sum / samples.len() as f64).sqrt() * 100.0) as f32
    };
    println!("Audio RMS level: {:.2}%", rms);

    if samples.is_empty() {
        return Err(anyhow!("No audio samples to save"));
    }

    // Warn if audio level is too low
    if rms < 0.5 {
        println!("WARNING: Audio level is extremely low ({:.2}%). Transcription may fail.", rms);
        println!("Check your microphone settings and volume!");
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

    let mut writer = WavWriter::create(&wav_path, spec)
        .context("Failed to create WAV file")?;

    // Write samples directly (no amplification to avoid distortion)
    for &sample in final_samples {
        writer.write_sample(sample)
            .context("Failed to write audio sample")?;
    }

    writer.finalize()
        .context("Failed to finalize WAV file")?;

    println!("Saved audio to: {:?}", wav_path);
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
        println!("Deleting old recording: {:?}", path);
        fs::remove_file(path)
            .context(format!("Failed to delete file: {:?}", path))?;
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

    // Read the audio file
    let audio_bytes = fs::read(wav_path)
        .context("Failed to read WAV file")?;

    // Extract ISO-639-1 language code (first 2 characters)
    // "fr-FR" -> "fr", "en-US" -> "en"
    let lang_code = if language.len() >= 2 {
        &language[..2].to_lowercase()
    } else {
        language
    };

    // Create multipart form
    let file_part = multipart::Part::bytes(audio_bytes)
        .file_name("audio.wav")
        .mime_str("audio/wav")?;

    let form = multipart::Form::new()
        .part("file", file_part)
        .text("model", "whisper-1")
        .text("language", lang_code.to_string())
        .text("response_format", "json");

    // Send request to OpenAI
    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await
        .context("Failed to send request to OpenAI")?;

    // Check for errors
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(anyhow!("OpenAI API error {}: {}", status, error_text));
    }

    // Parse response
    let whisper_response: WhisperResponse = response.json().await
        .context("Failed to parse OpenAI response")?;

    Ok(whisper_response.text)
}
