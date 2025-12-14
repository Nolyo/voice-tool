mod audio;
mod deepgram_streaming;
mod deepgram_types;
mod logging;
mod transcription;
mod updater;

use audio::{AudioDeviceInfo, AudioRecorder, RecordingResult};
use deepgram_streaming::DeepgramStreamer;
use serde::Serialize;
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{
    AppHandle, Emitter, Listener, Manager, PhysicalPosition, PhysicalSize, Position, Runtime, Size,
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

#[derive(Clone, Default)]
struct HotkeyConfig {
    record: Option<String>,
    ptt: Option<String>,
    open_window: Option<String>,
}

/// Application state that holds the audio recorder, Deepgram streamer, and active hotkeys
pub struct AppState {
    audio_recorder: Mutex<AudioRecorder>,
    deepgram_streamer: Arc<TokioMutex<DeepgramStreamer>>,
    hotkeys: Mutex<HotkeyConfig>,
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

    // Use provided threshold or default to 0.01 (typical silence level)
    let threshold = silence_threshold.unwrap_or(0.01);

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
        let _ = mini_window.show();
    }
}

fn hide_mini_window<R: Runtime>(app_handle: &AppHandle<R>) {
    if let Some(mini_window) = app_handle.get_webview_window("mini") {
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
                // Emit event for frontend to start Deepgram if needed
                let _ = app_handle.emit("shortcut-recording-started", true);
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
    let silence_threshold = 0.01;

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
    // Emit event for frontend to stop Deepgram if needed
    let _ = app_handle.emit("shortcut-recording-stopped", true);

    match result {
        Some(Ok(recording)) => Some(recording),
        Some(Err(err)) => {
            eprintln!("Error stopping recording: {}", err);
            None
        }
        None => None,
    }
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

    config
}
#[tauri::command]
async fn transcribe_audio(
    audio_samples: Vec<i16>,
    sample_rate: u32,
    api_key: String,
    language: String,
    keep_last: usize,
) -> Result<TranscriptionResponse, String> {
    tracing::info!(
        "transcribe_audio called with {} samples at {} Hz",
        audio_samples.len(),
        sample_rate
    );

    // Save audio to WAV file
    let wav_path = save_audio_to_wav(&audio_samples, sample_rate)
        .map_err(|e| format!("Failed to save audio: {}", e))?;

    // Transcribe using OpenAI Whisper
    let transcription = transcribe_with_openai(&wav_path, &api_key, &language)
        .await
        .map_err(|e| {
            tracing::error!("Transcription failed: {}", e);
            format!("Transcription failed: {}", e)
        })?;

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

/// Start Deepgram streaming transcription
#[tauri::command]
async fn start_deepgram_streaming(
    state: State<'_, AppState>,
    app_handle: AppHandle,
    api_key: String,
    language: String,
) -> Result<(), String> {
    tracing::info!("Starting Deepgram streaming transcription");

    // Get current sample rate from audio recorder
    let sample_rate = {
        let recorder = state.audio_recorder.lock().unwrap();
        recorder.get_sample_rate()
    };

    tracing::info!("Using sample rate: {} Hz for Deepgram", sample_rate);

    let mut streamer = state.deepgram_streamer.lock().await;
    streamer
        .connect(api_key, language, sample_rate, app_handle)
        .await
        .map_err(|e| {
            tracing::error!("Failed to connect to Deepgram: {}", e);
            format!("Failed to connect to Deepgram: {}", e)
        })
}

/// Stop Deepgram streaming transcription
#[tauri::command]
async fn stop_deepgram_streaming(state: State<'_, AppState>) -> Result<(), String> {
    tracing::info!("Stopping Deepgram streaming transcription");

    let mut streamer = state.deepgram_streamer.lock().await;
    streamer.disconnect().await;

    Ok(())
}

/// Check if Deepgram is currently connected
#[tauri::command]
async fn is_deepgram_connected(state: State<'_, AppState>) -> Result<bool, String> {
    let streamer = state.deepgram_streamer.lock().await;
    Ok(streamer.is_connected())
}

/// Send audio chunk to Deepgram for streaming transcription
#[tauri::command]
async fn send_audio_to_deepgram(
    state: State<'_, AppState>,
    audio_chunk: Vec<i16>,
) -> Result<(), String> {
    let streamer = state.deepgram_streamer.lock().await;
    streamer
        .send_audio(audio_chunk)
        .await
        .map_err(|e| format!("Failed to send audio to Deepgram: {}", e))
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
        .build()?;

    position_mini_window(app, &mini);

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging system
    let log_layer = logging::init_logging();

    tauri::Builder::default()
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
            deepgram_streamer: Arc::new(TokioMutex::new(DeepgramStreamer::new())),
            hotkeys: Mutex::new(HotkeyConfig::default()),
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
            is_autostart_enabled,
            set_autostart,
            update_hotkeys,
            transcribe_audio,
            load_recording,
            paste_text_to_active_window,
            start_deepgram_streaming,
            stop_deepgram_streaming,
            is_deepgram_connected,
            send_audio_to_deepgram,
            updater::check_for_updates,
            updater::download_and_install_update,
            updater::is_updater_available
        ])
        .setup(move |app| {
            // Enable logging to frontend
            log_layer.set_app_handle(app.handle().clone());

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

            // Setup audio-chunk listener to send directly to Deepgram
            let app_handle_audio = app.handle().clone();
            let _unlisten = app.listen("audio-chunk", move |event| {
                // Parse JSON payload
                if let Ok(json_value) = serde_json::from_str::<Value>(event.payload()) {
                    if let Some(payload) = json_value.as_array() {
                        let chunk: Vec<i16> = payload
                            .iter()
                            .filter_map(|v| v.as_i64().map(|n| n as i16))
                            .collect();

                        if !chunk.is_empty() {
                            let state = app_handle_audio.state::<AppState>();
                            let streamer = Arc::clone(&state.deepgram_streamer);

                            // Use tauri's async runtime to spawn the task
                            tauri::async_runtime::spawn(async move {
                                let streamer_guard = streamer.lock().await;
                                if streamer_guard.is_connected() {
                                    let _ = streamer_guard.send_audio(chunk).await;
                                }
                            });
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
