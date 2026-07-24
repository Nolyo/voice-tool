use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_store::StoreBuilder;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMeta {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub order: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
    #[serde(default)]
    pub local_only: bool,
}

/// Pure helper: a note is "active" (visible to the user) when it has not been soft-deleted.
fn is_note_active(meta: &NoteMeta) -> bool {
    meta.deleted_at.is_none()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteData {
    pub meta: NoteMeta,
    pub content: String,
}

/// Legacy note format stored in settings.json
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyNote {
    id: String,
    title: String,
    content: String,
    created_at: String,
    updated_at: String,
}

/// Get the notes directory for the active profile, creating it if needed
fn get_notes_dir(app_handle: &AppHandle) -> Result<PathBuf> {
    let profile_dir = crate::profiles::get_active_profile_dir(app_handle)
        .context("Could not resolve active profile directory")?;
    let notes_dir = profile_dir.join("notes");
    if !notes_dir.exists() {
        fs::create_dir_all(&notes_dir)
            .with_context(|| format!("Failed to create notes directory: {}", notes_dir.display()))?;
    }
    Ok(notes_dir)
}

/// Canonical UUID shape (8-4-4-4-12 hex groups). Note ids become window
/// labels (`note-<id>`), which only accept [a-zA-Z0-9\-/:_] — rejecting
/// anything else up front prevents label injection and builder panics.
pub(crate) fn is_valid_note_id(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(i, b)| match i {
            8 | 13 | 18 | 23 => b == b'-',
            _ => b.is_ascii_hexdigit(),
        })
}

/// True when the note exists on disk for the active profile.
pub(crate) fn note_exists(app_handle: &AppHandle, id: &str) -> bool {
    match get_notes_dir(app_handle) {
        Ok(dir) => dir.join(id).join("note.json").exists(),
        Err(_) => false,
    }
}

/// Read note metadata from a note directory
fn read_note_meta(note_dir: &PathBuf) -> Result<NoteMeta> {
    let meta_path = note_dir.join("note.json");
    let content = fs::read_to_string(&meta_path)
        .with_context(|| format!("Failed to read {}", meta_path.display()))?;
    let meta: NoteMeta =
        serde_json::from_str(&content).with_context(|| "Failed to parse note.json")?;
    Ok(meta)
}

/// Strip HTML tags for search purposes
fn strip_html_tags(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(ch),
            _ => {}
        }
    }
    result
}

/// Convert plain text to basic HTML paragraphs (for migration)
fn text_to_html(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }
    text.split('\n')
        .map(|line| {
            if line.trim().is_empty() {
                "<p></p>".to_string()
            } else {
                format!("<p>{}</p>", html_escape(line))
            }
        })
        .collect::<Vec<_>>()
        .join("")
}

/// Escape HTML special characters
fn html_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Migrate notes from settings.json store to file-based storage.
/// Returns the number of migrated notes.
pub fn migrate_notes_from_store(app_handle: &AppHandle) -> Result<u32> {
    let store = StoreBuilder::new(app_handle, crate::profiles::settings_store_path(app_handle)).build()?;

    let notes_value = match store.get("notes") {
        Some(value) => value.clone(),
        None => return Ok(0), // No notes key, nothing to migrate
    };

    let legacy_notes: Vec<LegacyNote> = match serde_json::from_value(notes_value) {
        Ok(notes) => notes,
        Err(e) => {
            tracing::warn!("Failed to parse legacy notes from store: {}", e);
            return Ok(0);
        }
    };

    if legacy_notes.is_empty() {
        store.delete("notes");
        let _ = store.save();
        return Ok(0);
    }

    let notes_dir = get_notes_dir(app_handle)?;
    let mut migrated = 0u32;

    for note in &legacy_notes {
        let note_dir = notes_dir.join(&note.id);

        // Idempotent: skip if already migrated
        if note_dir.exists() {
            migrated += 1;
            continue;
        }

        fs::create_dir_all(&note_dir)
            .with_context(|| format!("Failed to create note directory: {}", note_dir.display()))?;

        // Write metadata
        let meta = NoteMeta {
            id: note.id.clone(),
            title: note.title.clone(),
            created_at: note.created_at.clone(),
            updated_at: note.updated_at.clone(),
            favorite: false,
            folder_id: None,
            order: 0,
            deleted_at: None,
            local_only: false,
        };
        let meta_json = serde_json::to_string_pretty(&meta)?;
        fs::write(note_dir.join("note.json"), meta_json)?;

        // Convert plain text content to HTML
        let html_content = text_to_html(&note.content);
        fs::write(note_dir.join("content.html"), html_content)?;

        migrated += 1;
    }

    // Remove notes key from store after successful migration
    store.delete("notes");
    let _ = store.save();

    tracing::info!(
        "Migrated {} notes from settings.json to file-based storage",
        migrated
    );

    Ok(migrated)
}

#[tauri::command]
pub async fn list_notes(app_handle: AppHandle) -> Result<Vec<NoteMeta>, String> {
    let notes_dir = get_notes_dir(&app_handle).map_err(|e| e.to_string())?;

    let mut notes: Vec<NoteMeta> = Vec::new();

    let entries = fs::read_dir(&notes_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if let Ok(meta) = read_note_meta(&path) {
            if is_note_active(&meta) {
                notes.push(meta);
            }
        }
    }

    // Sort by updated_at descending
    notes.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(notes)
}

#[tauri::command]
pub async fn read_note(app_handle: AppHandle, id: String) -> Result<NoteData, String> {
    let notes_dir = get_notes_dir(&app_handle).map_err(|e| e.to_string())?;
    let note_dir = notes_dir.join(&id);

    if !note_dir.exists() {
        return Err(format!("Note not found: {}", id));
    }

    let meta = read_note_meta(&note_dir).map_err(|e| e.to_string())?;

    let content_path = note_dir.join("content.html");
    let content = fs::read_to_string(&content_path).unwrap_or_default();

    Ok(NoteData { meta, content })
}

#[tauri::command]
pub async fn create_note(
    app_handle: AppHandle,
    folder_id: Option<String>,
) -> Result<NoteMeta, String> {
    let notes_dir = get_notes_dir(&app_handle).map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    let note_dir = notes_dir.join(&id);

    fs::create_dir_all(&note_dir).map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();
    let meta = NoteMeta {
        id,
        title: "Untitled Note".to_string(),
        created_at: now.clone(),
        updated_at: now,
        favorite: false,
        folder_id,
        order: 0,
        deleted_at: None,
        local_only: false,
    };

    let meta_json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(note_dir.join("note.json"), meta_json).map_err(|e| e.to_string())?;
    fs::write(note_dir.join("content.html"), "").map_err(|e| e.to_string())?;

    Ok(meta)
}

#[tauri::command]
pub async fn update_note(
    app_handle: AppHandle,
    id: String,
    content: String,
    title: String,
) -> Result<NoteMeta, String> {
    let notes_dir = get_notes_dir(&app_handle).map_err(|e| e.to_string())?;
    let note_dir = notes_dir.join(&id);

    if !note_dir.exists() {
        return Err(format!("Note not found: {}", id));
    }

    // Write content
    fs::write(note_dir.join("content.html"), &content).map_err(|e| e.to_string())?;

    // Update metadata
    let mut meta = read_note_meta(&note_dir).map_err(|e| e.to_string())?;
    meta.title = title;
    meta.updated_at = chrono::Utc::now().to_rfc3339();

    let meta_json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(note_dir.join("note.json"), meta_json).map_err(|e| e.to_string())?;

    Ok(meta)
}

#[tauri::command]
pub async fn delete_note(app_handle: AppHandle, id: String) -> Result<(), String> {
    let notes_dir = get_notes_dir(&app_handle).map_err(|e| e.to_string())?;
    let note_dir = notes_dir.join(&id);

    if !note_dir.exists() {
        return Ok(()); // idempotent
    }

    let mut meta = read_note_meta(&note_dir).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    meta.deleted_at = Some(now.clone());
    meta.updated_at = now;

    let meta_json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(note_dir.join("note.json"), meta_json).map_err(|e| e.to_string())?;

    Ok(())
}

/// Hard-delete soft-deleted notes after server confirmed they were purged.
/// Called from the frontend sync engine after a successful pull that returns
/// the list of note IDs whose tombstones were >30j and dropped server-side.
/// Only deletes notes that ARE soft-deleted locally — never removes an active note.
#[tauri::command]
pub async fn purge_soft_deleted_notes_post_pull(
    app_handle: AppHandle,
    note_ids: Vec<String>,
) -> Result<u32, String> {
    let notes_dir = get_notes_dir(&app_handle).map_err(|e| e.to_string())?;
    let mut purged = 0u32;
    for note_id in note_ids {
        let note_dir = notes_dir.join(&note_id);
        if !note_dir.exists() {
            continue;
        }
        let meta = match read_note_meta(&note_dir) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.deleted_at.is_some() {
            fs::remove_dir_all(&note_dir).map_err(|e| e.to_string())?;
            purged += 1;
        }
    }
    Ok(purged)
}

#[tauri::command]
pub async fn toggle_note_favorite(app_handle: AppHandle, id: String) -> Result<NoteMeta, String> {
    let notes_dir = get_notes_dir(&app_handle).map_err(|e| e.to_string())?;
    let note_dir = notes_dir.join(&id);

    if !note_dir.exists() {
        return Err(format!("Note not found: {}", id));
    }

    let mut meta = read_note_meta(&note_dir).map_err(|e| e.to_string())?;
    meta.favorite = !meta.favorite;

    let meta_json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(note_dir.join("note.json"), meta_json).map_err(|e| e.to_string())?;

    Ok(meta)
}

/// Set whether a note is "local only" (never synced to the cloud).
/// The cloud reconciliation (tombstone / re-upsert) is handled by the
/// frontend notes-store.
///
/// `updated_at` is bumped ONLY when clearing the flag (re-sync): the server
/// stamps a fresh `updated_at` on the tombstone created by the earlier
/// synced → local toggle, so without the bump a pull landing before the
/// re-upsert flushes would win LWW and soft-delete the local copy on this
/// very device. Setting the flag needs no bump — the pull guard in
/// `applyRemoteNote` already shields local-only notes from their cloud rows.
#[tauri::command]
pub async fn set_note_local_only(
    app_handle: AppHandle,
    id: String,
    local_only: bool,
) -> Result<NoteMeta, String> {
    let notes_dir = get_notes_dir(&app_handle).map_err(|e| e.to_string())?;
    let note_dir = notes_dir.join(&id);

    if !note_dir.exists() {
        return Err(format!("Note not found: {}", id));
    }

    let mut meta = read_note_meta(&note_dir).map_err(|e| e.to_string())?;
    meta.local_only = local_only;
    if !local_only {
        meta.updated_at = chrono::Utc::now().to_rfc3339();
    }

    let meta_json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(note_dir.join("note.json"), meta_json).map_err(|e| e.to_string())?;

    Ok(meta)
}

#[tauri::command]
pub async fn move_note_to_folder(
    app_handle: AppHandle,
    note_id: String,
    folder_id: Option<String>,
) -> Result<NoteMeta, String> {
    let notes_dir = get_notes_dir(&app_handle).map_err(|e| e.to_string())?;
    let note_dir = notes_dir.join(&note_id);

    if !note_dir.exists() {
        return Err(format!("Note not found: {}", note_id));
    }

    let mut meta = read_note_meta(&note_dir).map_err(|e| e.to_string())?;
    meta.folder_id = folder_id;
    meta.updated_at = chrono::Utc::now().to_rfc3339();
    // Reset order so the moved note sits at the top of its new folder until
    // the user reorders that folder explicitly.
    meta.order = 0;

    let meta_json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(note_dir.join("note.json"), meta_json).map_err(|e| e.to_string())?;

    Ok(meta)
}

#[tauri::command]
pub async fn reorder_notes_in_folder(
    app_handle: AppHandle,
    folder_id: Option<String>,
    note_ids: Vec<String>,
) -> Result<(), String> {
    let notes_dir = get_notes_dir(&app_handle).map_err(|e| e.to_string())?;

    for (index, note_id) in note_ids.iter().enumerate() {
        let note_dir = notes_dir.join(note_id);
        if !note_dir.exists() {
            continue;
        }
        let mut meta = match read_note_meta(&note_dir) {
            Ok(m) => m,
            Err(_) => continue,
        };
        // Defensive: only update if the note is actually in the declared folder.
        if meta.folder_id != folder_id {
            continue;
        }
        meta.order = index as i32;
        let meta_json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
        fs::write(note_dir.join("note.json"), meta_json).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Reset folder_id to None for all notes currently in the given folder.
/// Used when a folder is deleted — notes become orphans (root) instead of being lost.
pub fn orphan_notes_in_folder(app_handle: &AppHandle, folder_id: &str) -> Result<()> {
    let notes_dir = get_notes_dir(app_handle)?;

    let entries = fs::read_dir(&notes_dir)?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let mut meta = match read_note_meta(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        // Soft-deleted notes keep their folder_id intact (tombstone preservation).
        if !is_note_active(&meta) {
            continue;
        }

        if meta.folder_id.as_deref() == Some(folder_id) {
            meta.folder_id = None;
            let meta_json = serde_json::to_string_pretty(&meta)?;
            fs::write(path.join("note.json"), meta_json)?;
        }
    }

    Ok(())
}

/// Return all notes whose HTML content references `note_id` via a note-link node.
/// The pattern looked up is literal: `data-note-id="{note_id}"`.
#[tauri::command]
pub async fn get_backlinks(
    app_handle: AppHandle,
    note_id: String,
) -> Result<Vec<NoteMeta>, String> {
    let notes_dir = get_notes_dir(&app_handle).map_err(|e| e.to_string())?;
    let needle = format!("data-note-id=\"{}\"", note_id);

    let mut results: Vec<NoteMeta> = Vec::new();

    let entries = fs::read_dir(&notes_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        // Skip the note itself — self-references don't count as backlinks.
        if path.file_name().and_then(|n| n.to_str()) == Some(note_id.as_str()) {
            continue;
        }

        let content_path = path.join("content.html");
        let html = match fs::read_to_string(&content_path) {
            Ok(h) => h,
            Err(_) => continue,
        };

        if html.contains(&needle) {
            if let Ok(meta) = read_note_meta(&path) {
                if is_note_active(&meta) {
                    results.push(meta);
                }
            }
        }
    }

    results.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(results)
}

/// Imports a note for backup restore. The note's id, meta, and content_html
/// are preserved exactly — overwriting any existing note with the same id.
/// If the meta has `deleted_at: Some(...)`, the note is restored as soft-deleted
/// (preserves the tombstone semantic).
#[tauri::command]
pub async fn import_note_for_backup(
    app_handle: AppHandle,
    meta: NoteMeta,
    content: String,
) -> Result<(), String> {
    let notes_dir = get_notes_dir(&app_handle).map_err(|e| e.to_string())?;
    let note_dir = notes_dir.join(&meta.id);
    fs::create_dir_all(&note_dir).map_err(|e| e.to_string())?;
    let meta_json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(note_dir.join("note.json"), meta_json).map_err(|e| e.to_string())?;
    fs::write(note_dir.join("content.html"), content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn search_notes(
    app_handle: AppHandle,
    query: String,
) -> Result<Vec<NoteMeta>, String> {
    let notes_dir = get_notes_dir(&app_handle).map_err(|e| e.to_string())?;
    let lower_query = query.to_lowercase();

    let mut results: Vec<NoteMeta> = Vec::new();

    let entries = fs::read_dir(&notes_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        if let Ok(meta) = read_note_meta(&path) {
            if !is_note_active(&meta) {
                continue;
            }

            let title_match = meta.title.to_lowercase().contains(&lower_query);

            let content_match = if !title_match {
                let content_path = path.join("content.html");
                if let Ok(html) = fs::read_to_string(&content_path) {
                    let text = strip_html_tags(&html);
                    text.to_lowercase().contains(&lower_query)
                } else {
                    false
                }
            } else {
                false
            };

            if title_match || content_match {
                results.push(meta);
            }
        }
    }

    results.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_meta(deleted_at: Option<String>) -> NoteMeta {
        NoteMeta {
            id: "test-id".to_string(),
            title: "Test".to_string(),
            created_at: "2026-05-19T10:00:00Z".to_string(),
            updated_at: "2026-05-19T10:00:00Z".to_string(),
            favorite: false,
            folder_id: None,
            order: 0,
            deleted_at,
            local_only: false,
        }
    }

    #[test]
    fn is_note_active_returns_true_when_deleted_at_is_none() {
        let meta = make_meta(None);
        assert!(is_note_active(&meta));
    }

    #[test]
    fn is_note_active_returns_false_when_deleted_at_is_some() {
        let meta = make_meta(Some("2026-05-19T11:00:00Z".to_string()));
        assert!(!is_note_active(&meta));
    }

    #[test]
    fn note_meta_roundtrips_with_deleted_at() {
        let meta = make_meta(Some("2026-05-19T11:00:00Z".to_string()));
        let json = serde_json::to_string(&meta).expect("serialize");
        // camelCase rename → JSON key is `deletedAt`
        assert!(
            json.contains("\"deletedAt\":\"2026-05-19T11:00:00Z\""),
            "expected deletedAt in JSON, got: {}",
            json
        );

        let decoded: NoteMeta = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(decoded.deleted_at, meta.deleted_at);
        assert_eq!(decoded.id, meta.id);
        assert_eq!(decoded.title, meta.title);
        assert_eq!(decoded.created_at, meta.created_at);
        assert_eq!(decoded.updated_at, meta.updated_at);
        assert_eq!(decoded.favorite, meta.favorite);
        assert_eq!(decoded.folder_id, meta.folder_id);
        assert_eq!(decoded.order, meta.order);
    }

    #[test]
    fn note_meta_skips_deleted_at_when_none() {
        let meta = make_meta(None);
        let json = serde_json::to_string(&meta).expect("serialize");
        assert!(
            !json.contains("deletedAt"),
            "expected deletedAt to be omitted, got: {}",
            json
        );
    }

    #[test]
    fn purge_post_pull_predicate_only_removes_soft_deleted() {
        // Mirror the predicate from purge_soft_deleted_notes_post_pull:
        // a note is purged iff its id is in the pulled list AND it is locally soft-deleted.
        let active = make_meta(None);
        let tombstoned = make_meta(Some("2026-05-19T11:00:00Z".to_string()));
        let pulled_ids = vec!["test-id".to_string()];
        let is_pulled = |m: &NoteMeta| pulled_ids.contains(&m.id);
        assert!(!(is_pulled(&active) && active.deleted_at.is_some()),
            "active note should NOT be purged even if its id is in the pulled list");
        assert!(is_pulled(&tombstoned) && tombstoned.deleted_at.is_some(),
            "soft-deleted note with matching id SHOULD be purged");
    }

    #[test]
    fn import_note_payload_preserves_tombstone_via_serde() {
        // Simulates what import_note_for_backup does on disk: serialize the meta
        // exactly as received. We assert the tombstone roundtrips so a restored
        // note keeps its soft-deleted state.
        let meta = make_meta(Some("2026-05-19T11:00:00Z".to_string()));
        let payload = serde_json::to_string_pretty(&meta).expect("serialize");
        let restored: NoteMeta = serde_json::from_str(&payload).expect("deserialize");
        assert_eq!(restored.deleted_at, meta.deleted_at);
        assert_eq!(restored.id, meta.id);
        assert!(!is_note_active(&restored), "tombstone must survive restore");
    }

    #[test]
    fn import_note_payload_preserves_active_state_via_serde() {
        let meta = make_meta(None);
        let payload = serde_json::to_string_pretty(&meta).expect("serialize");
        let restored: NoteMeta = serde_json::from_str(&payload).expect("deserialize");
        assert!(is_note_active(&restored));
        assert_eq!(restored.id, meta.id);
    }

    #[test]
    fn note_meta_deserializes_without_deleted_at_key() {
        // Backward compat: legacy note.json files on disk don't have the deletedAt key.
        let legacy_json = r#"{
            "id": "abc",
            "title": "Legacy Note",
            "createdAt": "2026-05-19T10:00:00Z",
            "updatedAt": "2026-05-19T10:00:00Z",
            "favorite": false,
            "order": 0
        }"#;
        let meta: NoteMeta = serde_json::from_str(legacy_json).expect("deserialize legacy");
        assert_eq!(meta.deleted_at, None);
        assert!(is_note_active(&meta));
    }

    #[test]
    fn note_meta_roundtrips_local_only_true() {
        let mut meta = make_meta(None);
        meta.local_only = true;
        let json = serde_json::to_string(&meta).expect("serialize");
        // camelCase rename → JSON key is `localOnly`
        assert!(
            json.contains("\"localOnly\":true"),
            "expected localOnly in JSON, got: {}",
            json
        );
        let decoded: NoteMeta = serde_json::from_str(&json).expect("deserialize");
        assert!(decoded.local_only);
    }

    #[test]
    fn note_meta_defaults_local_only_false_on_legacy_json() {
        // Backward compat: note.json files written before PR3 have no localOnly key.
        let legacy_json = r#"{
            "id": "abc",
            "title": "Legacy Note",
            "createdAt": "2026-05-19T10:00:00Z",
            "updatedAt": "2026-05-19T10:00:00Z",
            "favorite": false,
            "order": 0
        }"#;
        let meta: NoteMeta = serde_json::from_str(legacy_json).expect("deserialize legacy");
        assert!(!meta.local_only);
    }

    #[test]
    fn import_note_payload_preserves_local_only_via_serde() {
        // import_note_for_backup serializes the meta exactly as received —
        // a restored local-only note must stay local-only.
        let mut meta = make_meta(None);
        meta.local_only = true;
        let payload = serde_json::to_string_pretty(&meta).expect("serialize");
        let restored: NoteMeta = serde_json::from_str(&payload).expect("deserialize");
        assert!(restored.local_only);
        assert_eq!(restored.id, meta.id);
    }
}

#[cfg(test)]
mod note_id_tests {
    use super::is_valid_note_id;

    #[test]
    fn accepts_canonical_uuid() {
        assert!(is_valid_note_id("0f8fad5b-d9cb-469f-a165-70867728950e"));
    }

    #[test]
    fn rejects_empty_and_traversal() {
        assert!(!is_valid_note_id(""));
        assert!(!is_valid_note_id("../../etc/passwd"));
    }

    #[test]
    fn rejects_wrong_shape() {
        // no dashes
        assert!(!is_valid_note_id("0f8fad5bd9cb469fa16570867728950e0000"));
        // non-hex char at the end
        assert!(!is_valid_note_id("0f8fad5b-d9cb-469f-a165-70867728950g"));
        // dash at wrong index
        assert!(!is_valid_note_id("0f8fad5bd-9cb-469f-a165-70867728950e"));
    }
}
