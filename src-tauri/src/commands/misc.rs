/// Paste text to the active window by simulating Ctrl+V
#[tauri::command]
pub fn paste_text_to_active_window(_text: String) -> Result<(), String> {
    use enigo::{Enigo, Key, Keyboard, Settings};
    use std::thread;
    use std::time::Duration;

    tracing::info!("Pasting transcription to cursor position");

    thread::sleep(Duration::from_millis(50));

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
pub fn type_text_at_cursor(text: String) -> Result<(), String> {
    use enigo::{Enigo, Keyboard, Settings};
    use std::thread;
    use std::time::Duration;

    tracing::info!(
        "Typing transcription directly at cursor position ({} chars)",
        text.len()
    );

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
