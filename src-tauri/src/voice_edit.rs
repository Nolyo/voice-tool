//! Instruction capture for Voice Edit.
//!
//! Voice Edit listens for a single short sentence ("translate this", "make it
//! shorter") rather than a continuous dictation, so it reuses the streaming
//! [`SpeechSegmenter`] with a different profile and stops at the *first*
//! complete segment instead of shipping an endless series of them.
//!
//! This path deliberately does **not** emit `recording-state`: the mini window
//! and the dashboard must not react as if the user had started a dictation.
//! It also bypasses the cloud gate — eligibility is checked by the renderer
//! before any network call, and refusing here would block the palette actions
//! that never reach the microphone at all.

use std::sync::mpsc::{Receiver, Sender};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use crate::state::AppState;
use crate::streaming::{SegmenterConfig, SpeechSegmenter, TapMsg};

/// Hard ceiling on how long the microphone stays open waiting for an
/// instruction. Without it, an overlay left open (or a user who walks away)
/// would keep the mic live indefinitely — unacceptable for an app whose pitch
/// is privacy.
const INSTRUCTION_TIMEOUT_SECS: u64 = 30;

/// Segmenter profile for a one-shot instruction.
///
/// Differs from the streaming profile on two points: a longer silence gap (an
/// instruction is short enough that a mid-sentence hesitation would otherwise
/// cut it in half) and a much shorter minimum (the streaming floor of 1400 ms
/// is longer than the word "traduis", which would make a silence cut
/// impossible).
pub(crate) fn voice_edit_segmenter_config(sample_rate: u32) -> SegmenterConfig {
    SegmenterConfig {
        silence_gap_ms: 800,
        min_segment_ms: 400,
        ..SegmenterConfig::new(sample_rate)
    }
}

#[derive(Default)]
pub(crate) struct VoiceEditRuntime {
    session_seq: u64,
    tap: Option<Sender<TapMsg>>,
}

impl VoiceEditRuntime {
    pub(crate) fn new() -> Self {
        Self::default()
    }
}

/// True while a Voice Edit instruction capture owns the microphone.
///
/// Used by the recording shortcuts to tell "the user is dictating" apart from
/// "Voice Edit is listening for an instruction": both make `is_recording()`
/// true, but only the former may be stopped and shipped for transcription.
pub(crate) fn is_capture_active<R: Runtime>(app_handle: &AppHandle<R>) -> bool {
    let state: State<AppState> = app_handle.state();
    // Takes the runtime lock alone and releases it before returning, so it can
    // never invert the recorder → runtime order used by the capture paths.
    state
        .inner()
        .voice_edit
        .lock()
        .map(|runtime| runtime.tap.is_some())
        .unwrap_or(false)
}

/// Open the microphone and listen for a single instruction.
///
/// Returns false when a recording is already in progress: the audio callback
/// has a single tap slot, so Voice Edit and a dictation cannot coexist.
pub(crate) fn start_instruction_capture<R: Runtime>(app_handle: &AppHandle<R>) -> bool {
    let state: State<AppState> = app_handle.state();

    let (session_id, sample_rate, rx) = {
        let Ok(mut recorder) = state.inner().audio_recorder.lock() else {
            tracing::warn!("Voice Edit: recorder lock poisoned");
            return false;
        };
        if recorder.is_recording() {
            tracing::warn!("Voice Edit: a recording is already in progress, ignoring");
            return false;
        }
        if let Err(err) = recorder.start_recording(None, app_handle.clone()) {
            tracing::error!("Voice Edit: failed to start instruction capture: {}", err);
            return false;
        }

        let Ok(mut runtime) = state.inner().voice_edit.lock() else {
            tracing::warn!("Voice Edit: runtime lock poisoned");
            // The microphone is already live at this point: bail out without
            // rolling it back and it would stay open forever, with no tap and
            // no worker to close it.
            let _ = recorder.stop_recording(0.005);
            return false;
        };
        runtime.session_seq += 1;
        let session_id = runtime.session_seq;
        let sample_rate = recorder.current_sample_rate();
        let (tx, rx) = std::sync::mpsc::channel::<TapMsg>();
        recorder.set_chunk_tap(Some(tx.clone()));
        runtime.tap = Some(tx);
        (session_id, sample_rate, rx)
    };

    let handle = app_handle.clone();
    std::thread::spawn(move || run_instruction_worker(handle, rx, session_id, sample_rate));

    tracing::info!(
        "Voice Edit instruction capture {} started ({} Hz)",
        session_id,
        sample_rate
    );
    true
}

/// Close the microphone. `abort = true` discards the audio (palette key pressed,
/// or the overlay was dismissed) instead of shipping it for transcription.
///
/// A no-op when no Voice Edit capture is running: the overlay calls this on
/// Escape and on every palette key, and it stays on top of a dictation the user
/// may have started meanwhile — stopping the recorder unconditionally would
/// silently kill that dictation.
pub(crate) fn stop_instruction_capture<R: Runtime>(app_handle: &AppHandle<R>, abort: bool) {
    let state: State<AppState> = app_handle.state();

    // Lock order must match `start_instruction_capture`: recorder, then
    // runtime. Taking them the other way round here would deadlock against a
    // concurrent start.
    let tap = {
        let Ok(mut recorder) = state.inner().audio_recorder.lock() else {
            return;
        };

        // Taking the tap out is what claims ownership: whoever gets `Some` is
        // the one that must tear the microphone down, and a second call finds
        // `None` and leaves the recorder alone.
        let tap = match state.inner().voice_edit.lock() {
            Ok(mut runtime) => runtime.tap.take(),
            Err(_) => None,
        };
        let Some(tap) = tap else {
            return;
        };

        if recorder.is_recording() {
            // The silence threshold is irrelevant here: the segmenter already
            // did the trimming, and the result of stop_recording is discarded.
            let _ = recorder.stop_recording(0.005);
        }
        recorder.set_chunk_tap(None);
        tap
    };

    let _ = tap.send(if abort { TapMsg::Abort } else { TapMsg::Finish });
}

/// Renderer-facing stop, used when a palette key is pressed or the overlay is
/// dismissed while the mic is still open.
#[tauri::command]
pub fn stop_voice_edit_instruction(app_handle: AppHandle, abort: bool) {
    stop_instruction_capture(&app_handle, abort);
}

fn emit_instruction<R: Runtime>(
    app_handle: &AppHandle<R>,
    session_id: u64,
    sample_rate: u32,
    samples: Vec<i16>,
) {
    tracing::info!(
        "Voice Edit instruction {} captured ({} samples)",
        session_id,
        samples.len()
    );
    let _ = app_handle.emit(
        "voice-edit-instruction",
        serde_json::json!({
            "sessionId": session_id,
            "samples": samples,
            "sampleRate": sample_rate,
        }),
    );
}

/// Nothing was said within the budget: close the microphone and let the overlay
/// tell the user, instead of leaving it live behind an idle window.
fn expire_instruction<R: Runtime>(app_handle: &AppHandle<R>, session_id: u64) {
    tracing::info!(
        "Voice Edit instruction {} timed out after {}s, closing the mic",
        session_id,
        INSTRUCTION_TIMEOUT_SECS
    );
    stop_instruction_capture(app_handle, true);
    let _ = app_handle.emit("voice-edit-instruction-timeout", session_id);
}

fn run_instruction_worker<R: Runtime>(
    app_handle: AppHandle<R>,
    rx: Receiver<TapMsg>,
    session_id: u64,
    sample_rate: u32,
) {
    let mut segmenter = SpeechSegmenter::new(voice_edit_segmenter_config(sample_rate));
    // Absolute deadline, not a per-`recv` timeout: the audio callback pushes a
    // batch every few milliseconds whether or not anyone is speaking, so a
    // per-call timeout would be rearmed forever and the microphone would never
    // close for a user who walked away.
    let deadline = Instant::now() + Duration::from_secs(INSTRUCTION_TIMEOUT_SECS);

    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            expire_instruction(&app_handle, session_id);
            return;
        }

        match rx.recv_timeout(remaining) {
            Ok(TapMsg::Samples(samples)) => {
                // First complete segment wins: an instruction is one sentence.
                if let Some(segment) = segmenter.push(&samples).into_iter().next() {
                    emit_instruction(&app_handle, session_id, sample_rate, segment.samples);
                    stop_instruction_capture(&app_handle, true);
                    return;
                }
            }
            Ok(TapMsg::Finish) => {
                let samples = segmenter.flush().map(|s| s.samples).unwrap_or_default();
                emit_instruction(&app_handle, session_id, sample_rate, samples);
                return;
            }
            Ok(TapMsg::Abort) => {
                tracing::info!("Voice Edit instruction {} aborted", session_id);
                return;
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                expire_instruction(&app_handle, session_id);
                return;
            }
            // Every sender dropped without a Finish: nothing to finalize.
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn instruction_config_tolerates_longer_hesitations_than_streaming() {
        let cfg = voice_edit_segmenter_config(48_000);
        let streaming = SegmenterConfig::new(48_000);
        assert!(cfg.silence_gap_ms > streaming.silence_gap_ms);
        assert_eq!(cfg.silence_gap_ms, 800);
    }

    #[test]
    fn instruction_config_allows_very_short_utterances() {
        // "traduis" lasts well under a second: the streaming floor (1400 ms)
        // would prevent any silence cut from ever firing.
        let cfg = voice_edit_segmenter_config(48_000);
        assert_eq!(cfg.min_segment_ms, 400);
    }

    #[test]
    fn instruction_config_keeps_the_streaming_force_cut_ceiling() {
        let cfg = voice_edit_segmenter_config(48_000);
        assert_eq!(cfg.max_segment_ms, 15_000);
    }
}
