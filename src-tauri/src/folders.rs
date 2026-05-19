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
    /// Last-write-wins timestamp for sync. Migrated from `created_at` on first
    /// read when missing (see [`migrate_folder_updated_at_if_needed`]).
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub order: i32,
    /// Soft-delete tombstone. `None` = active folder; `Some(rfc3339)` = deleted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

/// Pure helper: a folder is "active" (visible to the user) when it has not been
/// soft-deleted. Mirrors `notes::is_note_active`.
fn is_folder_active(folder: &FolderMeta) -> bool {
    folder.deleted_at.is_none()
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

/// Backfill `updated_at` from `created_at` for legacy folders persisted before
/// the field existed. Returns true if at least one folder was migrated.
fn migrate_folder_updated_at_if_needed(folders: &mut Vec<FolderMeta>) -> bool {
    let mut migrated = false;
    for folder in folders.iter_mut() {
        if folder.updated_at.is_empty() {
            folder.updated_at = folder.created_at.clone();
            migrated = true;
        }
    }
    migrated
}

#[tauri::command]
pub async fn list_folders(app_handle: AppHandle) -> Result<Vec<FolderMeta>, String> {
    let mut folders = read_folders(&app_handle).map_err(|e| e.to_string())?;
    let orders_migrated = migrate_folder_orders_if_needed(&mut folders);
    let updated_at_migrated = migrate_folder_updated_at_if_needed(&mut folders);
    if orders_migrated || updated_at_migrated {
        write_folders(&app_handle, &folders).map_err(|e| e.to_string())?;
    }
    folders.retain(is_folder_active);
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

    let now = chrono::Utc::now().to_rfc3339();
    let meta = FolderMeta {
        id: uuid::Uuid::new_v4().to_string(),
        name: trimmed.to_string(),
        created_at: now.clone(),
        updated_at: now,
        order: next_order,
        deleted_at: None,
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

    let now = chrono::Utc::now().to_rfc3339();

    // Folders not in the input list keep a stable position after the reordered ones.
    let mut max_ordered = id_to_index.len() as i32;
    for folder in folders.iter_mut() {
        if let Some(&idx) = id_to_index.get(&folder.id) {
            folder.order = idx as i32;
            // Bulk reorder is a coupled mutation: bump every folder explicitly
            // listed in the input so LWW sync picks up the new ordering.
            folder.updated_at = now.clone();
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
    folder.updated_at = chrono::Utc::now().to_rfc3339();
    let updated = folder.clone();

    write_folders(&app_handle, &folders).map_err(|e| e.to_string())?;

    Ok(updated)
}

#[tauri::command]
pub async fn delete_folder(app_handle: AppHandle, id: String) -> Result<(), String> {
    let mut folders = read_folders(&app_handle).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut found = false;
    for folder in folders.iter_mut() {
        if folder.id == id {
            folder.deleted_at = Some(now.clone());
            folder.updated_at = now.clone();
            found = true;
            break;
        }
    }
    if !found {
        return Ok(());
    }
    write_folders(&app_handle, &folders).map_err(|e| e.to_string())?;

    // Existing semantics: notes in this folder become orphans (folder_id reset to None).
    crate::notes::orphan_notes_in_folder(&app_handle, &id).map_err(|e| e.to_string())?;

    Ok(())
}

/// Hard-delete soft-deleted folders after server confirmed they were purged.
/// Mirror of `notes::purge_soft_deleted_notes_post_pull`. Only removes folders
/// that are locally soft-deleted — an active folder is never removed.
#[tauri::command]
pub async fn purge_soft_deleted_folders_post_pull(
    app_handle: AppHandle,
    folder_ids: Vec<String>,
) -> Result<u32, String> {
    if folder_ids.is_empty() {
        return Ok(0);
    }
    let mut folders = read_folders(&app_handle).map_err(|e| e.to_string())?;
    let before = folders.len();
    folders.retain(|f| !(folder_ids.contains(&f.id) && f.deleted_at.is_some()));
    let purged = (before - folders.len()) as u32;
    if purged > 0 {
        write_folders(&app_handle, &folders).map_err(|e| e.to_string())?;
    }
    Ok(purged)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_folder(updated_at: &str, deleted_at: Option<String>) -> FolderMeta {
        FolderMeta {
            id: "folder-id".to_string(),
            name: "Test".to_string(),
            created_at: "2026-05-19T10:00:00Z".to_string(),
            updated_at: updated_at.to_string(),
            order: 0,
            deleted_at,
        }
    }

    #[test]
    fn folder_meta_roundtrips_with_updated_at_and_deleted_at() {
        let folder = make_folder(
            "2026-05-19T11:00:00Z",
            Some("2026-05-19T12:00:00Z".to_string()),
        );
        let json = serde_json::to_string(&folder).expect("serialize");
        // camelCase rename → JSON keys are `updatedAt` / `deletedAt`.
        assert!(
            json.contains("\"updatedAt\":\"2026-05-19T11:00:00Z\""),
            "expected updatedAt in JSON, got: {}",
            json
        );
        assert!(
            json.contains("\"deletedAt\":\"2026-05-19T12:00:00Z\""),
            "expected deletedAt in JSON, got: {}",
            json
        );

        let decoded: FolderMeta = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(decoded.id, folder.id);
        assert_eq!(decoded.name, folder.name);
        assert_eq!(decoded.created_at, folder.created_at);
        assert_eq!(decoded.updated_at, folder.updated_at);
        assert_eq!(decoded.order, folder.order);
        assert_eq!(decoded.deleted_at, folder.deleted_at);
    }

    #[test]
    fn folder_meta_deserializes_without_updated_at_or_deleted_at() {
        // Backward compat: legacy folders.json on disk lacks both keys.
        let legacy_json = r#"{
            "id": "x",
            "name": "n",
            "createdAt": "2026-01-01T00:00:00Z",
            "order": 0
        }"#;
        let meta: FolderMeta = serde_json::from_str(legacy_json).expect("deserialize legacy");
        assert_eq!(meta.updated_at, "");
        assert_eq!(meta.deleted_at, None);
        assert!(is_folder_active(&meta));
    }

    #[test]
    fn folder_meta_skips_deleted_at_when_none() {
        let folder = make_folder("2026-05-19T11:00:00Z", None);
        let json = serde_json::to_string(&folder).expect("serialize");
        assert!(
            !json.contains("deletedAt"),
            "expected deletedAt to be omitted, got: {}",
            json
        );
    }

    #[test]
    fn migrate_folder_updated_at_sets_from_created_at_when_empty() {
        let mut folders = vec![
            make_folder("", None),
            make_folder("2026-05-19T11:00:00Z", None),
        ];
        let migrated = migrate_folder_updated_at_if_needed(&mut folders);
        assert!(migrated, "expected migration to report true");
        // First folder backfilled from created_at.
        assert_eq!(folders[0].updated_at, "2026-05-19T10:00:00Z");
        // Second folder untouched.
        assert_eq!(folders[1].updated_at, "2026-05-19T11:00:00Z");
    }

    #[test]
    fn migrate_folder_updated_at_noop_when_all_populated() {
        let mut folders = vec![
            make_folder("2026-05-19T11:00:00Z", None),
            make_folder("2026-05-19T12:00:00Z", None),
        ];
        let migrated = migrate_folder_updated_at_if_needed(&mut folders);
        assert!(!migrated, "expected no migration");
        assert_eq!(folders[0].updated_at, "2026-05-19T11:00:00Z");
        assert_eq!(folders[1].updated_at, "2026-05-19T12:00:00Z");
    }

    #[test]
    fn is_folder_active_returns_true_when_deleted_at_is_none() {
        let folder = make_folder("2026-05-19T11:00:00Z", None);
        assert!(is_folder_active(&folder));
    }

    #[test]
    fn is_folder_active_returns_false_when_deleted_at_is_some() {
        let folder = make_folder(
            "2026-05-19T11:00:00Z",
            Some("2026-05-19T12:00:00Z".to_string()),
        );
        assert!(!is_folder_active(&folder));
    }

    #[test]
    fn purge_post_pull_retain_only_drops_tombstoned_in_target_set() {
        // Mirror the retain() predicate from purge_soft_deleted_folders_post_pull.
        let mut folders = vec![
            FolderMeta { id: "active-1".to_string(), name: "A".to_string(),
                created_at: "2026-05-19T10:00:00Z".to_string(),
                updated_at: "2026-05-19T10:00:00Z".to_string(),
                order: 0, deleted_at: None },
            FolderMeta { id: "tombstoned-1".to_string(), name: "B".to_string(),
                created_at: "2026-05-19T10:00:00Z".to_string(),
                updated_at: "2026-05-19T11:00:00Z".to_string(),
                order: 1, deleted_at: Some("2026-05-19T11:00:00Z".to_string()) },
            FolderMeta { id: "tombstoned-not-in-target".to_string(), name: "C".to_string(),
                created_at: "2026-05-19T10:00:00Z".to_string(),
                updated_at: "2026-05-19T11:00:00Z".to_string(),
                order: 2, deleted_at: Some("2026-05-19T11:00:00Z".to_string()) },
        ];
        let target_ids = vec!["active-1".to_string(), "tombstoned-1".to_string()];
        folders.retain(|f| !(target_ids.contains(&f.id) && f.deleted_at.is_some()));
        assert_eq!(folders.len(), 2, "only 'tombstoned-1' should be dropped");
        assert_eq!(folders[0].id, "active-1");
        assert_eq!(folders[1].id, "tombstoned-not-in-target");
    }
}
