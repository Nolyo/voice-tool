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
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};
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

    // enigo.text() on Windows sends chars via Unicode SendInput; '\n' (0x0A) is
    // not interpreted as Enter by most apps. Split on '\n' and emit Key::Return
    // between lines so Markdown lists and other multi-line outputs insert correctly.
    for (i, line) in text.split('\n').enumerate() {
        if i > 0 {
            enigo.key(Key::Return, Direction::Click).map_err(|e| {
                tracing::error!("Failed to press Return: {}", e);
                format!("Failed to press Return: {}", e)
            })?;
        }
        let trimmed = line.strip_suffix('\r').unwrap_or(line);
        if !trimmed.is_empty() {
            enigo.text(trimmed).map_err(|e| {
                tracing::error!("Failed to type text: {}", e);
                format!("Failed to type text: {}", e)
            })?;
        }
    }

    tracing::info!("Text typed successfully at cursor position");
    Ok(())
}

/// Bridge for the frontend to write into the persisted log stream.
/// Useful for tracing async flows that span multiple Tauri commands.
#[tauri::command]
pub fn frontend_log(level: String, message: String) -> Result<(), String> {
    match level.as_str() {
        "warn" => tracing::warn!(target: "voice_tool_lib::frontend", "{}", message),
        "error" => tracing::error!(target: "voice_tool_lib::frontend", "{}", message),
        _ => tracing::info!(target: "voice_tool_lib::frontend", "{}", message),
    }
    Ok(())
}
