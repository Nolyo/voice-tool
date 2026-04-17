use tauri::{AppHandle, Emitter, State};

use crate::audio::{AudioDeviceInfo, AudioRecorder, RecordingResult};
use crate::hotkeys::{register_cancel_shortcut, unregister_cancel_shortcut};
use crate::state::AppState;

/// Get list of available audio input devices
#[tauri::command]
pub fn get_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    AudioRecorder::get_input_devices().map_err(|e| e.to_string())
}

/// Start recording audio from the specified device
#[tauri::command]
pub fn start_recording(
    state: State<AppState>,
    app_handle: AppHandle,
    device_index: Option<usize>,
) -> Result<(), String> {
    tracing::info!(
        "Starting audio recording (device_index: {:?})",
        device_index
    );
    let mut recorder = state.inner().audio_recorder.lock().unwrap();
    let result = recorder
        .start_recording(device_index, app_handle.clone())
        .map_err(|e| {
            tracing::error!("Failed to start recording: {}", e);
            e.to_string()
        });

    let _ = app_handle.emit("recording-state", true);

    if result.is_ok() {
        register_cancel_shortcut(&app_handle);
    }

    result
}

/// Stop recording and return the audio data with sample rate and silence detection
#[tauri::command]
pub fn stop_recording(
    state: State<AppState>,
    app_handle: AppHandle,
    silence_threshold: Option<f32>,
) -> Result<RecordingResult, String> {
    tracing::info!("Stopping audio recording");

    let threshold = silence_threshold.unwrap_or(0.005);

    let mut recorder = state.inner().audio_recorder.lock().unwrap();
    let result = recorder.stop_recording(threshold).map_err(|e| {
        tracing::error!("Failed to stop recording: {}", e);
        e.to_string()
    });

    if let Ok(ref recording) = result {
        if recording.is_silent {
            tracing::warn!(
                "Recording stopped: {} samples at {} Hz (RMS: {:.4}, SILENT - transcription skipped)",
                recording.audio_data.len(),
                recording.sample_rate,
                recording.avg_rms
            );
        } else {
            tracing::info!(
                "Recording stopped: {} samples at {} Hz (RMS: {:.4})",
                recording.audio_data.len(),
                recording.sample_rate,
                recording.avg_rms
            );
        }
    }

    let _ = app_handle.emit("recording-state", false);
    unregister_cancel_shortcut(&app_handle);

    result
}

/// Check if currently recording
#[tauri::command]
pub fn is_recording(state: State<AppState>) -> bool {
    let recorder = state.inner().audio_recorder.lock().unwrap();
    recorder.is_recording()
}

/// Start monitor-only audio stream for the settings mic-test feature.
/// Emits `audio-level` events without buffering samples and without changing
/// the global recording state.
#[tauri::command]
pub fn start_audio_monitor(
    state: State<AppState>,
    app_handle: AppHandle,
    device_index: Option<usize>,
) -> Result<(), String> {
    tracing::info!(
        "Starting audio monitor (device_index: {:?})",
        device_index
    );
    let mut recorder = state.inner().audio_recorder.lock().unwrap();
    recorder
        .start_monitoring(device_index, app_handle)
        .map_err(|e| {
            tracing::error!("Failed to start audio monitor: {}", e);
            e.to_string()
        })
}

/// Stop the monitor-only audio stream.
#[tauri::command]
pub fn stop_audio_monitor(state: State<AppState>) -> Result<(), String> {
    tracing::info!("Stopping audio monitor");
    let mut recorder = state.inner().audio_recorder.lock().unwrap();
    recorder.stop_monitoring().map_err(|e| {
        tracing::error!("Failed to stop audio monitor: {}", e);
        e.to_string()
    })
}
