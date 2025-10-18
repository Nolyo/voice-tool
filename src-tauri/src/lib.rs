mod audio;

use audio::{AudioDeviceInfo, AudioRecorder};
use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, Manager, State,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

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

/// Stop recording and return the audio data
#[tauri::command]
fn stop_recording(state: State<AppState>, app_handle: AppHandle) -> Result<Vec<i16>, String> {
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
        .setup(|app| {
            use tauri_plugin_global_shortcut::ShortcutState;

            // Create mini window at startup
            create_mini_window(&app.handle())?;

            // Register global shortcut: Ctrl+Shift+Space to toggle recording
            app.handle()
                .plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_shortcut("Ctrl+Shift+Space")?
                        .with_handler(move |app, _shortcut, event| {
                            if event.state == ShortcutState::Pressed {
                                let app_handle = app.clone();
                                let state: tauri::State<AppState> = app_handle.state();

                                let is_recording = {
                                    let recorder = state.inner().audio_recorder.lock().unwrap();
                                    recorder.is_recording()
                                };

                                if is_recording {
                                    // Stop recording
                                    let mut recorder = state.inner().audio_recorder.lock().unwrap();
                                    let _ = recorder.stop_recording();
                                    let _ = app_handle.emit("recording-state", false);

                                    // Hide mini window
                                    if let Some(mini_window) = app_handle.get_webview_window("mini") {
                                        let _ = mini_window.hide();
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
                        })
                        .build(),
                )?;

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
