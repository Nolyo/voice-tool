use tauri::{AppHandle, Manager, PhysicalSize, Size};
use tauri_plugin_store::StoreBuilder;

use crate::window::{
    capture_mini_window_state, hide_mini_window, position_mini_window,
};

/// Exit the application completely
#[tauri::command]
pub fn exit_app(app_handle: AppHandle) {
    app_handle.exit(0);
}

/// Explicitly close/hide the mini window from frontend.
/// The size/position chosen by the user is preserved across hide/show cycles.
#[tauri::command]
pub fn close_mini_window(app_handle: AppHandle) {
    hide_mini_window(&app_handle);
    tracing::debug!("Mini window hidden");
}

/// Persist the current mini-window geometry to the settings store.
/// The Moved/Resized listener already updates the in-memory cache on every
/// event; this command flushes the store to disk explicitly.
#[tauri::command]
pub fn save_mini_window_geometry(app_handle: AppHandle) -> Result<(), String> {
    let mini_window = app_handle
        .get_webview_window("mini")
        .ok_or_else(|| "Mini window not found".to_string())?;

    let settings_path = crate::profiles::settings_store_path(&app_handle);
    let store = StoreBuilder::new(&app_handle, settings_path)
        .build()
        .map_err(|e| format!("Failed to load settings store: {}", e))?;

    capture_mini_window_state(&mini_window, &store);
    store
        .save()
        .map_err(|e| format!("Failed to save settings store: {}", e))?;

    Ok(())
}

/// Reset the mini-window to its default size and re-center it above the
/// taskbar (using the monitor work area).
#[tauri::command]
pub fn recenter_mini_window(app_handle: AppHandle) -> Result<(), String> {
    let mini_window = app_handle
        .get_webview_window("mini")
        .ok_or_else(|| "Mini window not found".to_string())?;

    mini_window
        .set_size(Size::Physical(PhysicalSize {
            width: 320,
            height: 42,
        }))
        .map_err(|e| format!("Failed to resize mini window: {}", e))?;

    position_mini_window(&app_handle, &mini_window);

    let settings_path = crate::profiles::settings_store_path(&app_handle);
    let store = StoreBuilder::new(&app_handle, settings_path)
        .build()
        .map_err(|e| format!("Failed to load settings store: {}", e))?;

    capture_mini_window_state(&mini_window, &store);
    store
        .save()
        .map_err(|e| format!("Failed to save settings store: {}", e))?;

    tracing::info!("Mini window recentered");
    Ok(())
}
