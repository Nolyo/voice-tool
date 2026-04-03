use anyhow::{Context, Result, anyhow};
use futures_util::StreamExt;
use reqwest::Client;
use std::cmp::min;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::AppState;

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

        let percentage = (downloaded as f64 / total_size as f64) * 100.0;
        let _ = app_handle.emit("model-download-progress", percentage);
    }

    tracing::info!("Model downloaded successfully to {:?}", target_path);
    Ok(target_path)
}

pub async fn transcribe_local<R: tauri::Runtime>(
    app: &AppHandle<R>,
    audio_samples: &[i16],
    sample_rate: u32,
    model_type: &str,
    language: &str,
    dictionary: &str,
) -> Result<String> {
    let model_path = get_model_path(model_type)?;

    if !model_path.exists() {
        return Err(anyhow!(
            "Modèle '{}' non téléchargé. Veuillez le télécharger depuis les paramètres (onglet API).",
            model_type
        ));
    }

    let state = app.state::<AppState>();
    let mut cache = state.whisper.cache.lock().await;

    // --- 1. Load or reuse context + state ---
    if cache.context.is_none() || cache.loaded_model != model_type {
        tracing::info!("Loading whisper model: {}", model_type);

        // Drop state before context (order matters for safety)
        cache.state = None;
        cache.context = None;

        let path_str = model_path.to_string_lossy().to_string();
        let ctx = WhisperContext::new_with_params(&path_str, WhisperContextParameters::default())
            .map_err(|e| anyhow!("Failed to load whisper model: {:?}", e))?;

        let whisper_state = ctx
            .create_state()
            .map_err(|e| anyhow!("Failed to create whisper state: {:?}", e))?;

        cache.context = Some(ctx);
        cache.state = Some(whisper_state);
        cache.loaded_model = model_type.to_string();

        tracing::info!("Whisper model loaded and state cached");
    } else {
        tracing::info!("Reusing cached whisper context + state");
    }

    // --- 2. Convert i16 → f32 ---
    let audio_f32: Vec<f32> = audio_samples.iter().map(|&s| s as f32 / 32768.0).collect();

    // --- 3. Resample to 16 kHz if needed ---
    let audio_16k = if sample_rate != 16000 {
        tracing::info!("Resampling audio from {} Hz to 16000 Hz", sample_rate);
        resample_to_16k(&audio_f32, sample_rate)?
    } else {
        audio_f32
    };

    // --- 4. Run inference ---
    let whisper_state = cache.state.as_mut().unwrap();

    let n_threads = num_cpus::get_physical() as i32;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

    let lang_code = if language.len() >= 2 {
        &language[..2]
    } else {
        language
    };
    params.set_language(Some(lang_code));
    params.set_n_threads(n_threads);
    params.set_print_realtime(false);
    params.set_print_progress(false);
    params.set_print_timestamps(false);
    if !dictionary.is_empty() {
        params.set_initial_prompt(dictionary);
    }

    tracing::info!("Running whisper inference with {} threads", n_threads);

    whisper_state
        .full(params, &audio_16k)
        .map_err(|e| anyhow!("Whisper inference failed: {:?}", e))?;

    let n = whisper_state
        .full_n_segments()
        .map_err(|e| anyhow!("Failed to get segment count: {:?}", e))?;

    let mut text = String::new();
    for i in 0..n {
        let segment = whisper_state
            .full_get_segment_text(i)
            .map_err(|e| anyhow!("Failed to get segment {}: {:?}", i, e))?;
        text.push_str(segment.trim());
        text.push(' ');
    }

    let result = text.trim().to_string();
    tracing::info!("Local transcription completed: {} characters", result.len());
    Ok(result)
}

fn resample_to_16k(audio: &[f32], from_rate: u32) -> Result<Vec<f32>> {
    use rubato::{
        Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
    };

    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: WindowFunction::BlackmanHarris2,
    };

    let ratio = 16000.0 / from_rate as f64;
    let mut resampler = SincFixedIn::<f32>::new(ratio, 2.0, params, audio.len(), 1)
        .map_err(|e| anyhow!("Failed to create resampler: {:?}", e))?;

    let waves_in = vec![audio.to_vec()];
    let waves_out = resampler
        .process(&waves_in, None)
        .map_err(|e| anyhow!("Resampling failed: {:?}", e))?;

    Ok(waves_out.into_iter().next().unwrap_or_default())
}
