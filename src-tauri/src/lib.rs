mod audio;

use audio::{AudioDeviceInfo, AudioRecorder};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

/// Application state that holds the audio recorder
pub struct AppState {
    audio_recorder: Mutex<AudioRecorder>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Get list of available audio input devices
#[tauri::command]
fn get_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    AudioRecorder::get_input_devices().map_err(|e| e.to_string())
}

/// Start recording audio from the specified device
#[tauri::command]
fn start_recording(
    state: State<AppState>,
    app_handle: AppHandle,
    device_index: Option<usize>,
) -> Result<(), String> {
    let mut recorder = state.audio_recorder.lock().unwrap();
    recorder
        .start_recording(device_index, app_handle)
        .map_err(|e| e.to_string())
}

/// Stop recording and return the audio data
#[tauri::command]
fn stop_recording(state: State<AppState>) -> Result<Vec<i16>, String> {
    let mut recorder = state.audio_recorder.lock().unwrap();
    recorder.stop_recording().map_err(|e| e.to_string())
}

/// Check if currently recording
#[tauri::command]
fn is_recording(state: State<AppState>) -> bool {
    let recorder = state.audio_recorder.lock().unwrap();
    recorder.is_recording()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            audio_recorder: Mutex::new(AudioRecorder::new()),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_audio_devices,
            start_recording,
            stop_recording,
            is_recording
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
