//! Selection capture and replacement for Voice Edit.
//!
//! Voice Edit operates on text the user selected in *another* application, so
//! there is no IPC channel to read it from: the only universal mechanism on
//! Windows is a simulated `Ctrl+C`. That hijacks the clipboard, which belongs
//! to the user — so every path here restores the previous clipboard *text*,
//! including the error paths.
//!
//! A clipboard holding something the plugin cannot read back (an image, files,
//! rich text) is never written to at all: we cannot restore what we cannot
//! read, so clearing it to disambiguate "nothing was copied" would destroy it
//! permanently. In that case an empty read after the `Ctrl+C` already means
//! "nothing was copied", and the cost is that a successful capture leaves the
//! copied text on the clipboard — exactly what a manual `Ctrl+C` does.
//!
//! Replacement is the mirror image: the overlay owns the foreground window
//! while the result is displayed, so the source window must be brought back to
//! the front before the text can be injected at the caret.

use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Runtime};
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Upper bound on what we ship to the LLM. Matches `SELECTION_CHAR_CAP` in
/// `src/lib/voice-edit/actions.ts` — keep both in sync.
pub const SELECTION_CHAR_CAP: usize = 15_000;

/// Time given to the target application to service the simulated `Ctrl+C`.
/// Chosen empirically in the same spirit as the 50 ms delay in
/// `paste_text_to_active_window`: long enough for heavy apps (Word, browsers),
/// short enough to stay imperceptible.
const CLIPBOARD_SETTLE_MS: u64 = 120;

/// Time for Windows to actually raise the source window before we type into it.
const FOREGROUND_SETTLE_MS: u64 = 80;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturedSelection {
    pub text: String,
    /// Raw `HWND` of the window that owned the selection, passed back to
    /// `replace_selection` later. `isize` because pointers do not cross IPC.
    pub source_window: isize,
    pub had_selection: bool,
    pub truncated: bool,
}

impl CapturedSelection {
    /// Used when the capture failed: the overlay still opens, with the same
    /// "no text selected" affordance it shows for an empty selection.
    pub fn empty() -> Self {
        Self {
            text: String::new(),
            source_window: 0,
            had_selection: false,
            truncated: false,
        }
    }
}

/// Truncate to `max_chars` characters (not bytes) and report whether the cut happened.
pub fn truncate_selection(text: &str, max_chars: usize) -> (String, bool) {
    if text.chars().count() <= max_chars {
        return (text.to_string(), false);
    }
    (text.chars().take(max_chars).collect(), true)
}

#[cfg(target_os = "windows")]
fn foreground_window() -> isize {
    // SAFETY: GetForegroundWindow takes no arguments and only reads global
    // window-manager state. A null return (no foreground window) is valid and
    // handled by the caller as "no window to restore".
    unsafe { windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow() as isize }
}

#[cfg(not(target_os = "windows"))]
fn foreground_window() -> isize {
    0
}

#[cfg(target_os = "windows")]
fn focus_window(handle: isize) -> bool {
    if handle == 0 {
        return false;
    }
    // SAFETY: the handle came from GetForegroundWindow in the same session.
    // SetForegroundWindow validates it and returns FALSE if it is stale, which
    // is the documented behaviour we rely on rather than a crash.
    unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::SetForegroundWindow(
            handle as windows_sys::Win32::Foundation::HWND,
        ) != 0
    }
}

#[cfg(not(target_os = "windows"))]
fn focus_window(_handle: isize) -> bool {
    false
}

/// Read the clipboard as text. The plugin returns an error when the clipboard
/// holds no text at all (empty, or an image) — that is not a failure here.
fn read_clipboard_text<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    app.clipboard().read_text().ok()
}

/// Put back what we took. `previous` is `None` when the clipboard held nothing
/// readable as text, in which case we never cleared it and must not write to it
/// now: the user's image or file list is still there and is not ours to drop.
fn restore_clipboard<R: Runtime>(app: &AppHandle<R>, previous: Option<String>) {
    let Some(text) = previous.filter(|text| !text.is_empty()) else {
        return;
    };
    if let Err(err) = app.clipboard().write_text(text) {
        tracing::warn!("Failed to restore clipboard after selection capture: {}", err);
    }
}

fn send_copy_shortcut() -> Result<(), String> {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};

    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| {
        tracing::error!("Failed to initialize keyboard simulation: {}", e);
        format!("Failed to initialize keyboard: {}", e)
    })?;

    enigo
        .key(Key::Control, Direction::Press)
        .map_err(|e| e.to_string())?;
    let click = enigo.key(Key::Unicode('c'), Direction::Click);
    // Release Control even if the 'c' click failed, otherwise the modifier
    // stays latched down for the whole system.
    let release = enigo.key(Key::Control, Direction::Release);

    click.map_err(|e| e.to_string())?;
    release.map_err(|e| e.to_string())?;
    Ok(())
}

/// Capture the current selection of the foreground window.
///
/// Must be called *before* the overlay is shown: the simulated `Ctrl+C` goes to
/// whichever window holds the focus.
///
/// Generic over the runtime because the global-shortcut handler calls it
/// directly with an `AppHandle<R>`, without going through the IPC layer.
pub fn capture_selection_inner<R: Runtime>(app: &AppHandle<R>) -> Result<CapturedSelection, String> {
    let source_window = foreground_window();
    let previous = read_clipboard_text(app).filter(|text| !text.is_empty());

    // Clearing first is what lets us tell "the app copied nothing" apart from
    // "the app copied nothing and we are reading the previous content back" —
    // but only when there is text to read back. With no readable text the
    // ambiguity does not exist, and clearing would destroy an image or a file
    // list we have no way of restoring.
    if previous.is_some() {
        if let Err(err) = app.clipboard().clear() {
            tracing::warn!("Failed to clear clipboard before capture: {}", err);
        }
    }

    if let Err(err) = send_copy_shortcut() {
        restore_clipboard(app, previous);
        return Err(err);
    }

    thread::sleep(Duration::from_millis(CLIPBOARD_SETTLE_MS));
    let captured = read_clipboard_text(app).unwrap_or_default();

    restore_clipboard(app, previous);

    let had_selection = !captured.trim().is_empty();
    let (text, truncated) = truncate_selection(&captured, SELECTION_CHAR_CAP);

    tracing::info!(
        "Voice Edit selection captured ({} chars, truncated: {})",
        text.chars().count(),
        truncated
    );

    Ok(CapturedSelection {
        text,
        source_window,
        had_selection,
        truncated,
    })
}

/// Bring the source window back to the front and insert `text` at the caret.
///
/// Always types at the caret, whatever `insertion_mode` says — Replace is an
/// explicit user action, exactly like the repaste shortcut, so it must insert
/// even when auto-insertion is set to "none".
#[tauri::command]
pub fn replace_selection(text: String, source_window: isize) -> Result<(), String> {
    if !focus_window(source_window) {
        tracing::warn!("Could not restore focus to the source window before replacing");
        return Err("focus_failed".into());
    }
    thread::sleep(Duration::from_millis(FOREGROUND_SETTLE_MS));

    crate::commands::misc::type_text_at_cursor(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_leaves_short_text_untouched() {
        let (out, truncated) = truncate_selection("bonjour", 100);
        assert_eq!(out, "bonjour");
        assert!(!truncated);
    }

    #[test]
    fn truncate_cuts_at_char_boundary_not_byte() {
        // 5 accented characters = 10 bytes: the cut must count characters,
        // otherwise it slices a UTF-8 sequence in half.
        let (out, truncated) = truncate_selection("ééééé", 3);
        assert_eq!(out, "ééé");
        assert!(truncated);
    }

    #[test]
    fn truncate_reports_exact_limit_as_untruncated() {
        let (out, truncated) = truncate_selection("abc", 3);
        assert_eq!(out, "abc");
        assert!(!truncated);
    }
}
