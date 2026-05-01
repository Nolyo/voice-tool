use anyhow::{Context, Result, anyhow};
use futures_util::StreamExt;
use reqwest::Client;
use std::cmp::min;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::state::AppState;

/// Core path logic: models dir is always `<base>/models`. Extracted for testability.
fn models_dir_from_base(base: PathBuf) -> Result<PathBuf> {
    let models_dir = base.join("models");
    if !models_dir.exists() {
        fs::create_dir_all(&models_dir).context("Failed to create models directory")?;
    }
    Ok(models_dir)
}

/// Get the models directory, creating it if it doesn't exist
pub fn get_models_dir<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    let base = app
        .path()
        .app_data_dir()
        .context("Could not determine app data directory")?;
    models_dir_from_base(base)
}

pub fn get_model_filename(model_type: &str) -> String {
    format!("ggml-{}.bin", model_type.to_lowercase())
}

pub fn get_model_path<R: tauri::Runtime>(app: &AppHandle<R>, model_type: &str) -> Result<PathBuf> {
    let dir = get_models_dir(app)?;
    Ok(dir.join(get_model_filename(model_type)))
}

pub fn check_model_exists<R: tauri::Runtime>(app: &AppHandle<R>, model_type: &str) -> bool {
    if let Ok(path) = get_model_path(app, model_type) {
        path.exists()
    } else {
        false
    }
}

/// True if at least one ggml-*.bin file exists in the models directory.
pub fn any_model_exists<R: tauri::Runtime>(app: &AppHandle<R>) -> bool {
    let Ok(dir) = get_models_dir(app) else {
        return false;
    };
    let Ok(entries) = fs::read_dir(&dir) else {
        return false;
    };
    entries.flatten().any(|e| {
        let name = e.file_name();
        let name = name.to_string_lossy();
        name.starts_with("ggml-") && name.ends_with(".bin")
    })
}

/// Delete a downloaded model to free disk space
pub fn delete_model<R: tauri::Runtime>(app: &AppHandle<R>, model_type: &str) -> Result<()> {
    let path = get_model_path(app, model_type)?;
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
    let target_path = get_model_path(&app_handle, &model_type)?;

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
    translate: bool,
    keep_model_in_memory: Option<bool>,
) -> Result<String> {
    let model_path = get_model_path(app, model_type)?;

    if !model_path.exists() {
        return Err(anyhow!(
            "Model '{}' not downloaded. Please download it from settings (API tab).",
            model_type
        ));
    }

    let state = app.state::<AppState>();
    let mut cache = state.whisper.cache.lock().await;

    // Cancel any pending auto-unload timer
    if let Some(handle) = cache.unload_handle.take() {
        handle.abort();
    }

    // --- 1. Load or reuse context + state ---
    if cache.context.is_none() || cache.loaded_model != model_type {
        tracing::info!("Loading whisper model: {}", model_type);

        // Drop state before context (order matters for safety)
        cache.state = None;
        cache.context = None;

        let path_str = model_path.to_string_lossy().to_string();
        let (ctx, is_gpu) = load_whisper_context(&path_str)?;

        let whisper_state = ctx
            .create_state()
            .map_err(|e| anyhow!("Failed to create whisper state: {:?}", e))?;

        cache.context = Some(ctx);
        cache.state = Some(whisper_state);
        cache.loaded_model = model_type.to_string();
        cache.is_gpu = is_gpu;

        tracing::info!(
            "Whisper model loaded and state cached (gpu={})",
            cache.is_gpu
        );
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

    let source_lang = if language.len() >= 2 {
        &language[..2]
    } else {
        language
    };
    // Whisper translate is hardcoded to English. Per the official whisper-rs
    // example, pass "en" as the language when translating; otherwise pass the
    // source language for pure transcription.
    let effective_lang = if translate { "en" } else { source_lang };
    params.set_language(Some(effective_lang));
    params.set_n_threads(n_threads);
    params.set_print_realtime(false);
    params.set_print_progress(false);
    params.set_print_timestamps(false);
    // Reduce stray leading punctuation/non-speech artifacts, most visible in EN.
    params.set_suppress_blank(true);
    params.set_suppress_nst(true);
    if translate {
        params.set_translate(true);
        if !dictionary.is_empty() {
            tracing::info!(
                "Translate mode enabled: ignoring initial_prompt to avoid source-language bias"
            );
        }
    } else if !dictionary.is_empty() {
        params.set_initial_prompt(dictionary);
    }

    tracing::info!(
        "Running whisper inference (threads={}, translate={}, language={})",
        n_threads,
        translate,
        effective_lang
    );

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

    // Whisper sometimes emits a stray leading punctuation token (observed
    // mainly in English output). Strip any leading whitespace + punctuation.
    let result: String = text
        .trim_start_matches(|c: char| {
            c.is_whitespace() || matches!(c, '.' | ',' | '!' | '?' | ';' | ':')
        })
        .trim_end()
        .to_string();
    tracing::info!("Local transcription completed: {} characters", result.len());

    // --- 5. Schedule auto-unload if needed ---
    // Default: keep in memory on GPU, auto-unload on CPU
    let should_keep = keep_model_in_memory.unwrap_or(cache.is_gpu);
    if !should_keep {
        let whisper_cache = Arc::clone(&state.whisper.cache);
        let handle = tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(120)).await;
            let mut c = whisper_cache.lock().await;
            c.state = None;
            c.context = None;
            c.loaded_model.clear();
            tracing::info!("Whisper model auto-unloaded after 2 minutes of inactivity");
        });
        cache.unload_handle = Some(handle);
    }

    Ok(result)
}

/// Preload the Whisper model in background if Local provider is configured
pub fn preload_if_configured(app: &mut tauri::App) {
    use tauri_plugin_store::StoreBuilder;

    let preload_handle = app.handle().clone();
    let preload_store = match StoreBuilder::new(app, crate::profiles::settings_store_path(&preload_handle)).build() {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("Failed to load store for whisper preload: {}", e);
            return;
        }
    };

    tauri::async_runtime::spawn(async move {
        let settings_obj = preload_store
            .get("settings")
            .and_then(|root| root.get("settings").cloned());

        let provider = settings_obj
            .as_ref()
            .and_then(|s| {
                s.get("transcription_provider")
                    .and_then(|v| v.as_str().map(String::from))
            });

        let model_size = settings_obj
            .as_ref()
            .and_then(|s| {
                s.get("local_model_size")
                    .and_then(|v| v.as_str().map(String::from))
            })
            .unwrap_or_else(|| "base".to_string());

        let keep_model_in_memory = settings_obj
            .as_ref()
            .and_then(|s| {
                s.get("keep_model_in_memory")
                    .and_then(|v| v.as_bool())
            });

        if provider.as_deref() != Some("Local") {
            tracing::info!("Skipping whisper preload (provider is not Local)");
            return;
        }

        if !check_model_exists(&preload_handle, &model_size) {
            tracing::info!(
                "Skipping whisper preload (model '{}' not downloaded)",
                model_size
            );
            return;
        }

        // If keep_model_in_memory is explicitly false, skip preload
        if keep_model_in_memory == Some(false) {
            tracing::info!("Skipping whisper preload (keep_model_in_memory is disabled)");
            return;
        }

        tracing::info!("Preloading whisper model: {}", model_size);

        let state = preload_handle.state::<AppState>();
        let mut cache = state.whisper.cache.lock().await;

        if let Ok(model_path) = get_model_path(&preload_handle, &model_size) {
            let path_str = model_path.to_string_lossy().to_string();
            match load_whisper_context(&path_str) {
                Ok((ctx, is_gpu)) => {
                    // If setting is not set (None) and we fell back to CPU, skip preload
                    if !is_gpu && keep_model_in_memory.is_none() {
                        tracing::info!(
                            "Skipping whisper preload (GPU unavailable and keep_model_in_memory not set — would waste RAM)"
                        );
                        return;
                    }
                    match ctx.create_state() {
                        Ok(whisper_state) => {
                            cache.context = Some(ctx);
                            cache.state = Some(whisper_state);
                            cache.loaded_model = model_size.clone();
                            cache.is_gpu = is_gpu;
                            tracing::info!(
                                "Whisper model '{}' preloaded successfully (gpu={})",
                                model_size,
                                is_gpu
                            );
                        }
                        Err(e) => {
                            tracing::warn!(
                                "Failed to create whisper state during preload: {:?}",
                                e
                            );
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to preload whisper model: {:?}", e);
                }
            }
        }
    });
}

/// Try to create a WhisperContext with GPU acceleration; fall back to CPU if initialization fails.
/// Returns (context, is_gpu).
fn load_whisper_context(path_str: &str) -> Result<(WhisperContext, bool)> {
    let params = WhisperContextParameters::default();
    let gpu_enabled = params.use_gpu;

    match WhisperContext::new_with_params(path_str, params) {
        Ok(ctx) => {
            tracing::info!("Whisper context loaded (gpu={})", gpu_enabled);
            Ok((ctx, gpu_enabled))
        }
        Err(e) if gpu_enabled => {
            tracing::warn!(
                "GPU initialization failed ({:?}), retrying with CPU only",
                e
            );
            let mut cpu_params = WhisperContextParameters::default();
            cpu_params.use_gpu(false);
            let ctx = WhisperContext::new_with_params(path_str, cpu_params)
                .map_err(|e| anyhow!("Failed to load whisper model: {:?}", e))?;
            Ok((ctx, false))
        }
        Err(e) => Err(anyhow!("Failed to load whisper model: {:?}", e)),
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn models_dir_is_under_app_data_dir() {
        let base = std::env::temp_dir().join("lexena-test-models-dir-nol53");
        let _ = fs::remove_dir_all(&base);

        let result = models_dir_from_base(base.clone()).expect("models_dir_from_base failed");

        assert_eq!(result, base.join("models"));
        assert!(result.exists(), "models dir should have been created");

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn models_dir_from_base_is_idempotent() {
        let base = std::env::temp_dir().join("lexena-test-models-dir-nol53-idem");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("models")).unwrap();

        let result = models_dir_from_base(base.clone());
        assert!(result.is_ok(), "should succeed even if dir already exists");

        let _ = fs::remove_dir_all(&base);
    }
}
