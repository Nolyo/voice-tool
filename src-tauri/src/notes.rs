use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
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

/// Get the notes directory, creating it if needed
fn get_notes_dir(app_handle: &AppHandle) -> Result<PathBuf> {
    let app_data = app_handle
        .path()
        .app_data_dir()
        .context("Could not resolve app data directory")?;
    let notes_dir = app_data.join("notes");
    if !notes_dir.exists() {
        fs::create_dir_all(&notes_dir)
            .with_context(|| format!("Failed to create notes directory: {}", notes_dir.display()))?;
    }
    Ok(notes_dir)
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
    let store = StoreBuilder::new(app_handle, "settings.json").build()?;

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
            notes.push(meta);
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
pub async fn create_note(app_handle: AppHandle) -> Result<NoteMeta, String> {
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

    if note_dir.exists() {
        fs::remove_dir_all(&note_dir).map_err(|e| e.to_string())?;
    }

    Ok(())
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
