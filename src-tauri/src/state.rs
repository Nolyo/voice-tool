use std::sync::{Arc, Mutex};
use tokio::sync::Mutex as TokioMutex;

use crate::audio::AudioRecorder;

#[derive(Clone, Default)]
pub(crate) struct HotkeyConfig {
    pub(crate) record: Option<String>,
    pub(crate) ptt: Option<String>,
    pub(crate) open_window: Option<String>,
    pub(crate) cancel: Option<String>,
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
    pub(crate) audio_recorder: Mutex<AudioRecorder>,
    pub(crate) hotkeys: Mutex<HotkeyConfig>,
    pub whisper: WhisperState,
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
            })),
        },
    }
}
