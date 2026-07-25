//! Selection capture and replacement for Voice Edit.
//!
//! Voice Edit operates on text the user selected in *another* application, so
//! there is no IPC channel to read it from: the only universal mechanism on
//! Windows is a simulated `Ctrl+C`. That hijacks the clipboard, which belongs
//! to the user — so every path here restores the previous clipboard content,
//! including the error paths.
//!
//! Replacement is the mirror image: the overlay owns the foreground window
//! while the result is displayed, so the source window must be brought back to
//! the front before the text can be injected at the caret.

use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;
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
fn read_clipboard_text(app: &AppHandle) -> Option<String> {
    app.clipboard().read_text().ok()
}

fn restore_clipboard(app: &AppHandle, previous: Option<String>) {
    let result = match previous {
        Some(text) if !text.is_empty() => app.clipboard().write_text(text),
        // The user's clipboard was empty (or non-textual): leave it empty
        // rather than keeping the text we just captured.
        _ => app.clipboard().clear(),
    };
    if let Err(err) = result {
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
#[tauri::command]
pub fn capture_selection(app: AppHandle) -> Result<CapturedSelection, String> {
    let source_window = foreground_window();
    let previous = read_clipboard_text(&app);

    // Clearing first is what lets us tell "the app copied nothing" apart from
    // "the app copied nothing and we are reading the previous content back".
    if let Err(err) = app.clipboard().clear() {
        tracing::warn!("Failed to clear clipboard before capture: {}", err);
    }

    if let Err(err) = send_copy_shortcut() {
        restore_clipboard(&app, previous);
        return Err(err);
    }

    thread::sleep(Duration::from_millis(CLIPBOARD_SETTLE_MS));
    let captured = read_clipboard_text(&app).unwrap_or_default();

    restore_clipboard(&app, previous);

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
/// `mode` mirrors the `insertion_mode` setting. `"none"` is treated as
/// `"cursor"`: that setting means "do not insert automatically", but here the
/// user explicitly pressed Replace.
#[tauri::command]
pub fn replace_selection(
    app: AppHandle,
    text: String,
    source_window: isize,
    mode: String,
) -> Result<(), String> {
    if !focus_window(source_window) {
        tracing::warn!("Could not restore focus to the source window before replacing");
        return Err("focus_failed".into());
    }
    thread::sleep(Duration::from_millis(FOREGROUND_SETTLE_MS));

    if mode == "clipboard" {
        app.clipboard()
            .write_text(text.clone())
            .map_err(|e| format!("Failed to write clipboard: {}", e))?;
        crate::commands::misc::paste_text_to_active_window(text)
    } else {
        crate::commands::misc::type_text_at_cursor(text)
    }
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
