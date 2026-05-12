use anyhow::{Context, Result, anyhow};
use chrono::Local;
use hound::{SampleFormat, WavSpec, WavWriter};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

const CHANNELS: u16 = 1;
const BITS_PER_SAMPLE: u16 = 16;

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
