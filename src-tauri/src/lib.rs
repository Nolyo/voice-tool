mod audio;
mod transcription;

use audio::{AudioDeviceInfo, AudioRecorder};
use transcription::{save_audio_to_wav, cleanup_old_recordings, transcribe_with_openai, get_recordings_dir};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{
    AppHandle, Emitter, Manager, State,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use serde::Serialize;

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
    let mut recorder = state.inner().audio_recorder.lock().unwrap();
    let result = recorder
        .start_recording(device_index, app_handle.clone())
        .map_err(|e| e.to_string());

    // Emit recording state change
    let _ = app_handle.emit("recording-state", true);

    result
}

/// Stop recording and return the audio data with sample rate
#[tauri::command]
fn stop_recording(state: State<AppState>, app_handle: AppHandle) -> Result<(Vec<i16>, u32), String> {
    let mut recorder = state.inner().audio_recorder.lock().unwrap();
    let result = recorder.stop_recording().map_err(|e| e.to_string());

    // Emit recording state change
    let _ = app_handle.emit("recording-state", false);

    result
}

/// Check if currently recording
#[tauri::command]
fn is_recording(state: State<AppState>) -> bool {
    let recorder = state.inner().audio_recorder.lock().unwrap();
    recorder.is_recording()
}

/// Exit the application completely
#[tauri::command]
fn exit_app(app_handle: AppHandle) {
    app_handle.exit(0);
}

/// Transcribe audio samples using the configured provider
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscriptionResponse {
    text: String,
    audio_path: String,
}

#[tauri::command]
async fn transcribe_audio(
    audio_samples: Vec<i16>,
    sample_rate: u32,
    api_key: String,
    language: String,
    keep_last: usize,
) -> Result<TranscriptionResponse, String> {
    println!("transcribe_audio called with {} samples at {} Hz", audio_samples.len(), sample_rate);

    // Save audio to WAV file
    let wav_path = save_audio_to_wav(&audio_samples, sample_rate)
        .map_err(|e| format!("Failed to save audio: {}", e))?;

    // Transcribe using OpenAI Whisper
    let transcription = transcribe_with_openai(&wav_path, &api_key, &language)
        .await
        .map_err(|e| format!("Transcription failed: {}", e))?;

    // Clean up old recordings
    let _ = cleanup_old_recordings(keep_last);

    Ok(TranscriptionResponse {
        text: transcription,
        audio_path: wav_path
            .to_string_lossy()
            .replace('\\', "/")
            .to_string(),
    })
}

/// Load a recorded audio file and return its raw bytes for playback.
#[tauri::command]
fn load_recording(audio_path: String) -> Result<Vec<u8>, String> {
    let requested_path = PathBuf::from(&audio_path);

    // Ensure the requested path is inside the recordings directory
    let recordings_dir = get_recordings_dir().map_err(|e| e.to_string())?;
    let canonical_dir = recordings_dir
        .canonicalize()
        .unwrap_or(recordings_dir.clone());

    let canonical_file = requested_path
        .canonicalize()
        .map_err(|e| format!("Audio introuvable: {}", e))?;

    if !canonical_file.starts_with(&canonical_dir) {
        return Err("Accès au fichier audio refusé.".to_string());
    }

    fs::read(&canonical_file).map_err(|e| format!("Lecture audio impossible: {}", e))
}

/// Paste text to the active window by simulating Ctrl+V
#[tauri::command]
fn paste_text_to_active_window(_text: String) -> Result<(), String> {
    use enigo::{Enigo, Key, Keyboard, Settings};
    use std::thread;
    use std::time::Duration;

    // Copy text to clipboard first using the clipboard plugin
    // (This will be handled by the clipboard-manager plugin)

    // Small delay to ensure clipboard is set
    thread::sleep(Duration::from_millis(50));

    // Simulate Ctrl+V
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Failed to initialize keyboard: {}", e))?;

    enigo.key(Key::Control, enigo::Direction::Press).map_err(|e| e.to_string())?;
    enigo.key(Key::Unicode('v'), enigo::Direction::Click).map_err(|e| e.to_string())?;
    enigo.key(Key::Control, enigo::Direction::Release).map_err(|e| e.to_string())?;

    Ok(())
}

/// Create the mini visualizer window at startup (hidden by default)
fn create_mini_window(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::WebviewWindowBuilder;
    use tauri::WebviewUrl;

    WebviewWindowBuilder::new(app, "mini", WebviewUrl::App("mini.html".into()))
        .title("Voice Tool - Mini")
        .inner_size(250.0, 100.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .transparent(true)
        .visible(false) // Hidden by default!
        .build()?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState {
            audio_recorder: Mutex::new(AudioRecorder::new()),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_audio_devices,
            start_recording,
            stop_recording,
            is_recording,
            exit_app,
            transcribe_audio,
            load_recording,
            paste_text_to_active_window
        ])
        .setup(|app| {
            use tauri_plugin_global_shortcut::ShortcutState;

            // Create mini window at startup
            create_mini_window(&app.handle())?;

            // Register global shortcuts: Toggle (Ctrl+F11) and Push-to-Talk (Ctrl+F12)
            println!("Registering global shortcuts...");

            app.handle()
                .plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_shortcut("Ctrl+F11")?
                        .with_shortcut("Ctrl+F12")?
                        .with_handler(move |app, shortcut, event| {
                            let app_handle = app.clone();
                            let state: tauri::State<AppState> = app_handle.state();

                            // Identify shortcuts by their actual key combination
                            let shortcut_str = format!("{:?}", shortcut);
                            let is_toggle = shortcut_str.contains("F11");

                            println!("Shortcut triggered! Keys: {}, State: {:?}, IsToggle: {}", shortcut_str, event.state, is_toggle);

                            // Toggle mode shortcut (Ctrl+F11)
                            if is_toggle {
                                // Toggle mode: only on Pressed
                                if event.state == ShortcutState::Pressed {
                                    let is_recording = {
                                        let recorder = state.inner().audio_recorder.lock().unwrap();
                                        recorder.is_recording()
                                    };

                                    if is_recording {
                                        // Stop recording and get audio data
                                        let mut recorder = state.inner().audio_recorder.lock().unwrap();
                                        match recorder.stop_recording() {
                                            Ok((audio_data, sample_rate)) => {
                                                drop(recorder); // Release lock before emitting events

                                                // Emit recording state change
                                                let _ = app_handle.emit("recording-state", false);

                                                // Emit audio data for transcription
                                                let _ = app_handle.emit("audio-captured", serde_json::json!({
                                                    "samples": audio_data,
                                                    "sampleRate": sample_rate
                                                }));

                                                // Hide mini window
                                                if let Some(mini_window) = app_handle.get_webview_window("mini") {
                                                    let _ = mini_window.hide();
                                                }
                                            }
                                            Err(e) => {
                                                eprintln!("Error stopping recording: {}", e);
                                            }
                                        }
                                    } else {
                                        // Show mini window INSTANTLY (already created, just show it)
                                        if let Some(mini_window) = app_handle.get_webview_window("mini") {
                                            let _ = mini_window.show();
                                        }

                                        // Start recording
                                        let mut recorder = state.inner().audio_recorder.lock().unwrap();
                                        let _ = recorder.start_recording(None, app_handle.clone());
                                        let _ = app_handle.emit("recording-state", true);
                                    }
                                }
                            }
                            // Push-to-Talk shortcut (Ctrl+F12)
                            else {
                                // Push-to-Talk mode: start on Pressed, stop on Released
                                if event.state == ShortcutState::Pressed {
                                    // Show mini window
                                    if let Some(mini_window) = app_handle.get_webview_window("mini") {
                                        let _ = mini_window.show();
                                    }

                                    // Start recording
                                    let mut recorder = state.inner().audio_recorder.lock().unwrap();
                                    if !recorder.is_recording() {
                                        let _ = recorder.start_recording(None, app_handle.clone());
                                        let _ = app_handle.emit("recording-state", true);
                                    }
                                } else if event.state == ShortcutState::Released {
                                    // Stop recording and get audio data
                                    let mut recorder = state.inner().audio_recorder.lock().unwrap();
                                    if recorder.is_recording() {
                                        match recorder.stop_recording() {
                                            Ok((audio_data, sample_rate)) => {
                                                drop(recorder); // Release lock before emitting events

                                                // Emit recording state change
                                                let _ = app_handle.emit("recording-state", false);

                                                // Emit audio data for transcription
                                                let _ = app_handle.emit("audio-captured", serde_json::json!({
                                                    "samples": audio_data,
                                                    "sampleRate": sample_rate
                                                }));

                                                // Hide mini window
                                                if let Some(mini_window) = app_handle.get_webview_window("mini") {
                                                    let _ = mini_window.hide();
                                                }
                                            }
                                            Err(e) => {
                                                eprintln!("Error stopping recording: {}", e);
                                            }
                                        }
                                    }
                                }
                            }
                        })
                        .build(),
                )?;
            println!("Global shortcuts registered successfully!");

            // Create system tray menu
            let show_item = MenuItem::with_id(app, "show", "Afficher", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            // Build the tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Handle window close event to hide instead of quit
            if let Some(window) = app.get_webview_window("main") {
                let win = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // Prevent default close and hide window instead
                        api.prevent_close();
                        let _ = win.hide();
                        // Note: Mini window will be shown automatically when recording starts
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
