use serde_json::json;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_store::StoreBuilder;

use crate::hotkeys::{apply_hotkeys, normalize_hotkey_value};
use crate::state::AppState;

/// Check if autostart is currently enabled
#[tauri::command]
pub fn is_autostart_enabled(app_handle: AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;

    let autostart_manager = app_handle.autolaunch();
    autostart_manager.is_enabled().map_err(|e| {
        format!(
            "Failed to check autostart status: {}",
            e
        )
    })
}

/// Enable or disable autostart on system boot
#[tauri::command]
pub fn set_autostart(app_handle: AppHandle, enable: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;

    let autostart_manager = app_handle.autolaunch();

    if enable {
        autostart_manager
            .enable()
            .map_err(|e| format!("Failed to enable autostart: {}", e))?;
    } else {
        if let Err(e) = autostart_manager.disable() {
            let error_msg = e.to_string();
            if !error_msg.contains("os error 2") && !error_msg.contains("not found") {
                return Err(format!(
                    "Failed to disable autostart: {}",
                    e
                ));
            }
        }
    }

    Ok(())
}

/// Update global hotkeys dynamically from the frontend
#[tauri::command]
pub fn update_hotkeys(
    app_handle: AppHandle,
    state: State<AppState>,
    record_hotkey: Option<String>,
    ptt_hotkey: Option<String>,
    open_window_hotkey: Option<String>,
    cancel_hotkey: Option<String>,
) -> Result<(), String> {
    let current = state
        .inner()
        .hotkeys
        .lock()
        .map(|hotkeys| hotkeys.clone())
        .unwrap_or_default();

    let mut next = current.clone();
    if let Some(value) = record_hotkey {
        next.record = normalize_hotkey_value(Some(value));
    }
    if let Some(value) = ptt_hotkey {
        next.ptt = normalize_hotkey_value(Some(value));
    }
    if let Some(value) = open_window_hotkey {
        next.open_window = normalize_hotkey_value(Some(value));
    }
    if let Some(value) = cancel_hotkey {
        next.cancel = normalize_hotkey_value(Some(value));
    }

    if let Err(err) = apply_hotkeys(&app_handle, &next) {
        let _ = apply_hotkeys(&app_handle, &current);
        return Err(err);
    }

    if let Ok(mut guard) = state.inner().hotkeys.lock() {
        *guard = next;
    }

    Ok(())
}

/// Get the current update channel setting (stable/beta)
#[tauri::command]
pub fn get_update_channel(app: AppHandle) -> Result<String, String> {
    let store = StoreBuilder::new(&app, "settings.json")
        .build()
        .map_err(|e| format!("Failed to load settings: {}", e))?;

    let channel = store
        .get("settings")
        .and_then(|v| v.get("settings").cloned())
        .and_then(|v| v.get("update_channel").cloned())
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "stable".to_string());

    Ok(channel)
}

/// Set the update channel preference (stable/beta)
#[tauri::command]
pub fn set_update_channel(app: AppHandle, channel: String) -> Result<(), String> {
    if channel != "stable" && channel != "beta" {
        return Err(format!(
            "Invalid channel: '{}'. Must be 'stable' or 'beta'",
            channel
        ));
    }

    let store = StoreBuilder::new(&app, "settings.json")
        .build()
        .map_err(|e| format!("Failed to load settings: {}", e))?;

    let mut data = store.get("settings").unwrap_or_else(|| json!({}));
    if let Some(root) = data.as_object_mut() {
        let settings_value = root.entry("settings").or_insert_with(|| json!({}));
        if let Some(settings_obj) = settings_value.as_object_mut() {
            settings_obj.insert("update_channel".into(), json!(channel));
        }
    }
    store.set("settings", data);
    store
        .save()
        .map_err(|e| format!("Failed to save settings: {}", e))?;

    tracing::info!("Update channel set to: {}", channel);
    Ok(())
}

/// Set the translate mode preference and notify all windows
#[tauri::command]
pub fn set_translate_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    let store = StoreBuilder::new(&app, "settings.json")
        .build()
        .map_err(|e| format!("Failed to load settings: {}", e))?;

    let mut data = store.get("settings").unwrap_or_else(|| json!({}));
    if let Some(root) = data.as_object_mut() {
        let settings_value = root.entry("settings").or_insert_with(|| json!({}));
        if let Some(settings_obj) = settings_value.as_object_mut() {
            settings_obj.insert("translate_mode".into(), json!(enabled));
        }
    }
    store.set("settings", data);
    store
        .save()
        .map_err(|e| format!("Failed to save settings: {}", e))?;

    let _ = app.emit("translate-mode-changed", enabled);

    tracing::info!("Translate mode set to: {}", enabled);
    Ok(())
}
