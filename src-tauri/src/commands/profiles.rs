use std::fs;
use tauri::{AppHandle, Manager};

use crate::profiles::{
    generate_unique_id, get_profile_dir, load_manifest, name_to_id, save_manifest, validate_profile_name,
    ProfileMeta,
};

/// List all profiles
#[tauri::command]
pub fn list_profiles(app: AppHandle) -> Result<Vec<ProfileMeta>, String> {
    let manifest = load_manifest(&app).map_err(|e| e.to_string())?;
    Ok(manifest.profiles)
}

/// Get the active profile id
#[tauri::command]
pub fn get_active_profile(app: AppHandle) -> Result<String, String> {
    Ok(crate::profiles::get_active_id(&app))
}

/// Get the settings store path for the active profile (for frontend Store.load)
#[tauri::command]
pub fn get_active_profile_settings_path(app: AppHandle) -> Result<String, String> {
    Ok(crate::profiles::settings_store_path(&app))
}

/// Get the notes-tabs store path for the active profile (for frontend Store.load)
#[tauri::command]
pub fn get_active_profile_notes_tabs_path(app: AppHandle) -> Result<String, String> {
    Ok(crate::profiles::notes_tabs_store_path(&app))
}

/// Get the notes-sidebar store path for the active profile (for frontend Store.load)
#[tauri::command]
pub fn get_active_profile_notes_sidebar_path(app: AppHandle) -> Result<String, String> {
    Ok(crate::profiles::notes_sidebar_store_path(&app))
}

/// Create a new profile (does NOT switch to it)
#[tauri::command]
pub fn create_profile(app: AppHandle, name: String) -> Result<ProfileMeta, String> {
    validate_profile_name(&name)?;

    let mut manifest = load_manifest(&app).map_err(|e| e.to_string())?;

    let base_id = name_to_id(name.trim());
    if base_id.is_empty() {
        return Err("Profile name must contain at least one alphanumeric character.".to_string());
    }

    let id = generate_unique_id(&base_id, &manifest.profiles);

    // Create the profile directory
    let profile_dir = get_profile_dir(&app, &id).map_err(|e| e.to_string())?;
    fs::create_dir_all(&profile_dir)
        .map_err(|e| format!("Failed to create profile directory: {}", e))?;

    let meta = ProfileMeta {
        id,
        name: name.trim().to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    manifest.profiles.push(meta.clone());
    save_manifest(&app, &manifest).map_err(|e| e.to_string())?;

    tracing::info!("Created profile: {} ({})", meta.name, meta.id);
    Ok(meta)
}

/// Rename a profile (changes display name only, never renames the directory)
#[tauri::command]
pub fn rename_profile(app: AppHandle, id: String, new_name: String) -> Result<(), String> {
    validate_profile_name(&new_name)?;

    let trimmed_name = new_name.trim().to_string();
    let mut manifest = load_manifest(&app).map_err(|e| e.to_string())?;

    let profile = manifest
        .profiles
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("Profile '{}' not found.", id))?;

    profile.name = trimmed_name.clone();
    save_manifest(&app, &manifest).map_err(|e| e.to_string())?;

    tracing::info!("Renamed profile {} to: {}", id, trimmed_name);
    Ok(())
}

/// Delete a profile (cannot delete the active profile or the last one)
#[tauri::command]
pub fn delete_profile(app: AppHandle, id: String) -> Result<(), String> {
    let mut manifest = load_manifest(&app).map_err(|e| e.to_string())?;

    if manifest.active == id {
        return Err("Cannot delete the currently active profile. Switch to another profile first.".to_string());
    }

    if manifest.profiles.len() <= 1 {
        return Err("Cannot delete the last remaining profile.".to_string());
    }

    manifest.profiles.retain(|p| p.id != id);
    save_manifest(&app, &manifest).map_err(|e| e.to_string())?;

    // Remove the profile directory recursively
    let profile_dir = get_profile_dir(&app, &id).map_err(|e| e.to_string())?;
    if profile_dir.exists() {
        fs::remove_dir_all(&profile_dir)
            .map_err(|e| format!("Failed to delete profile directory: {}", e))?;
    }

    tracing::info!("Deleted profile: {}", id);
    Ok(())
}

/// Switch to a different profile.
/// Updates the manifest and AppState in place, re-registers hotkeys,
/// then reloads all WebView windows — works in both dev and production.
#[tauri::command]
pub fn switch_profile(app: AppHandle, id: String) -> Result<(), String> {
    use tauri_plugin_store::StoreBuilder;

    let mut manifest = load_manifest(&app).map_err(|e| e.to_string())?;

    if !manifest.profiles.iter().any(|p| p.id == id) {
        return Err(format!("Profile '{}' not found.", id));
    }

    manifest.active = id.clone();
    save_manifest(&app, &manifest).map_err(|e| e.to_string())?;

    // Ensure the profile directory exists
    let profile_dir = get_profile_dir(&app, &id).map_err(|e| e.to_string())?;
    if !profile_dir.exists() {
        fs::create_dir_all(&profile_dir)
            .map_err(|e| format!("Failed to create profile directory: {}", e))?;
    }

    // Update active_profile_id in AppState immediately so all Rust commands
    // use the new profile's paths from this point on.
    {
        let state: tauri::State<crate::state::AppState> = app.state();
        if let Ok(mut guard) = state.active_profile_id.lock() {
            *guard = id.clone();
        };
    }

    // Re-register hotkeys from the new profile's settings
    {
        let settings_path = crate::profiles::settings_store_path(&app);
        if let Ok(store) = StoreBuilder::new(&app, settings_path).build() {
            let new_hotkeys = crate::hotkeys::load_hotkey_config(&store);
            let state: tauri::State<crate::state::AppState> = app.state();
            let current = state.hotkeys.lock().map(|h| h.clone()).unwrap_or_default();
            if let Err(e) = crate::hotkeys::apply_hotkeys(&app, &new_hotkeys) {
                tracing::warn!("Failed to apply hotkeys for new profile: {}", e);
                let _ = crate::hotkeys::apply_hotkeys(&app, &current);
            } else if let Ok(mut guard) = state.hotkeys.lock() {
                *guard = new_hotkeys;
            };
        }
    }

    tracing::info!("Switched to profile: {}", id);

    // Reload all WebView windows — the frontend re-initialises from scratch
    // (SettingsContext re-fetches the store path, notes/transcriptions reload, etc.)
    for (label, window) in app.webview_windows() {
        if let Err(e) = window.eval("window.location.reload()") {
            tracing::warn!("Failed to reload window '{}': {}", label, e);
        }
    }

    Ok(())
}
