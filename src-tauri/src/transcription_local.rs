use anyhow::{Context, Result, anyhow};
use futures_util::StreamExt;
use reqwest::Client;
use std::cmp::min;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;

/// Get the models directory, creating it if it doesn't exist
pub fn get_models_dir() -> Result<PathBuf> {
    let app_data = std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .context("Could not find application data directory")?;

    let models_dir = PathBuf::from(&app_data)
        .join("com.nolyo.voice-tool")
        .join("models");

    if !models_dir.exists() {
        fs::create_dir_all(&models_dir).context("Failed to create models directory")?;
    }

    Ok(models_dir)
}

pub fn get_model_filename(model_type: &str) -> String {
    format!("ggml-{}.bin", model_type.to_lowercase())
}

pub fn get_model_path(model_type: &str) -> Result<PathBuf> {
    let dir = get_models_dir()?;
    Ok(dir.join(get_model_filename(model_type)))
}

pub fn check_model_exists(model_type: &str) -> bool {
    if let Ok(path) = get_model_path(model_type) {
        path.exists()
    } else {
        false
    }
}

/// Delete a downloaded model to free disk space
pub fn delete_model(model_type: &str) -> Result<()> {
    let path = get_model_path(model_type)?;
    if path.exists() {
        fs::remove_file(&path).context("Failed to delete model file")?;
        tracing::info!("Model {} deleted successfully", model_type);
        Ok(())
    } else {
        Err(anyhow!("Model file not found: {:?}", path))
    }
}

pub async fn download_model<R: tauri::Runtime>(
    app_handle: AppHandle<R>,
    model_type: String,
) -> Result<PathBuf> {
    let model_filename = get_model_filename(&model_type);
    let target_path = get_model_path(&model_type)?;

    // Check if duplicate download
    if target_path.exists() {
        return Ok(target_path);
    }

    let url = format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}",
        model_filename
    );

    tracing::info!("Downloading model {} from {}", model_type, url);

    let client = Client::new();
    let res = client
        .get(&url)
        .send()
        .await
        .context("Failed to start download")?;

    let total_size = res
        .content_length()
        .ok_or_else(|| anyhow!("Failed to get content length"))?;

    let mut file = File::create(&target_path).context("Failed to create model file")?;
    let mut downloaded: u64 = 0;
    let mut stream = res.bytes_stream();

    while let Some(item) = stream.next().await {
        let chunk = item.context("Error while downloading chunk")?;
        file.write_all(&chunk).context("Error writing to file")?;

        let new = min(downloaded + (chunk.len() as u64), total_size);
        downloaded = new;

        // Calculate percentage
        let percentage = (downloaded as f64 / total_size as f64) * 100.0;

        // Emit progress
        let _ = app_handle.emit("model-download-progress", percentage);
    }

    tracing::info!("Model downloaded successfully to {:?}", target_path);
    Ok(target_path)
}

pub async fn transcribe_local<R: tauri::Runtime>(
    app: &AppHandle<R>,
    wav_path: &Path,
    model_type: &str,
    _language: &str,
) -> Result<String> {
    let model_path = get_model_path(model_type)?;

    if !model_path.exists() {
        return Err(anyhow!("Model file not found: {:?}", model_path));
    }

    tracing::info!("Starting sidecar transcription...");
    tracing::info!("WAV: {:?}", wav_path);
    tracing::info!("Model: {:?}", model_path);

    // Call the sidecar "whisper-cli"
    // Arguments for whisper.cpp main example (which we renamed to whisper-cli):
    // -m model_path -f wav_path -otxt (output text to stdout/file) or just capture stdout
    // Standard basic usage: main -m model.bin -f file.wav -nt (no timestamp)

    let model_path_str = model_path.to_string_lossy();
    let wav_path_str = wav_path.to_string_lossy();

    let output = app
        .shell()
        .sidecar("whisper-cli")?
        .args([
            "-m",
            &model_path_str,
            "-f",
            &wav_path_str,
            "--no-timestamps", // -nt
            "--language",
            "auto", // or pass lang
        ])
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::error!("Sidecar failed: {}", stderr);
        return Err(anyhow!("Sidecar execution failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim().to_string();

    tracing::info!("Sidecar output captured ({} chars)", trimmed.len());

    Ok(trimmed)
}
