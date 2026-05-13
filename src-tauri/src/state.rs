use std::sync::{Arc, Mutex};
use tokio::sync::Mutex as TokioMutex;
use tokio::task::JoinHandle;

use crate::audio::AudioRecorder;

#[derive(Clone, Default)]
pub(crate) struct HotkeyConfig {
    pub(crate) record: Option<String>,
    pub(crate) ptt: Option<String>,
    pub(crate) open_window: Option<String>,
    pub(crate) cancel: Option<String>,
    /// Only active while a recording is in progress. Toggles `post_process_enabled`.
    pub(crate) post_process_toggle: Option<String>,
}

/// Holds a cached whisper context + state so state buffers are allocated once
pub struct WhisperCache {
    pub context: Option<whisper_rs::WhisperContext>,
    pub state: Option<whisper_rs::WhisperState>,
    pub loaded_model: String,
    /// Whether the model was loaded using GPU acceleration
    pub is_gpu: bool,
    /// Handle to the auto-unload timer task (cancelled on new transcription)
    pub unload_handle: Option<JoinHandle<()>>,
}

pub struct WhisperState {
    pub cache: Arc<TokioMutex<WhisperCache>>,
}

/// Snapshot of cloud eligibility pushed by the renderer's CloudContext.
///
/// Used by hotkey-triggered `start_recording` to refuse capture when the user
/// picked "LexenaCloud" but isn't signed-in / eligible — otherwise the user
/// records 20s of audio that will be rejected post-capture by the renderer.
#[derive(Clone, Default)]
pub(crate) struct CloudGate {
    /// Last known `transcription_provider` from settings (`"Local"` or
    /// `"LexenaCloud"`). Defaults to empty until the renderer pushes its first
    /// snapshot, which leaves the gate open (no block).
    pub(crate) provider: String,
    /// Whether the signed-in user is server-side eligible for cloud
    /// (active trial or active subscription).
    pub(crate) eligible: bool,
}

/// Application state that holds the audio recorder and active hotkeys
pub struct AppState {
    pub(crate) audio_recorder: Mutex<AudioRecorder>,
    pub(crate) hotkeys: Mutex<HotkeyConfig>,
    pub whisper: WhisperState,
    /// ID of the currently active profile — populated during setup by profiles::init_active_profile
    pub active_profile_id: Mutex<String>,
    /// Auth state: pending OAuth nonces, memory-fallback refresh token, keyring flag
    pub auth: Mutex<crate::auth::AuthState>,
    /// Cloud routing snapshot pushed by the renderer; used by hotkey handlers
    /// to refuse `start_recording` when LexenaCloud is selected but ineligible.
    pub(crate) cloud_gate: Mutex<CloudGate>,
}

pub(crate) fn create_app_state() -> AppState {
    AppState {
        audio_recorder: Mutex::new(AudioRecorder::new()),
        hotkeys: Mutex::new(HotkeyConfig::default()),
        whisper: WhisperState {
            cache: Arc::new(TokioMutex::new(WhisperCache {
                context: None,
                state: None,
                loaded_model: String::new(),
                is_gpu: false,
                unload_handle: None,
            })),
        },
        active_profile_id: Mutex::new(String::new()),
        auth: Mutex::new(crate::auth::AuthState::new()),
        cloud_gate: Mutex::new(CloudGate::default()),
    }
}
