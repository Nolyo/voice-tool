use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileMeta {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfilesManifest {
    pub active: String,
    pub profiles: Vec<ProfileMeta>,
}

fn get_manifest_path(app: &AppHandle) -> Result<PathBuf> {
    let app_data = app
        .path()
        .app_data_dir()
        .context("Could not resolve app data directory")?;
    Ok(app_data.join("profiles.json"))
}

/// Get the directory for a specific profile
pub fn get_profile_dir(app: &AppHandle, profile_id: &str) -> Result<PathBuf> {
    let app_data = app
        .path()
        .app_data_dir()
        .context("Could not resolve app data directory")?;
    Ok(app_data.join("profiles").join(profile_id))
}

/// Get the directory for the currently active profile
pub fn get_active_profile_dir(app: &AppHandle) -> Result<PathBuf> {
    let id = get_active_id(app);
    get_profile_dir(app, &id)
}

/// Get the active profile id from AppState
pub fn get_active_id(app: &AppHandle) -> String {
    let state: State<AppState> = app.state();
    state
        .active_profile_id
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|_| "default".to_string())
}

/// Return the settings store path for the active profile (relative to app_data_dir)
pub fn settings_store_path(app: &AppHandle) -> String {
    let id = get_active_id(app);
    format!("profiles/{}/settings.json", id)
}

/// Return the notes-tabs store path for the active profile (relative to app_data_dir)
pub fn notes_tabs_store_path(app: &AppHandle) -> String {
    let id = get_active_id(app);
    format!("profiles/{}/notes-tabs.json", id)
}

fn load_manifest_from_path(path: &PathBuf) -> Result<ProfilesManifest> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read profiles.json: {}", path.display()))?;
    serde_json::from_str(&content).context("Failed to parse profiles.json")
}

pub fn load_manifest(app: &AppHandle) -> Result<ProfilesManifest> {
    let path = get_manifest_path(app)?;
    load_manifest_from_path(&path)
}

pub fn save_manifest(app: &AppHandle, manifest: &ProfilesManifest) -> Result<()> {
    let path = get_manifest_path(app)?;
    let content =
        serde_json::to_string_pretty(manifest).context("Failed to serialize manifest")?;
    fs::write(&path, &content)
        .with_context(|| format!("Failed to write profiles.json: {}", path.display()))?;
    Ok(())
}

/// First-time migration: if profiles.json doesn't exist, move existing data
/// (settings.json, notes/, transcriptions/, recordings/) into profiles/default/.
pub fn migrate_legacy_to_default(app: &AppHandle) -> Result<()> {
    let app_data = app
        .path()
        .app_data_dir()
        .context("Could not resolve app data directory")?;

    let manifest_path = app_data.join("profiles.json");
    if manifest_path.exists() {
        return Ok(()); // Already migrated
    }

    tracing::info!("Profiles migration: moving existing data into profiles/default/");

    let default_dir = app_data.join("profiles").join("default");
    fs::create_dir_all(&default_dir).context("Failed to create profiles/default directory")?;

    let items = [
        ("settings.json", "settings.json"),
        ("notes", "notes"),
        ("transcriptions", "transcriptions"),
        ("recordings", "recordings"),
    ];

    for (src_name, dst_name) in &items {
        let src = app_data.join(src_name);
        let dst = default_dir.join(dst_name);
        if src.exists() {
            match fs::rename(&src, &dst) {
                Ok(_) => tracing::info!(
                    "Profiles migration: moved {} -> profiles/default/{}",
                    src_name,
                    dst_name
                ),
                Err(e) => tracing::warn!(
                    "Profiles migration: could not move {} ({}), skipping",
                    src_name,
                    e
                ),
            }
        }
    }

    let manifest = ProfilesManifest {
        active: "default".to_string(),
        profiles: vec![ProfileMeta {
            id: "default".to_string(),
            name: "Default".to_string(),
            created_at: Utc::now().to_rfc3339(),
        }],
    };
    let content = serde_json::to_string_pretty(&manifest)?;
    fs::write(&manifest_path, &content).context("Failed to write initial profiles.json")?;

    tracing::info!("Profiles migration completed");
    Ok(())
}

/// Load manifest (creating a default one if absent), then populate AppState.active_profile_id.
pub fn init_active_profile(app: &AppHandle) -> Result<()> {
    let app_data = app
        .path()
        .app_data_dir()
        .context("Could not resolve app data directory")?;
    let manifest_path = app_data.join("profiles.json");

    if !manifest_path.exists() {
        // Fresh install with no legacy data
        let default_dir = app_data.join("profiles").join("default");
        fs::create_dir_all(&default_dir)
            .context("Failed to create profiles/default directory")?;

        let manifest = ProfilesManifest {
            active: "default".to_string(),
            profiles: vec![ProfileMeta {
                id: "default".to_string(),
                name: "Default".to_string(),
                created_at: Utc::now().to_rfc3339(),
            }],
        };
        let content = serde_json::to_string_pretty(&manifest)?;
        fs::write(&manifest_path, &content).context("Failed to write initial profiles.json")?;
    }

    let manifest = load_manifest_from_path(&manifest_path)?;

    // Ensure the active profile directory exists
    let profile_dir = app_data.join("profiles").join(&manifest.active);
    if !profile_dir.exists() {
        fs::create_dir_all(&profile_dir).with_context(|| {
            format!(
                "Failed to create profile directory: {}",
                profile_dir.display()
            )
        })?;
    }

    let state: State<AppState> = app.state();
    if let Ok(mut guard) = state.active_profile_id.lock() {
        *guard = manifest.active.clone();
    }

    tracing::info!("Active profile: {}", manifest.active);
    Ok(())
}

// --- ID / name helpers ---

pub fn name_to_id(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

pub fn validate_profile_name(name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Profile name cannot be empty.".to_string());
    }
    if trimmed.len() > 64 {
        return Err("Profile name is too long (max 64 characters).".to_string());
    }
    Ok(())
}

/// Generate a unique id for a new profile, avoiding collisions with existing ids
/// and reserved directory names (models, logs).
pub fn generate_unique_id(base_id: &str, existing: &[ProfileMeta]) -> String {
    const RESERVED: &[&str] = &["models", "logs"];

    let is_taken =
        |id: &str| existing.iter().any(|p| p.id == id) || RESERVED.contains(&id);

    if !is_taken(base_id) {
        return base_id.to_string();
    }

    let mut counter = 2u32;
    loop {
        let candidate = format!("{}-{}", base_id, counter);
        if !is_taken(&candidate) {
            return candidate;
        }
        counter += 1;
    }
}
