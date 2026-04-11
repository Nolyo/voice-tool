mod audio;
mod chat;
mod logging;
mod logs;
mod notes;
mod transcription;
mod transcription_local;
mod transcriptions;
mod updater;

use audio::{AudioDeviceInfo, AudioRecorder, RecordingResult};
use serde::Serialize;
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Runtime, Size,
    State, WebviewWindow, WindowEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};
use tauri_plugin_store::StoreBuilder;
use tokio::sync::Mutex as TokioMutex;
use transcription::{
    cleanup_old_recordings, get_recordings_dir, save_audio_to_wav, transcribe_with_openai,
};
use whisper_rs::{WhisperContext, WhisperContextParameters};

#[derive(Clone, Default)]
struct HotkeyConfig {
    record: Option<String>,
    ptt: Option<String>,
    open_window: Option<String>,
    cancel: Option<String>,
}

/// Holds a cached whisper context + state so state buffers are allocated once
pub struct WhisperCache {
    pub context: Option<whisper_rs::WhisperContext>,
    pub state: Option<whisper_rs::WhisperState>,
    pub loaded_model: String,
}

pub struct WhisperState {
    pub cache: Arc<TokioMutex<WhisperCache>>,
}

/// Application state that holds the audio recorder and active hotkeys
pub struct AppState {
    audio_recorder: Mutex<AudioRecorder>,
    hotkeys: Mutex<HotkeyConfig>,
    pub whisper: WhisperState,
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

    // Emit recording state change
    let _ = app_handle.emit("recording-state", true);

    if result.is_ok() {
        register_cancel_shortcut(&app_handle);
    }

    result
}

/// Stop recording and return the audio data with sample rate and silence detection
#[tauri::command]
fn stop_recording(
    state: State<AppState>,
    app_handle: AppHandle,
    silence_threshold: Option<f32>,
) -> Result<RecordingResult, String> {
    tracing::info!("Stopping audio recording");

    // Use provided threshold or default to 0.005 (0.5% - typical silence level)
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

    // Emit recording state change
    let _ = app_handle.emit("recording-state", false);
    unregister_cancel_shortcut(&app_handle);

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

/// Set mini window mode (compact or extended)
#[tauri::command]
fn set_mini_window_mode(app_handle: AppHandle, mode: String) -> Result<(), String> {
    use tauri::Size;

    if let Some(mini_window) = app_handle.get_webview_window("mini") {
        let (width, height) = match mode.as_str() {
            "compact" => (233, 42),
            "extended" => (233, 150),
            _ => {
                return Err(format!(
                    "Invalid mode: {}. Use 'compact' or 'extended'",
                    mode
                ));
            }
        };

        mini_window
            .set_size(Size::Physical(PhysicalSize { width, height }))
            .map_err(|e| format!("Failed to resize mini window: {}", e))?;

        // Reposition to maintain bottom-center alignment
        position_mini_window(&app_handle, &mini_window);

        tracing::info!("Mini window mode set to: {}", mode);
        Ok(())
    } else {
        Err("Mini window not found".to_string())
    }
}

/// Explicitly close/hide the mini window from frontend
#[tauri::command]
fn close_mini_window(app_handle: AppHandle) {
    // First reset to compact mode for clean state on next show
    if let Some(mini_window) = app_handle.get_webview_window("mini") {
        let _ = mini_window.set_size(Size::Physical(PhysicalSize {
            width: 233,
            height: 42,
        }));
    }
    // Then hide the window
    hide_mini_window(&app_handle);
    tracing::debug!("Mini window closed and reset to compact mode");
}

/// Open the app data directory in the system file explorer
#[tauri::command]
fn open_app_data_dir(app_handle: AppHandle) -> Result<(), String> {
    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(app_data)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        opener::open(app_data).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Log a separator line to mark the end of a transcription process
#[tauri::command]
fn log_separator() {
    tracing::info!("────────────────────────────────────────────────────────────────");
}

/// Check if autostart is currently enabled
#[tauri::command]
fn is_autostart_enabled(app_handle: AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;

    let autostart_manager = app_handle.autolaunch();
    autostart_manager.is_enabled().map_err(|e| {
        format!(
            "Impossible de vérifier l'état du démarrage automatique: {}",
            e
        )
    })
}

/// Enable or disable autostart on system boot
#[tauri::command]
fn set_autostart(app_handle: AppHandle, enable: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;

    let autostart_manager = app_handle.autolaunch();

    if enable {
        autostart_manager
            .enable()
            .map_err(|e| format!("Impossible d'activer le démarrage automatique: {}", e))?;
    } else {
        // Ignore the error if the entry doesn't exist (it's already disabled)
        if let Err(e) = autostart_manager.disable() {
            let error_msg = e.to_string();
            // On Windows, "Le fichier spécifié est introuvable" (os error 2) means it's already disabled
            if !error_msg.contains("os error 2") && !error_msg.contains("not found") {
                return Err(format!(
                    "Impossible de désactiver le démarrage automatique: {}",
                    e
                ));
            }
        }
    }

    Ok(())
}

/// Update global hotkeys dynamically from the frontend
#[tauri::command]
fn update_hotkeys(
    app_handle: AppHandle,
    state: State<AppState>,
    record_hotkey: Option<String>,
    ptt_hotkey: Option<String>,
    open_window_hotkey: Option<String>,
    cancel_hotkey: Option<String>,
) -> Result<(), String> {
    let current = state
        .inner()
        .hotkeys
        .lock()
        .map(|hotkeys| hotkeys.clone())
        .unwrap_or_default();

    let mut next = current.clone();
    if let Some(value) = record_hotkey {
        next.record = normalize_hotkey_value(Some(value));
    }
    if let Some(value) = ptt_hotkey {
        next.ptt = normalize_hotkey_value(Some(value));
    }
    if let Some(value) = open_window_hotkey {
        next.open_window = normalize_hotkey_value(Some(value));
    }
    if let Some(value) = cancel_hotkey {
        next.cancel = normalize_hotkey_value(Some(value));
    }

    if let Err(err) = apply_hotkeys(&app_handle, &next) {
        let _ = apply_hotkeys(&app_handle, &current);
        return Err(err);
    }

    if let Ok(mut guard) = state.inner().hotkeys.lock() {
        *guard = next;
    }

    Ok(())
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
    format!(
        "{}x{}+{}+{}",
        size.width, size.height, position.x, position.y
    )
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
        let root = data
            .as_object_mut()
            .expect("settings root should be an object");
        let settings_value = root.entry("settings").or_insert_with(|| json!({}));

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
        .unwrap_or_else(|| PhysicalSize::new(320, 76));

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

fn show_mini_window<R: Runtime>(app_handle: &AppHandle<R>) {
    if let Some(mini_window) = app_handle.get_webview_window("mini") {
        position_mini_window(app_handle, &mini_window);

        // Use ShowWindow with SW_SHOWNOACTIVATE to avoid stealing focus
        // from the main window or external apps
        #[cfg(windows)]
        {
            if let Ok(hwnd) = mini_window.hwnd() {
                const SW_SHOWNOACTIVATE: i32 = 4;
                unsafe {
                    windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(
                        hwnd.0,
                        SW_SHOWNOACTIVATE,
                    );
                }
                return;
            }
        }

        // Fallback for non-Windows
        let _ = mini_window.show();
    }
}

fn hide_mini_window<R: Runtime>(app_handle: &AppHandle<R>) {
    if let Some(mini_window) = app_handle.get_webview_window("mini") {
        #[cfg(windows)]
        {
            if let Ok(hwnd) = mini_window.hwnd() {
                const SW_HIDE: i32 = 0;
                unsafe {
                    windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(
                        hwnd.0,
                        SW_HIDE,
                    );
                }
                return;
            }
        }
        let _ = mini_window.hide();
    }
}

fn is_recorder_active<R: Runtime>(app_handle: &AppHandle<R>) -> bool {
    let state: State<AppState> = app_handle.state();
    state
        .inner()
        .audio_recorder
        .lock()
        .map(|recorder| recorder.is_recording())
        .unwrap_or(false)
}

fn start_recording_shortcut<R: Runtime>(app_handle: &AppHandle<R>) -> bool {
    let state: State<AppState> = app_handle.state();
    if let Ok(mut recorder) = state.inner().audio_recorder.lock() {
        if recorder.is_recording() {
            return true;
        }
        match recorder.start_recording(None, app_handle.clone()) {
            Ok(_) => {
                drop(recorder);
                let _ = app_handle.emit("recording-state", true);
                register_cancel_shortcut(app_handle);
                true
            }
            Err(err) => {
                eprintln!("Error starting recording: {}", err);
                drop(recorder);
                let _ = app_handle.emit("recording-state", false);
                false
            }
        }
    } else {
        false
    }
}

fn stop_recording_shortcut<R: Runtime>(app_handle: &AppHandle<R>) -> Option<RecordingResult> {
    let state: State<AppState> = app_handle.state();

    // Default silence threshold (will be configurable via settings later)
    let silence_threshold = 0.005;

    let result = if let Ok(mut recorder) = state.inner().audio_recorder.lock() {
        if !recorder.is_recording() {
            None
        } else {
            Some(recorder.stop_recording(silence_threshold))
        }
    } else {
        None
    };

    let _ = app_handle.emit("recording-state", false);
    unregister_cancel_shortcut(app_handle);

    match result {
        Some(Ok(recording)) => Some(recording),
        Some(Err(err)) => {
            eprintln!("Error stopping recording: {}", err);
            None
        }
        None => None,
    }
}

fn cancel_recording_shortcut<R: Runtime>(app_handle: &AppHandle<R>) {
    let state: State<AppState> = app_handle.state();
    let silence_threshold = 0.005;

    if let Ok(mut recorder) = state.inner().audio_recorder.lock() {
        if !recorder.is_recording() {
            return;
        }
        // Stop recording but discard the audio — no transcription
        let _ = recorder.stop_recording(silence_threshold);
    }

    let _ = app_handle.emit("recording-state", false);
    let _ = app_handle.emit("recording-cancelled", ());
    unregister_cancel_shortcut(app_handle);
    hide_mini_window(app_handle);
    tracing::info!("Recording cancelled by user (no transcription)");
}

/// Register the cancel shortcut dynamically.
/// Spawns on a separate thread to avoid deadlock when called from within
/// a shortcut handler (the plugin holds its shortcuts mutex during dispatch).
fn register_cancel_shortcut<R: Runtime>(app_handle: &AppHandle<R>) {
    let handle = app_handle.clone();
    std::thread::spawn(move || {
        let state: State<AppState> = handle.state();
        let cancel_str = {
            let guard = state.inner().hotkeys.lock().unwrap();
            guard.cancel.clone()
        };

        let Some(cancel_str) = cancel_str else {
            return;
        };

        let shortcut = match parse_hotkey_str(&cancel_str) {
            Ok(s) => s,
            Err(err) => {
                tracing::warn!("Failed to parse cancel shortcut: {}", err);
                return;
            }
        };

        let manager = handle.global_shortcut();

        if manager.is_registered(shortcut.clone()) {
            return;
        }

        let handler = move |app: &AppHandle<R>, _shortcut: &Shortcut, event: ShortcutEvent| {
            if event.state == ShortcutState::Pressed && is_recorder_active(app) {
                cancel_recording_shortcut(app);
            }
        };

        if let Err(err) = manager.on_shortcut(shortcut, handler) {
            tracing::warn!("Failed to register cancel shortcut: {}", err);
        }
    });
}

/// Unregister the cancel shortcut dynamically.
/// Spawns on a separate thread to avoid deadlock (same reason as register).
fn unregister_cancel_shortcut<R: Runtime>(app_handle: &AppHandle<R>) {
    let handle = app_handle.clone();
    std::thread::spawn(move || {
        let state: State<AppState> = handle.state();
        let cancel_str = {
            let guard = state.inner().hotkeys.lock().unwrap();
            guard.cancel.clone()
        };

        let Some(cancel_str) = cancel_str else {
            return;
        };

        let shortcut = match parse_hotkey_str(&cancel_str) {
            Ok(s) => s,
            Err(err) => {
                tracing::warn!("Failed to parse cancel shortcut for unregister: {}", err);
                return;
            }
        };

        let manager = handle.global_shortcut();

        if !manager.is_registered(shortcut.clone()) {
            return;
        }

        if let Err(err) = manager.unregister(shortcut) {
            tracing::warn!("Failed to unregister cancel shortcut: {}", err);
        }
    });
}

fn emit_audio_samples<R: Runtime>(app_handle: &AppHandle<R>, recording: RecordingResult) {
    let _ = app_handle.emit(
        "audio-captured",
        json!({
            "samples": recording.audio_data,
            "sampleRate": recording.sample_rate,
            "avgRms": recording.avg_rms,
            "isSilent": recording.is_silent
        }),
    );
}

fn hotkeys_conflict(config: &HotkeyConfig) -> Option<String> {
    let equals = |a: &Option<String>, b: &Option<String>| match (a, b) {
        (Some(lhs), Some(rhs)) => lhs.eq_ignore_ascii_case(rhs),
        _ => false,
    };

    if equals(&config.record, &config.ptt) {
        return Some("Les raccourcis Toggle et Push-to-talk doivent être différents.".into());
    }
    if equals(&config.record, &config.open_window) || equals(&config.ptt, &config.open_window) {
        return Some("Le raccourci d'ouverture de fenêtre doit être distinct des raccourcis d'enregistrement.".into());
    }
    if equals(&config.cancel, &config.record)
        || equals(&config.cancel, &config.ptt)
        || equals(&config.cancel, &config.open_window)
    {
        return Some("Le raccourci d'annulation doit être distinct des autres raccourcis.".into());
    }

    None
}

fn parse_hotkey_str(value: &str) -> Result<Shortcut, String> {
    value
        .parse::<Shortcut>()
        .map_err(|err| format!("Raccourci invalide \"{}\": {}", value, err))
}

fn apply_hotkeys<R: Runtime>(
    app_handle: &AppHandle<R>,
    config: &HotkeyConfig,
) -> Result<(), String> {
    if let Some(message) = hotkeys_conflict(config) {
        return Err(message);
    }

    let manager = app_handle.global_shortcut();

    if let Err(err) = manager.unregister_all() {
        eprintln!("Failed to clear existing shortcuts: {}", err);
    }

    let record_hotkey = config
        .record
        .as_ref()
        .map(|value| parse_hotkey_str(value).map(|shortcut| (value.clone(), shortcut)))
        .transpose()?;

    let ptt_hotkey = config
        .ptt
        .as_ref()
        .map(|value| parse_hotkey_str(value).map(|shortcut| (value.clone(), shortcut)))
        .transpose()?;

    let open_hotkey = config
        .open_window
        .as_ref()
        .map(|value| parse_hotkey_str(value).map(|shortcut| (value.clone(), shortcut)))
        .transpose()?;

    if let Some((record_label, record_shortcut)) = record_hotkey {
        let handler = move |app: &AppHandle<R>, _shortcut: &Shortcut, event: ShortcutEvent| {
            if event.state == ShortcutState::Pressed {
                if is_recorder_active(app) {
                    if let Some(recording) = stop_recording_shortcut(app) {
                        emit_audio_samples(app, recording);
                    }
                    // hide_mini_window(app); // Keep window open for visual feedback
                } else {
                    show_mini_window(app);
                    if !start_recording_shortcut(app) {
                        hide_mini_window(app);
                    }
                }
            }
        };

        manager
            .on_shortcut(record_shortcut.clone(), handler)
            .map_err(|e| {
                format!(
                    "Impossible d'enregistrer le raccourci \"{}\": {}",
                    record_label, e
                )
            })?;
    }

    if let Some((ptt_label, ptt_shortcut)) = ptt_hotkey {
        let handler =
            move |app: &AppHandle<R>, _shortcut: &Shortcut, event: ShortcutEvent| match event.state
            {
                ShortcutState::Pressed => {
                    show_mini_window(app);
                    if !start_recording_shortcut(app) {
                        hide_mini_window(app);
                    }
                }
                ShortcutState::Released => {
                    if let Some(recording) = stop_recording_shortcut(app) {
                        emit_audio_samples(app, recording);
                    }
                    // hide_mini_window(app); // Keep window open for visual feedback
                }
            };

        manager
            .on_shortcut(ptt_shortcut.clone(), handler)
            .map_err(|e| {
                format!(
                    "Impossible d'enregistrer le raccourci \"{}\": {}",
                    ptt_label, e
                )
            })?;
    }

    if let Some((open_label, open_shortcut)) = open_hotkey {
        let handler = move |app: &AppHandle<R>, _shortcut: &Shortcut, event: ShortcutEvent| {
            if event.state == ShortcutState::Pressed {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        };

        manager
            .on_shortcut(open_shortcut.clone(), handler)
            .map_err(|e| {
                format!(
                    "Impossible d'enregistrer le raccourci \"{}\": {}",
                    open_label, e
                )
            })?;
    }

    Ok(())
}

fn normalize_hotkey_value(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn load_hotkey_config<R: Runtime>(store: &Arc<tauri_plugin_store::Store<R>>) -> HotkeyConfig {
    let mut config = HotkeyConfig::default();

    if let Some(settings_value) = store.get("settings") {
        if let Some(settings_obj) = settings_value.get("settings").and_then(Value::as_object) {
            if let Some(value) = settings_obj.get("record_hotkey").and_then(Value::as_str) {
                config.record = normalize_hotkey_value(Some(value.to_string()));
            }
            if let Some(value) = settings_obj.get("ptt_hotkey").and_then(Value::as_str) {
                config.ptt = normalize_hotkey_value(Some(value.to_string()));
            }
            if let Some(value) = settings_obj
                .get("open_window_hotkey")
                .and_then(Value::as_str)
            {
                config.open_window = normalize_hotkey_value(Some(value.to_string()));
            }
            if let Some(value) = settings_obj
                .get("cancel_hotkey")
                .and_then(Value::as_str)
            {
                config.cancel = normalize_hotkey_value(Some(value.to_string()));
            }
        }
    }

    if config.record.is_none() {
        config.record = Some("Ctrl+F11".into());
    }
    if config.ptt.is_none() {
        config.ptt = Some("Ctrl+F12".into());
    }
    if config.open_window.is_none() {
        config.open_window = Some("Ctrl+Alt+O".into());
    }
    if config.cancel.is_none() {
        config.cancel = Some("Escape".into());
    }

    config
}
#[tauri::command]
async fn download_local_model(app_handle: AppHandle, model: String) -> Result<String, String> {
    transcription_local::download_model(app_handle, model)
        .await
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn check_local_model_exists(model: String) -> bool {
    transcription_local::check_model_exists(&model)
}

#[tauri::command]
fn delete_local_model(model: String) -> Result<(), String> {
    transcription_local::delete_model(&model).map_err(|e| e.to_string())
}

#[tauri::command]
async fn ai_process_text(
    api_key: String,
    system_prompt: String,
    user_text: String,
) -> Result<String, String> {
    chat::chat_completion(&api_key, &system_prompt, &user_text)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn transcribe_audio(
    app_handle: AppHandle,
    audio_samples: Vec<i16>,
    sample_rate: u32,
    api_key: String,
    language: String,
    keep_last: usize,
    provider: Option<String>,
    local_model_size: Option<String>,
    dictionary: Option<String>,
    translate: Option<bool>,
) -> Result<TranscriptionResponse, String> {
    let translate = translate.unwrap_or(false);
    tracing::info!(
        "transcribe_audio called with {} samples at {} Hz (Provider: {:?}, Translate: {})",
        audio_samples.len(),
        sample_rate,
        provider,
        translate
    );

    // Save audio to WAV file
    let wav_path = save_audio_to_wav(&audio_samples, sample_rate)
        .map_err(|e| format!("Failed to save audio: {}", e))?;

    let dict = dictionary.as_deref().unwrap_or("");

    let effective_provider = provider.as_deref();

    let transcription_result = if effective_provider == Some("Local") {
        let model = local_model_size.unwrap_or_else(|| "base".to_string());
        transcription_local::transcribe_local(&app_handle, &audio_samples, sample_rate, &model, &language, dict, translate)
            .await
            .map_err(|e| {
                tracing::error!("Local transcription failed: {}", e);
                format!("Local transcription failed: {}", e)
            })
    } else {
        // Default to OpenAI
        transcribe_with_openai(&wav_path, &api_key, &language, dict, translate)
            .await
            .map_err(|e| {
                tracing::error!("Transcription failed: {}", e);
                format!("Transcription failed: {}", e)
            })
    };

    let transcription = transcription_result?;

    // Clean up old recordings
    let _ = cleanup_old_recordings(keep_last);

    tracing::info!(
        "Transcription completed successfully: {} characters",
        transcription.len()
    );

    Ok(TranscriptionResponse {
        text: transcription,
        audio_path: wav_path.to_string_lossy().replace('\\', "/").to_string(),
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

    tracing::info!("Pasting transcription to cursor position");

    // Copy text to clipboard first using the clipboard plugin
    // (This will be handled by the clipboard-manager plugin)

    // Small delay to ensure clipboard is set
    thread::sleep(Duration::from_millis(50));

    // Simulate Ctrl+V
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| {
        tracing::error!("Failed to initialize keyboard simulation: {}", e);
        format!("Failed to initialize keyboard: {}", e)
    })?;

    enigo
        .key(Key::Control, enigo::Direction::Press)
        .map_err(|e| e.to_string())?;
    enigo
        .key(Key::Unicode('v'), enigo::Direction::Click)
        .map_err(|e| e.to_string())?;
    enigo
        .key(Key::Control, enigo::Direction::Release)
        .map_err(|e| e.to_string())?;

    tracing::info!("Text pasted successfully at cursor position");

    Ok(())
}

/// Type text directly at the cursor position using keyboard simulation
/// Unlike paste_text_to_active_window, this does NOT touch the clipboard
#[tauri::command]
fn type_text_at_cursor(text: String) -> Result<(), String> {
    use enigo::{Enigo, Keyboard, Settings};
    use std::thread;
    use std::time::Duration;

    tracing::info!(
        "Typing transcription directly at cursor position ({} chars)",
        text.len()
    );

    // Small delay to ensure target window has focus
    thread::sleep(Duration::from_millis(50));

    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| {
        tracing::error!("Failed to initialize keyboard simulation: {}", e);
        format!("Failed to initialize keyboard: {}", e)
    })?;

    enigo.text(&text).map_err(|e| {
        tracing::error!("Failed to type text: {}", e);
        format!("Failed to type text: {}", e)
    })?;

    tracing::info!("Text typed successfully at cursor position");
    Ok(())
}

#[tauri::command]
async fn delete_recording_files(paths: Vec<String>) -> Result<(), String> {
    for path in paths {
        if !path.is_empty() {
            let _ = std::fs::remove_file(&path);
        }
    }
    Ok(())
}

/// Create the mini visualizer window at startup (hidden by default)
fn create_mini_window(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::WebviewUrl;
    use tauri::WebviewWindowBuilder;

    let mini = WebviewWindowBuilder::new(app, "mini", WebviewUrl::App("mini.html".into()))
        .title("Voice Tool - Mini")
        .inner_size(233.0, 42.0)
        .resizable(true)
        .decorations(false)
        .always_on_top(true)
        .transparent(true)
        .visible(false) // Hidden by default!
        .focusable(false) // Never steal focus from main window or other apps
        .build()?;

    position_mini_window(app, &mini);

    Ok(())
}

/// Get the current update channel setting (stable/beta)
#[tauri::command]
fn get_update_channel(app: AppHandle) -> Result<String, String> {
    use tauri_plugin_store::StoreBuilder;

    let store = StoreBuilder::new(&app, "settings.json")
        .build()
        .map_err(|e| format!("Failed to load settings: {}", e))?;

    let channel = store.get("settings")
        .and_then(|v| v.get("settings").cloned())
        .and_then(|v| v.get("update_channel").cloned())
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "stable".to_string());

    Ok(channel)
}

/// Set the update channel preference (stable/beta)
#[tauri::command]
fn set_update_channel(app: AppHandle, channel: String) -> Result<(), String> {
    use tauri_plugin_store::StoreBuilder;

    // Validate channel value
    if channel != "stable" && channel != "beta" {
        return Err(format!("Invalid channel: '{}'. Must be 'stable' or 'beta'", channel));
    }

    let store = StoreBuilder::new(&app, "settings.json")
        .build()
        .map_err(|e| format!("Failed to load settings: {}", e))?;

    let mut data = store.get("settings").unwrap_or_else(|| json!({}));
    if let Some(root) = data.as_object_mut() {
        let settings_value = root.entry("settings").or_insert_with(|| json!({}));
        if let Some(settings_obj) = settings_value.as_object_mut() {
            settings_obj.insert("update_channel".into(), json!(channel));
        }
    }
    store.set("settings", data);
    store.save()
        .map_err(|e| format!("Failed to save settings: {}", e))?;

    tracing::info!("Update channel set to: {}", channel);
    Ok(())
}

/// Set the translate mode preference and notify all windows
#[tauri::command]
fn set_translate_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_store::StoreBuilder;

    let store = StoreBuilder::new(&app, "settings.json")
        .build()
        .map_err(|e| format!("Failed to load settings: {}", e))?;

    let mut data = store.get("settings").unwrap_or_else(|| json!({}));
    if let Some(root) = data.as_object_mut() {
        let settings_value = root.entry("settings").or_insert_with(|| json!({}));
        if let Some(settings_obj) = settings_value.as_object_mut() {
            settings_obj.insert("translate_mode".into(), json!(enabled));
        }
    }
    store.set("settings", data);
    store.save()
        .map_err(|e| format!("Failed to save settings: {}", e))?;

    // Emit event to notify all windows
    let _ = app.emit("translate-mode-changed", enabled);

    tracing::info!("Translate mode set to: {}", enabled);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging system
    let log_layer = logging::init_logging();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            audio_recorder: Mutex::new(AudioRecorder::new()),
            hotkeys: Mutex::new(HotkeyConfig::default()),
            whisper: WhisperState {
                cache: Arc::new(TokioMutex::new(WhisperCache {
                    context: None,
                    state: None,
                    loaded_model: String::new(),
                })),
            },
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_audio_devices,
            start_recording,
            stop_recording,
            is_recording,
            exit_app,
            set_mini_window_mode,
            close_mini_window,
            log_separator,
            open_app_data_dir,
            is_autostart_enabled,
            set_autostart,
            update_hotkeys,
            transcribe_audio,
            load_recording,
            paste_text_to_active_window,
            type_text_at_cursor,
            updater::check_for_updates,
            updater::download_and_install_update,
            updater::is_updater_available,
            get_update_channel,
            set_update_channel,
            set_translate_mode,
            download_local_model,
            check_local_model_exists,
            delete_local_model,
            delete_recording_files,
            ai_process_text,
            notes::list_notes,
            notes::read_note,
            notes::create_note,
            notes::update_note,
            notes::delete_note,
            notes::search_notes,
            notes::toggle_note_favorite,
            transcriptions::list_transcriptions,
            transcriptions::save_transcription,
            transcriptions::delete_transcription,
            transcriptions::clear_transcriptions,
            transcriptions::update_transcription,
            logs::list_logs,
            logs::save_log,
            logs::clear_logs
        ])
        .setup(move |app| {
            // Enable logging to frontend
            log_layer.set_app_handle(app.handle().clone());

            // Clean up legacy transcription_history from settings.json
            if let Err(e) = transcriptions::cleanup_legacy_transcriptions(app.handle()) {
                tracing::warn!("Failed to cleanup legacy transcriptions: {}", e);
            }

            // Clean up legacy app_logs from settings.json
            if let Err(e) = logs::cleanup_legacy_logs(app.handle()) {
                tracing::warn!("Failed to cleanup legacy logs: {}", e);
            }

            // Migrate notes from settings.json to file-based storage
            match notes::migrate_notes_from_store(app.handle()) {
                Ok(count) if count > 0 => {
                    tracing::info!("Notes migration completed: {} notes migrated", count);
                }
                Err(e) => {
                    tracing::warn!("Notes migration failed: {}", e);
                }
                _ => {}
            }

            // Create mini window at startup
            create_mini_window(&app.handle())?;

            // Check if app was started with --minimized flag
            let args: Vec<String> = std::env::args().collect();
            let has_minimized_flag = args
                .iter()
                .any(|arg| arg == "--minimized" || arg == "--hidden");

            // Prepare settings store to restore window state
            let window_store = StoreBuilder::new(app, "settings.json").build()?;

            // Check if user wants to start minimized on boot
            let should_start_minimized = if has_minimized_flag {
                // App was started with --minimized, check the user's preference
                let start_minimized = window_store
                    .get("settings")
                    .and_then(|settings_root| {
                        settings_root.get("settings").and_then(|settings_obj| {
                            settings_obj
                                .get("start_minimized_on_boot")
                                .and_then(|v| v.as_bool())
                        })
                    })
                    .unwrap_or(true); // Default to true if setting not found
                start_minimized
            } else {
                false
            };

            if let Some(window) = app.get_webview_window("main") {
                // Always restore window state (position/size) even when starting hidden
                restore_window_state(&window, &window_store);

                // Show window only if NOT starting minimized
                if !should_start_minimized {
                    let _ = window.show();
                }
                // If should_start_minimized is true, window stays hidden but state is restored

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
                        WindowEvent::Resized(_)
                        | WindowEvent::Moved(_)
                        | WindowEvent::ScaleFactorChanged { .. } => {
                            capture_window_state(&events_window, &events_store);
                        }
                        _ => {}
                    }
                });
            }

            // Register global shortcuts based on stored configuration
            let initial_hotkeys = load_hotkey_config(&window_store);
            match apply_hotkeys(&app.handle(), &initial_hotkeys) {
                Ok(_) => {
                    if let Ok(mut guard) = app.state::<AppState>().inner().hotkeys.lock() {
                        *guard = initial_hotkeys;
                    }
                }
                Err(err) => {
                    eprintln!("[hotkeys] Initial registration failed: {}", err);
                }
            }

            // Preload Whisper model in background if Local provider is configured
            let preload_handle = app.handle().clone();
            let preload_store = window_store.clone();
            tauri::async_runtime::spawn(async move {
                let provider = preload_store
                    .get("settings")
                    .and_then(|root| root.get("settings").cloned())
                    .and_then(|s| {
                        s.get("transcription_provider")
                            .and_then(|v| v.as_str().map(String::from))
                    });

                let model_size = preload_store
                    .get("settings")
                    .and_then(|root| root.get("settings").cloned())
                    .and_then(|s| {
                        s.get("local_model_size")
                            .and_then(|v| v.as_str().map(String::from))
                    })
                    .unwrap_or_else(|| "base".to_string());

                if provider.as_deref() != Some("Local") {
                    tracing::info!("Skipping whisper preload (provider is not Local)");
                    return;
                }

                if !transcription_local::check_model_exists(&model_size) {
                    tracing::info!(
                        "Skipping whisper preload (model '{}' not downloaded)",
                        model_size
                    );
                    return;
                }

                tracing::info!("Preloading whisper model: {}", model_size);

                let state = preload_handle.state::<AppState>();
                let mut cache = state.whisper.cache.lock().await;

                if let Ok(model_path) = transcription_local::get_model_path(&model_size) {
                    let path_str = model_path.to_string_lossy().to_string();
                    match WhisperContext::new_with_params(
                        &path_str,
                        WhisperContextParameters::default(),
                    ) {
                        Ok(ctx) => match ctx.create_state() {
                            Ok(whisper_state) => {
                                cache.context = Some(ctx);
                                cache.state = Some(whisper_state);
                                cache.loaded_model = model_size.clone();
                                tracing::info!(
                                    "Whisper model '{}' preloaded successfully",
                                    model_size
                                );
                            }
                            Err(e) => {
                                tracing::warn!(
                                    "Failed to create whisper state during preload: {:?}",
                                    e
                                );
                            }
                        },
                        Err(e) => {
                            tracing::warn!("Failed to preload whisper model: {:?}", e);
                        }
                    }
                }
            });

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
