use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderMeta {
    pub id: String,
    pub name: String,
    pub created_at: String,
    #[serde(default)]
    pub order: i32,
}

fn get_folders_file(app_handle: &AppHandle) -> Result<PathBuf> {
    let profile_dir = crate::profiles::get_active_profile_dir(app_handle)
        .context("Could not resolve active profile directory")?;
    let notes_dir = profile_dir.join("notes");
    if !notes_dir.exists() {
        fs::create_dir_all(&notes_dir)
            .with_context(|| format!("Failed to create notes directory: {}", notes_dir.display()))?;
    }
    Ok(notes_dir.join("folders.json"))
}

fn read_folders(app_handle: &AppHandle) -> Result<Vec<FolderMeta>> {
    let path = get_folders_file(app_handle)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path)
        .with_context(|| format!("Failed to read {}", path.display()))?;
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }
    let folders: Vec<FolderMeta> =
        serde_json::from_str(&content).with_context(|| "Failed to parse folders.json")?;
    Ok(folders)
}

fn write_folders(app_handle: &AppHandle, folders: &[FolderMeta]) -> Result<()> {
    let path = get_folders_file(app_handle)?;
    let json = serde_json::to_string_pretty(folders)?;
    fs::write(&path, json).with_context(|| format!("Failed to write {}", path.display()))?;
    Ok(())
}

/// If all folders have order == 0 (i.e. field was defaulted on deserialize),
/// assign orders from the current alphabetical sort. Returns true if migrated.
fn migrate_folder_orders_if_needed(folders: &mut Vec<FolderMeta>) -> bool {
    if folders.len() < 2 {
        return false;
    }
    if !folders.iter().all(|f| f.order == 0) {
        return false;
    }
    folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    for (idx, folder) in folders.iter_mut().enumerate() {
        folder.order = idx as i32;
    }
    true
}

#[tauri::command]
pub async fn list_folders(app_handle: AppHandle) -> Result<Vec<FolderMeta>, String> {
    let mut folders = read_folders(&app_handle).map_err(|e| e.to_string())?;
    if migrate_folder_orders_if_needed(&mut folders) {
        write_folders(&app_handle, &folders).map_err(|e| e.to_string())?;
    }
    folders.sort_by(|a, b| {
        a.order
            .cmp(&b.order)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(folders)
}

#[tauri::command]
pub async fn create_folder(app_handle: AppHandle, name: String) -> Result<FolderMeta, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }

    let mut folders = read_folders(&app_handle).map_err(|e| e.to_string())?;
    migrate_folder_orders_if_needed(&mut folders);

    let next_order = folders.iter().map(|f| f.order).max().unwrap_or(-1) + 1;

    let meta = FolderMeta {
        id: uuid::Uuid::new_v4().to_string(),
        name: trimmed.to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        order: next_order,
    };

    folders.push(meta.clone());
    write_folders(&app_handle, &folders).map_err(|e| e.to_string())?;

    Ok(meta)
}

#[tauri::command]
pub async fn reorder_folders(app_handle: AppHandle, ids: Vec<String>) -> Result<(), String> {
    let mut folders = read_folders(&app_handle).map_err(|e| e.to_string())?;

    let id_to_index: std::collections::HashMap<String, usize> =
        ids.into_iter().enumerate().map(|(i, id)| (id, i)).collect();

    // Folders not in the input list keep a stable position after the reordered ones.
    let mut max_ordered = id_to_index.len() as i32;
    for folder in folders.iter_mut() {
        if let Some(&idx) = id_to_index.get(&folder.id) {
            folder.order = idx as i32;
        } else {
            folder.order = max_ordered;
            max_ordered += 1;
        }
    }

    write_folders(&app_handle, &folders).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn rename_folder(
    app_handle: AppHandle,
    id: String,
    name: String,
) -> Result<FolderMeta, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }

    let mut folders = read_folders(&app_handle).map_err(|e| e.to_string())?;

    let folder = folders
        .iter_mut()
        .find(|f| f.id == id)
        .ok_or_else(|| format!("Folder not found: {}", id))?;
    folder.name = trimmed.to_string();
    let updated = folder.clone();

    write_folders(&app_handle, &folders).map_err(|e| e.to_string())?;

    Ok(updated)
}

#[tauri::command]
pub async fn delete_folder(app_handle: AppHandle, id: String) -> Result<(), String> {
    let mut folders = read_folders(&app_handle).map_err(|e| e.to_string())?;
    folders.retain(|f| f.id != id);
    write_folders(&app_handle, &folders).map_err(|e| e.to_string())?;

    // Orphan mode: reset folder_id on all notes that were in this folder.
    crate::notes::orphan_notes_in_folder(&app_handle, &id).map_err(|e| e.to_string())?;

    Ok(())
}
