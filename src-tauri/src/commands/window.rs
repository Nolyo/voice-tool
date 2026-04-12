use tauri::{AppHandle, Manager, PhysicalSize, Size};

use crate::window::{hide_mini_window, position_mini_window};

/// Exit the application completely
#[tauri::command]
pub fn exit_app(app_handle: AppHandle) {
    app_handle.exit(0);
}

/// Set mini window mode (compact or extended)
#[tauri::command]
pub fn set_mini_window_mode(app_handle: AppHandle, mode: String) -> Result<(), String> {
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

        position_mini_window(&app_handle, &mini_window);

        tracing::info!("Mini window mode set to: {}", mode);
        Ok(())
    } else {
        Err("Mini window not found".to_string())
    }
}

/// Explicitly close/hide the mini window from frontend
#[tauri::command]
pub fn close_mini_window(app_handle: AppHandle) {
    if let Some(mini_window) = app_handle.get_webview_window("mini") {
        let _ = mini_window.set_size(Size::Physical(PhysicalSize {
            width: 233,
            height: 42,
        }));
    }
    hide_mini_window(&app_handle);
    tracing::debug!("Mini window closed and reset to compact mode");
}
