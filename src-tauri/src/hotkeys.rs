use std::sync::Arc;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

use crate::audio::RecordingResult;
use crate::state::{AppState, HotkeyConfig};
use crate::window::{hide_mini_window, show_mini_window};

pub(crate) fn hotkeys_conflict(config: &HotkeyConfig) -> Option<String> {
    let equals = |a: &Option<String>, b: &Option<String>| match (a, b) {
        (Some(lhs), Some(rhs)) => lhs.eq_ignore_ascii_case(rhs),
        _ => false,
    };

    if equals(&config.record, &config.ptt) {
        return Some("Toggle and Push-to-talk shortcuts must be different.".into());
    }
    if equals(&config.record, &config.open_window) || equals(&config.ptt, &config.open_window) {
        return Some("Open window shortcut must be distinct from recording shortcuts.".into());
    }
    if equals(&config.cancel, &config.record)
        || equals(&config.cancel, &config.ptt)
        || equals(&config.cancel, &config.open_window)
    {
        return Some("Cancel shortcut must be distinct from other shortcuts.".into());
    }

    None
}

pub(crate) fn parse_hotkey_str(value: &str) -> Result<Shortcut, String> {
    value
        .parse::<Shortcut>()
        .map_err(|err| format!("Invalid shortcut \"{}\": {}", value, err))
}

pub(crate) fn normalize_hotkey_value(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

pub(crate) fn load_hotkey_config<R: Runtime>(store: &Arc<tauri_plugin_store::Store<R>>) -> HotkeyConfig {
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

// --- Recording shortcut helpers ---

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
        let _ = recorder.stop_recording(silence_threshold);
    }

    let _ = app_handle.emit("recording-state", false);
    let _ = app_handle.emit("recording-cancelled", ());
    unregister_cancel_shortcut(app_handle);
    hide_mini_window(app_handle);
    tracing::info!("Recording cancelled by user (no transcription)");
}

fn emit_audio_samples<R: Runtime>(app_handle: &AppHandle<R>, recording: RecordingResult) {
    let _ = app_handle.emit(
        "audio-captured",
        serde_json::json!({
            "samples": recording.audio_data,
            "sampleRate": recording.sample_rate,
            "avgRms": recording.avg_rms,
            "isSilent": recording.is_silent
        }),
    );
}

// --- Cancel shortcut dynamic registration ---

pub(crate) fn register_cancel_shortcut<R: Runtime>(app_handle: &AppHandle<R>) {
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

pub(crate) fn unregister_cancel_shortcut<R: Runtime>(app_handle: &AppHandle<R>) {
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

// --- Apply hotkeys (register all shortcuts with callbacks) ---

pub(crate) fn apply_hotkeys<R: Runtime>(
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
                    "Failed to register shortcut \"{}\": {}",
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
                }
            };

        manager
            .on_shortcut(ptt_shortcut.clone(), handler)
            .map_err(|e| {
                format!(
                    "Failed to register shortcut \"{}\": {}",
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
                    "Failed to register shortcut \"{}\": {}",
                    open_label, e
                )
            })?;
    }

    Ok(())
}

/// Setup initial hotkeys from stored configuration during app startup
pub(crate) fn setup_initial_hotkeys(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_store::StoreBuilder;

    let store = StoreBuilder::new(app, "settings.json").build()?;
    let initial_hotkeys = load_hotkey_config(&store);

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

    Ok(())
}
