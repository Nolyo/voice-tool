mod audio;
mod transcription;

use audio::{AudioDeviceInfo, AudioRecorder};
use transcription::{save_audio_to_wav, cleanup_old_recordings, transcribe_with_openai, get_recordings_dir};
use std::{fs, path::PathBuf, sync::{Arc, Mutex}};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, State, WebviewWindow, WindowEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Position, Size,
};
use serde::Serialize;
use serde_json::{json, Value};
use tauri_plugin_store::StoreBuilder;

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

/// Parse geometry string formatted as "WIDTHxHEIGHT+X+Y"
fn parse_geometry(value: &str) -> Option<(u32, u32, i32, i32)> {
    let mut parts = value.split('+');
    let size_part = parts.next()?;
    let mut size_split = size_part.split('x');
    let width = size_split.next()?.parse::<u32>().ok()?;
    let height = size_split.next()?.parse::<u32>().ok()?;
    let x = parts.next()?.parse::<i32>().ok()?;
    let y = parts.next()?.parse::<i32>().ok()?;
    Some((width, height, x, y))
}

fn format_geometry(size: PhysicalSize<u32>, position: PhysicalPosition<i32>) -> String {
    format!("{}x{}+{}+{}", size.width, size.height, position.x, position.y)
}

fn update_window_settings<R: Runtime>(
    store: &Arc<tauri_plugin_store::Store<R>>,
    geometry: Option<String>,
    state: Option<String>,
) {
    let mut data = store.get("settings").unwrap_or_else(|| json!({}));
    if !data.is_object() {
        data = json!({});
    }

    {
        let root = data.as_object_mut().expect("settings root should be an object");
        let settings_value = root
            .entry("settings")
            .or_insert_with(|| json!({}));

        if !settings_value.is_object() {
            *settings_value = json!({});
        }

        if let Some(settings_obj) = settings_value.as_object_mut() {
            if let Some(geom) = geometry {
                settings_obj.insert("main_window_geometry".into(), json!(geom));
            }
            if let Some(state_str) = state {
                settings_obj.insert("main_window_state".into(), json!(state_str));
            }
        }
    }

    store.set("settings", data);
}

fn capture_window_state<R: Runtime>(
    window: &WebviewWindow<R>,
    store: &Arc<tauri_plugin_store::Store<R>>,
) {
    let is_minimized = window.is_minimized().unwrap_or(false);
    let is_maximized = window.is_maximized().unwrap_or(false);

    let state = if is_minimized {
        "minimized".to_string()
    } else if is_maximized {
        "maximized".to_string()
    } else {
        "normal".to_string()
    };

    let geometry = if state == "normal" {
        match (window.outer_size(), window.outer_position()) {
            (Ok(size), Ok(position)) => Some(format_geometry(size, position)),
            _ => None,
        }
    } else {
        None
    };

    update_window_settings(store, geometry, Some(state));
}

fn restore_window_state<R: Runtime>(
    window: &WebviewWindow<R>,
    store: &Arc<tauri_plugin_store::Store<R>>,
) {
    let Some(settings_value) = store.get("settings") else {
        return;
    };

    let Some(settings_obj) = settings_value.get("settings").and_then(Value::as_object) else {
        return;
    };

    if let Some(geometry_str) = settings_obj
        .get("main_window_geometry")
        .and_then(Value::as_str)
    {
        if let Some((width, height, x, y)) = parse_geometry(geometry_str) {
            if let Err(err) = window.set_size(Size::Physical(PhysicalSize { width, height })) {
                eprintln!("[window-state] Failed to apply window size: {}", err);
            }
            if let Err(err) = window.set_position(Position::Physical(PhysicalPosition { x, y })) {
                eprintln!("[window-state] Failed to apply window position: {}", err);
            }
        }
    }

    if let Some(state_str) = settings_obj
        .get("main_window_state")
        .and_then(Value::as_str)
    {
        match state_str {
            "maximized" => {
                if let Err(err) = window.maximize() {
                    eprintln!("[window-state] Failed to maximize window: {}", err);
                }
            }
            "minimized" => {
                if let Err(err) = window.minimize() {
                    eprintln!("[window-state] Failed to minimize window: {}", err);
                }
            }
            _ => {
                let _ = window.unmaximize();
                let _ = window.unminimize();
            }
        }
    }
}

fn position_mini_window<R: Runtime>(app_handle: &AppHandle<R>, window: &WebviewWindow<R>) {
    const MARGIN_BOTTOM: i32 = 32;

    let window_size = window
        .outer_size()
        .ok()
        .unwrap_or_else(|| PhysicalSize::new(250, 100));

    let target_monitor = app_handle
        .get_webview_window("main")
        .and_then(|main| main.current_monitor().ok().flatten())
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());

    let Some(monitor) = target_monitor else {
        return;
    };

    let monitor_size = monitor.size();
    let monitor_position = monitor.position();

    let window_width = window_size.width as i32;
    let window_height = window_size.height as i32;

    let centered_x = monitor_position.x + ((monitor_size.width as i32 - window_width) / 2);
    let bottom_y = monitor_position.y + monitor_size.height as i32 - window_height - MARGIN_BOTTOM;

    let new_position = PhysicalPosition {
        x: centered_x,
        y: bottom_y.max(monitor_position.y),
    };

    let _ = window.set_position(Position::Physical(new_position));
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

    let mini = WebviewWindowBuilder::new(app, "mini", WebviewUrl::App("mini.html".into()))
        .title("Voice Tool - Mini")
        .inner_size(250.0, 100.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .transparent(true)
        .visible(false) // Hidden by default!
        .build()?;

    position_mini_window(app, &mini);

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

            // Prepare settings store to restore window state
            let window_store = StoreBuilder::new(app, "settings.json").build()?;
            if let Some(window) = app.get_webview_window("main") {
                restore_window_state(&window, &window_store);

                let events_store = window_store.clone();
                let events_window = window.clone();
                window.on_window_event(move |event| {
                    match event {
                        WindowEvent::CloseRequested { api, .. } => {
                            capture_window_state(&events_window, &events_store);
                            if let Err(err) = events_store.save() {
                                eprintln!("[window-state] Failed to save settings: {}", err);
                            }
                            api.prevent_close();
                            let _ = events_window.hide();
                            // Note: Mini window will be shown automatically when recording starts
                        }
                        WindowEvent::Resized(_) | WindowEvent::Moved(_) | WindowEvent::ScaleFactorChanged { .. } => {
                            capture_window_state(&events_window, &events_store);
                        }
                        _ => {}
                    }
                });
            }

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
                                            position_mini_window(&app_handle, &mini_window);
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
                                        position_mini_window(&app_handle, &mini_window);
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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
