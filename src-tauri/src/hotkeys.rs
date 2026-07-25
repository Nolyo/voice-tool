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
    if equals(&config.post_process_toggle, &config.record)
        || equals(&config.post_process_toggle, &config.ptt)
        || equals(&config.post_process_toggle, &config.open_window)
        || equals(&config.post_process_toggle, &config.cancel)
    {
        return Some("Post-process toggle shortcut must be distinct from other shortcuts.".into());
    }
    if equals(&config.repaste, &config.record)
        || equals(&config.repaste, &config.ptt)
        || equals(&config.repaste, &config.open_window)
        || equals(&config.repaste, &config.cancel)
        || equals(&config.repaste, &config.post_process_toggle)
    {
        return Some("Repaste shortcut must be distinct from other shortcuts.".into());
    }
    if equals(&config.voice_edit, &config.record)
        || equals(&config.voice_edit, &config.ptt)
        || equals(&config.voice_edit, &config.open_window)
        || equals(&config.voice_edit, &config.cancel)
        || equals(&config.voice_edit, &config.post_process_toggle)
        || equals(&config.voice_edit, &config.repaste)
    {
        return Some("Voice Edit shortcut must be distinct from other shortcuts.".into());
    }

    None
}

pub(crate) fn parse_hotkey_str(value: &str) -> Result<Shortcut, String> {
    value
        .parse::<Shortcut>()
        .map_err(|err| format!("Invalid shortcut \"{}\": {}", value, err))
}

/// True when `candidate` is already bound to one of `others` (case-insensitive,
/// matching [`hotkeys_conflict`]).
///
/// Guards the first-run defaults: injecting one that a user already assigned by
/// hand makes the whole config conflicting, and `apply_hotkeys` refuses a
/// conflicting config outright — costing the user *every* shortcut, not just
/// the new one.
fn hotkey_taken(candidate: &str, others: &[&Option<String>]) -> bool {
    others.iter().any(|other| {
        other
            .as_deref()
            .is_some_and(|value| value.eq_ignore_ascii_case(candidate))
    })
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
    let mut repaste_present = false;
    let mut voice_edit_present = false;

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
            if let Some(value) = settings_obj
                .get("post_process_toggle_hotkey")
                .and_then(Value::as_str)
            {
                config.post_process_toggle = normalize_hotkey_value(Some(value.to_string()));
            }
            if let Some(value) = settings_obj.get("repaste_hotkey") {
                repaste_present = true;
                config.repaste = value
                    .as_str()
                    .and_then(|s| normalize_hotkey_value(Some(s.to_string())));
            }
            if let Some(value) = settings_obj.get("voice_edit_hotkey") {
                voice_edit_present = true;
                config.voice_edit = value
                    .as_str()
                    .and_then(|s| normalize_hotkey_value(Some(s.to_string())));
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
    // repaste defaults to Ctrl+F10 on first run / upgrade (key absent). An
    // explicitly-empty stored value means the user disabled it — leave it None.
    // Skipped when the user already bound that combination to something else:
    // an upgrade must never cost them the shortcuts they had.
    if !repaste_present && config.repaste.is_none() {
        let candidate = "Ctrl+F10";
        if hotkey_taken(
            candidate,
            &[
                &config.record,
                &config.ptt,
                &config.open_window,
                &config.cancel,
                &config.post_process_toggle,
            ],
        ) {
            tracing::warn!(
                "Default repaste shortcut {} is already in use, leaving repaste disabled",
                candidate
            );
        } else {
            config.repaste = Some(candidate.into());
        }
    }
    // Same first-run / upgrade rule as repaste: an explicitly-empty stored
    // value means the user disabled Voice Edit, so leave it None.
    if !voice_edit_present && config.voice_edit.is_none() {
        let candidate = "Ctrl+F9";
        if hotkey_taken(
            candidate,
            &[
                &config.record,
                &config.ptt,
                &config.open_window,
                &config.cancel,
                &config.post_process_toggle,
                &config.repaste,
            ],
        ) {
            tracing::warn!(
                "Default Voice Edit shortcut {} is already in use, leaving Voice Edit disabled",
                candidate
            );
        } else {
            config.voice_edit = Some(candidate.into());
        }
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

/// Recording shortcuts must stand down while Voice Edit holds the microphone.
///
/// Both make `is_recorder_active` true, but the Voice Edit audio is a spoken
/// *instruction*: stopping it through the dictation path would ship it as
/// `audio-captured` and the renderer would transcribe and paste "translate
/// this" into whatever the user was editing.
fn voice_edit_owns_microphone<R: Runtime>(app_handle: &AppHandle<R>) -> bool {
    if crate::voice_edit::is_capture_active(app_handle) {
        tracing::info!("Recording shortcut ignored: Voice Edit is capturing an instruction");
        return true;
    }
    false
}

fn start_recording_shortcut<R: Runtime>(app_handle: &AppHandle<R>) -> bool {
    let state: State<AppState> = app_handle.state();

    // Refuse hotkey-triggered capture when the user picked "LexenaCloud" but
    // is not eligible (not signed-in / no active trial / no active sub). The
    // renderer pushes this snapshot via the `set_cloud_gate` command from
    // CloudContext. We emit `cloud-gate-blocked` so the renderer can surface
    // a toast (instead of letting the user speak for 20s before we tell them).
    if let Ok(gate) = state.inner().cloud_gate.lock() {
        if gate.provider == "LexenaCloud" && !gate.eligible {
            tracing::info!(
                "Hotkey start_recording refused: LexenaCloud selected but user not eligible"
            );
            let _ = app_handle.emit("cloud-gate-blocked", ());
            return false;
        }
    }

    if let Ok(mut recorder) = state.inner().audio_recorder.lock() {
        if recorder.is_recording() {
            return true;
        }
        match recorder.start_recording(None, app_handle.clone()) {
            Ok(_) => {
                crate::streaming::maybe_start_streaming_session(
                    state.inner(),
                    &mut recorder,
                    app_handle,
                );
                drop(recorder);
                let _ = app_handle.emit("recording-state", true);
                register_cancel_shortcut(app_handle);
                register_post_process_toggle_shortcut(app_handle);
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

/// Stop the hotkey-triggered recording. The boolean is true when a streaming
/// session was active for this recording — in that case the caller must NOT
/// emit `audio-captured` (chunks were already shipped to the renderer).
fn stop_recording_shortcut<R: Runtime>(
    app_handle: &AppHandle<R>,
) -> Option<(RecordingResult, bool)> {
    let state: State<AppState> = app_handle.state();

    let silence_threshold = 0.005;

    let result = if let Ok(mut recorder) = state.inner().audio_recorder.lock() {
        if !recorder.is_recording() {
            None
        } else {
            let stopped = recorder.stop_recording(silence_threshold);
            let streaming_was_active =
                crate::streaming::end_streaming_session(state.inner(), &mut recorder, false);
            Some((stopped, streaming_was_active))
        }
    } else {
        None
    };

    let _ = app_handle.emit("recording-state", false);
    unregister_cancel_shortcut(app_handle);
    unregister_post_process_toggle_shortcut(app_handle);

    match result {
        Some((Ok(recording), streaming_was_active)) => Some((recording, streaming_was_active)),
        Some((Err(err), _)) => {
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
        // Abort the streaming session: nothing must be finalized.
        let _ = crate::streaming::end_streaming_session(state.inner(), &mut recorder, true);
    }

    let _ = app_handle.emit("recording-state", false);
    let _ = app_handle.emit("recording-cancelled", ());
    unregister_cancel_shortcut(app_handle);
    unregister_post_process_toggle_shortcut(app_handle);
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

// --- Post-process toggle shortcut dynamic registration ---
// Only active while a recording is in progress. Flips `post_process_enabled`
// in the store and broadcasts `post-process-enabled-changed` so both windows
// stay in sync.

fn toggle_post_process_enabled<R: Runtime>(app_handle: &AppHandle<R>) {
    use tauri_plugin_store::StoreBuilder;

    let profile_id = {
        let state: State<AppState> = app_handle.state();
        state
            .inner()
            .active_profile_id
            .lock()
            .map(|g| g.clone())
            .unwrap_or_else(|_| "default".to_string())
    };
    let store_path = format!("profiles/{}/settings.json", profile_id);
    let store = match StoreBuilder::new(app_handle, store_path).build() {
        Ok(s) => s,
        Err(err) => {
            tracing::warn!(
                "Failed to open settings store for post-process toggle: {}",
                err
            );
            return;
        }
    };

    let mut data = store.get("settings").unwrap_or_else(|| serde_json::json!({}));
    let current = data
        .get("settings")
        .and_then(|s| s.get("post_process_enabled"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let next = !current;

    if let Some(root) = data.as_object_mut() {
        let settings_value = root
            .entry("settings")
            .or_insert_with(|| serde_json::json!({}));
        if let Some(settings_obj) = settings_value.as_object_mut() {
            settings_obj.insert("post_process_enabled".into(), serde_json::json!(next));
        }
    }
    store.set("settings", data);
    if let Err(err) = store.save() {
        tracing::warn!("Failed to persist post_process_enabled: {}", err);
        return;
    }

    let _ = app_handle.emit("post-process-enabled-changed", next);
    tracing::info!("Post-process enabled toggled via hotkey: {}", next);
}

pub(crate) fn register_post_process_toggle_shortcut<R: Runtime>(app_handle: &AppHandle<R>) {
    let handle = app_handle.clone();
    std::thread::spawn(move || {
        let state: State<AppState> = handle.state();
        let hotkey_str = {
            let guard = state.inner().hotkeys.lock().unwrap();
            guard.post_process_toggle.clone()
        };

        let Some(hotkey_str) = hotkey_str else {
            return;
        };

        let shortcut = match parse_hotkey_str(&hotkey_str) {
            Ok(s) => s,
            Err(err) => {
                tracing::warn!("Failed to parse post-process toggle shortcut: {}", err);
                return;
            }
        };

        let manager = handle.global_shortcut();

        if manager.is_registered(shortcut.clone()) {
            return;
        }

        let handler = move |app: &AppHandle<R>, _shortcut: &Shortcut, event: ShortcutEvent| {
            if event.state == ShortcutState::Pressed && is_recorder_active(app) {
                toggle_post_process_enabled(app);
            }
        };

        if let Err(err) = manager.on_shortcut(shortcut, handler) {
            tracing::warn!("Failed to register post-process toggle shortcut: {}", err);
        }
    });
}

pub(crate) fn unregister_post_process_toggle_shortcut<R: Runtime>(app_handle: &AppHandle<R>) {
    let handle = app_handle.clone();
    std::thread::spawn(move || {
        let state: State<AppState> = handle.state();
        let hotkey_str = {
            let guard = state.inner().hotkeys.lock().unwrap();
            guard.post_process_toggle.clone()
        };

        let Some(hotkey_str) = hotkey_str else {
            return;
        };

        let shortcut = match parse_hotkey_str(&hotkey_str) {
            Ok(s) => s,
            Err(err) => {
                tracing::warn!(
                    "Failed to parse post-process toggle shortcut for unregister: {}",
                    err
                );
                return;
            }
        };

        let manager = handle.global_shortcut();

        if !manager.is_registered(shortcut.clone()) {
            return;
        }

        if let Err(err) = manager.unregister(shortcut) {
            tracing::warn!("Failed to unregister post-process toggle shortcut: {}", err);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::HotkeyConfig;

    fn base_config() -> HotkeyConfig {
        HotkeyConfig {
            record: Some("Ctrl+F11".into()),
            ptt: Some("Ctrl+F12".into()),
            open_window: Some("Ctrl+Alt+O".into()),
            cancel: Some("Escape".into()),
            post_process_toggle: None,
            repaste: Some("Ctrl+F10".into()),
            voice_edit: Some("Ctrl+F9".into()),
        }
    }

    #[test]
    fn voice_edit_conflict_is_reported_as_such() {
        let mut config = base_config();
        config.voice_edit = config.ptt.clone();
        let message = hotkeys_conflict(&config).expect("collision must be reported");
        assert!(
            message.contains("Voice Edit"),
            "the message must name the offending shortcut, got: {}",
            message
        );
    }

    #[test]
    fn voice_edit_colliding_with_open_window_is_rejected() {
        let mut config = base_config();
        config.voice_edit = config.open_window.clone();
        assert!(hotkeys_conflict(&config).is_some());
    }

    #[test]
    fn voice_edit_colliding_with_post_process_toggle_is_rejected() {
        let mut config = base_config();
        config.post_process_toggle = Some("Ctrl+F8".into());
        config.voice_edit = Some("ctrl+f8".into());
        assert!(
            hotkeys_conflict(&config).is_some(),
            "comparison must ignore case"
        );
    }

    #[test]
    fn voice_edit_disabled_never_conflicts() {
        let mut config = base_config();
        config.voice_edit = None;
        config.repaste = None;
        assert!(hotkeys_conflict(&config).is_none());
    }

    #[test]
    fn voice_edit_colliding_with_repaste_is_rejected() {
        let mut config = base_config();
        config.voice_edit = config.repaste.clone();
        assert!(hotkeys_conflict(&config).is_some());
    }

    #[test]
    fn voice_edit_colliding_with_record_is_rejected() {
        let mut config = base_config();
        config.voice_edit = config.record.clone();
        assert!(hotkeys_conflict(&config).is_some());
    }

    #[test]
    fn voice_edit_colliding_with_cancel_is_rejected() {
        let mut config = base_config();
        config.voice_edit = Some("Escape".into());
        assert!(hotkeys_conflict(&config).is_some());
    }

    #[test]
    fn repaste_distinct_is_accepted() {
        assert!(hotkeys_conflict(&base_config()).is_none());
    }

    #[test]
    fn repaste_colliding_with_record_is_rejected() {
        let mut config = base_config();
        config.repaste = config.record.clone();
        assert!(hotkeys_conflict(&config).is_some());
    }

    #[test]
    fn repaste_colliding_with_cancel_is_rejected() {
        let mut config = base_config();
        config.repaste = Some("Escape".into());
        assert!(hotkeys_conflict(&config).is_some());
    }

    #[test]
    fn hotkey_taken_matches_ignoring_case() {
        let record = Some("Ctrl+F9".to_string());
        assert!(hotkey_taken("ctrl+f9", &[&record]));
    }

    #[test]
    fn hotkey_taken_ignores_unset_entries() {
        let none: Option<String> = None;
        let other = Some("Ctrl+F11".to_string());
        assert!(!hotkey_taken("Ctrl+F9", &[&none, &other]));
    }

    /// Regression guard for the upgrade path: a user who already bound Ctrl+F9
    /// must not get the Voice Edit default injected on top of it, because
    /// `apply_hotkeys` refuses a conflicting config wholesale and would leave
    /// them with no global shortcut at all.
    #[test]
    fn injected_default_would_conflict_when_already_bound() {
        let mut config = base_config();
        config.record = Some("Ctrl+F9".into());
        config.voice_edit = None;

        assert!(hotkey_taken(
            "Ctrl+F9",
            &[
                &config.record,
                &config.ptt,
                &config.open_window,
                &config.cancel,
                &config.post_process_toggle,
                &config.repaste,
            ]
        ));

        // Left disabled, the config stays valid.
        assert!(hotkeys_conflict(&config).is_none());
    }
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

    let repaste_hotkey = config
        .repaste
        .as_ref()
        .map(|value| parse_hotkey_str(value).map(|shortcut| (value.clone(), shortcut)))
        .transpose()?;

    let voice_edit_hotkey = config
        .voice_edit
        .as_ref()
        .map(|value| parse_hotkey_str(value).map(|shortcut| (value.clone(), shortcut)))
        .transpose()?;

    if let Some((record_label, record_shortcut)) = record_hotkey {
        let handler = move |app: &AppHandle<R>, _shortcut: &Shortcut, event: ShortcutEvent| {
            if event.state == ShortcutState::Pressed {
                if voice_edit_owns_microphone(app) {
                    return;
                }
                if is_recorder_active(app) {
                    if let Some((recording, streaming_was_active)) = stop_recording_shortcut(app) {
                        if !streaming_was_active {
                            emit_audio_samples(app, recording);
                        }
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
            move |app: &AppHandle<R>, _shortcut: &Shortcut, event: ShortcutEvent| {
                // Guards the release too: the press was ignored, so the release
                // must not stop a microphone Voice Edit opened.
                if voice_edit_owns_microphone(app) {
                    return;
                }
                match event.state {
                    ShortcutState::Pressed => {
                        show_mini_window(app);
                        if !start_recording_shortcut(app) {
                            hide_mini_window(app);
                        }
                    }
                    ShortcutState::Released => {
                        if let Some((recording, streaming_was_active)) = stop_recording_shortcut(app)
                        {
                            if !streaming_was_active {
                                emit_audio_samples(app, recording);
                            }
                        }
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

    if let Some((repaste_label, repaste_shortcut)) = repaste_hotkey {
        let handler = move |app: &AppHandle<R>, _shortcut: &Shortcut, event: ShortcutEvent| {
            if event.state == ShortcutState::Pressed {
                let _ = app.emit("repaste-last-transcription", ());
            }
        };

        manager
            .on_shortcut(repaste_shortcut.clone(), handler)
            .map_err(|e| {
                format!(
                    "Failed to register shortcut \"{}\": {}",
                    repaste_label, e
                )
            })?;
    }

    if let Some((voice_edit_label, voice_edit_shortcut)) = voice_edit_hotkey {
        let handler = move |app: &AppHandle<R>, _shortcut: &Shortcut, event: ShortcutEvent| {
            if event.state == ShortcutState::Pressed {
                open_voice_edit_overlay(app);
            }
        };

        manager
            .on_shortcut(voice_edit_shortcut.clone(), handler)
            .map_err(|e| {
                format!(
                    "Failed to register shortcut \"{}\": {}",
                    voice_edit_label, e
                )
            })?;
    }

    Ok(())
}

/// Voice Edit entry point: capture the selection of whatever window is in
/// front, then show the overlay and start listening for the instruction.
///
/// Capture must happen *before* the overlay appears — the simulated `Ctrl+C`
/// goes to the focused window, and by then that would be the overlay itself.
fn open_voice_edit_overlay<R: Runtime>(app_handle: &AppHandle<R>) {
    // Early-out *before* the clipboard round-trip: the capture hijacks the
    // clipboard and sleeps 120 ms, neither of which is acceptable in the middle
    // of a dictation. `start_instruction_capture` re-checks authoritatively
    // under the recorder lock; this check only avoids the side effects.
    if is_recorder_active(app_handle) {
        tracing::warn!("Voice Edit ignored: a recording is already in progress");
        let _ = app_handle.emit("voice-edit-blocked", "recording_in_progress");
        return;
    }

    // A failed capture is not fatal: the overlay opens with no selection, which
    // is exactly what the user sees anyway, and the microphone still takes a
    // free-form instruction. Bailing out here would make the shortcut look dead.
    let captured = crate::commands::selection::capture_selection_inner(app_handle)
        .unwrap_or_else(|err| {
            tracing::error!("Voice Edit: selection capture failed: {}", err);
            crate::commands::selection::CapturedSelection::empty()
        });

    let _ = app_handle.emit(
        "voice-edit-open",
        serde_json::json!({
            "text": captured.text,
            "sourceWindow": captured.source_window,
            "hadSelection": captured.had_selection,
            "truncated": captured.truncated,
        }),
    );

    crate::window::show_voice_edit_window(app_handle);

    if !crate::voice_edit::start_instruction_capture(app_handle) {
        // The palette still works without the microphone, but the overlay would
        // otherwise sit on "Say your instruction…" forever.
        let _ = app_handle.emit("voice-edit-blocked", "mic_unavailable");
    }
}

/// Setup initial hotkeys from stored configuration during app startup
pub(crate) fn setup_initial_hotkeys(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_store::StoreBuilder;

    let settings_path = crate::profiles::settings_store_path(&app.handle());
    let store = StoreBuilder::new(app, settings_path).build()?;
    let initial_hotkeys = load_hotkey_config(&store);

    let applied = match apply_hotkeys(&app.handle(), &initial_hotkeys) {
        Ok(_) => Some(initial_hotkeys),
        Err(err) => {
            // `apply_hotkeys` is all-or-nothing, so one bad entry would
            // otherwise leave the app with *no* global shortcut at all. Retry
            // without the optional ones so recording keeps working.
            tracing::error!(
                "[hotkeys] initial registration failed ({}), retrying without the optional shortcuts",
                err
            );
            let fallback = HotkeyConfig {
                post_process_toggle: None,
                repaste: None,
                voice_edit: None,
                ..initial_hotkeys
            };
            match apply_hotkeys(&app.handle(), &fallback) {
                Ok(_) => Some(fallback),
                Err(err) => {
                    tracing::error!(
                        "[hotkeys] fallback registration failed too ({}): no global shortcut is active",
                        err
                    );
                    None
                }
            }
        }
    };

    if let Some(config) = applied {
        if let Ok(mut guard) = app.state::<AppState>().inner().hotkeys.lock() {
            *guard = config;
        }
    }

    Ok(())
}
