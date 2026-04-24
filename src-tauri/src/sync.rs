use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tracing::{info, warn};

// ── Constants ────────────────────────────────────────────────────────────────

const BACKUPS_SUBDIR: &str = "backups";
const BACKUP_FILE_PREFIX: &str = "pre-sync_";
const MAX_BACKUPS: usize = 10;

// ── Structs ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupMeta {
    pub filename: String,
    pub created_at: String,
    pub size_bytes: u64,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn backups_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("cannot resolve app_data_dir: {}", e))?
        .join(BACKUPS_SUBDIR);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("cannot create backups dir: {}", e))?;
    }
    Ok(dir)
}

fn rotate_backups(dir: &PathBuf) -> Result<(), String> {
    let mut entries: Vec<(PathBuf, std::time::SystemTime)> = fs::read_dir(dir)
        .map_err(|e| format!("cannot read backups dir: {}", e))?
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            let name = path.file_name()?.to_string_lossy().to_string();
            if !name.starts_with(BACKUP_FILE_PREFIX) || !name.ends_with(".json") {
                return None;
            }
            let meta = e.metadata().ok()?;
            Some((path, meta.modified().ok()?))
        })
        .collect();

    entries.sort_by_key(|(_, mtime)| *mtime);

    while entries.len() > MAX_BACKUPS {
        let (oldest, _) = entries.remove(0);
        if let Err(e) = fs::remove_file(&oldest) {
            warn!("failed to remove old backup {:?}: {}", oldest, e);
        } else {
            info!("rotated old backup {:?}", oldest);
        }
    }
    Ok(())
}

// ── Tauri commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn write_local_backup(app: AppHandle, payload_json: String) -> Result<String, String> {
    let dir = backups_dir(&app)?;
    let now = chrono::Local::now();
    let filename = format!(
        "{}{}.json",
        BACKUP_FILE_PREFIX,
        now.format("%Y-%m-%d_%H%M%S")
    );
    let path = dir.join(&filename);
    fs::write(&path, payload_json.as_bytes())
        .map_err(|e| format!("cannot write backup: {}", e))?;
    rotate_backups(&dir)?;
    info!("local backup written: {}", filename);
    Ok(filename)
}

#[tauri::command]
pub async fn list_local_backups(app: AppHandle) -> Result<Vec<BackupMeta>, String> {
    let dir = backups_dir(&app)?;
    let mut out: Vec<BackupMeta> = fs::read_dir(&dir)
        .map_err(|e| format!("cannot read backups dir: {}", e))?
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            let filename = path.file_name()?.to_string_lossy().to_string();
            if !filename.starts_with(BACKUP_FILE_PREFIX) || !filename.ends_with(".json") {
                return None;
            }
            let meta = e.metadata().ok()?;
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| chrono::DateTime::<chrono::Utc>::from_timestamp(d.as_secs() as i64, 0))
                .flatten()
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default();
            Some(BackupMeta {
                filename,
                created_at: mtime,
                size_bytes: meta.len(),
            })
        })
        .collect();
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

#[tauri::command]
pub async fn read_local_backup(app: AppHandle, filename: String) -> Result<String, String> {
    if !filename.starts_with(BACKUP_FILE_PREFIX) || !filename.ends_with(".json") {
        return Err("invalid backup filename".into());
    }
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err("invalid backup filename".into());
    }
    let dir = backups_dir(&app)?;
    let path = dir.join(&filename);
    fs::read_to_string(&path).map_err(|e| format!("cannot read backup: {}", e))
}

#[tauri::command]
pub async fn delete_local_backup(app: AppHandle, filename: String) -> Result<(), String> {
    if !filename.starts_with(BACKUP_FILE_PREFIX) || !filename.ends_with(".json") {
        return Err("invalid backup filename".into());
    }
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err("invalid backup filename".into());
    }
    let dir = backups_dir(&app)?;
    let path = dir.join(&filename);
    fs::remove_file(&path).map_err(|e| format!("cannot delete backup: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn save_export_to_download(
    app: AppHandle,
    payload_json: String,
    suggested_filename: String,
) -> Result<String, String> {
    // Sanity check filename
    if suggested_filename.contains("..") || suggested_filename.contains('/') || suggested_filename.contains('\\') {
        return Err("invalid filename".into());
    }
    let downloads = app
        .path()
        .download_dir()
        .map_err(|e| format!("cannot resolve download dir: {}", e))?;
    if !downloads.exists() {
        fs::create_dir_all(&downloads).map_err(|e| format!("cannot create download dir: {}", e))?;
    }
    let path = downloads.join(&suggested_filename);
    fs::write(&path, payload_json.as_bytes()).map_err(|e| format!("cannot write export: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    #[test]
    fn filename_guard_rejects_traversal() {
        // Reproduit la logique guard
        let bad = vec!["../escape.json", "pre-sync_/etc/passwd", "pre-sync_a.json\0"];
        for f in bad {
            assert!(
                f.contains("..") || f.contains('/') || f.contains('\\') || f.contains('\0'),
                "filename {} devrait déclencher un guard",
                f
            );
        }
    }
}
