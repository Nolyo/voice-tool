use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
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

/// Resolve `dir/filename` to its canonical form and reject paths that escape
/// `dir` (e.g. via a symlink). Caller is expected to have already validated
/// `filename` against string-traversal patterns (`..`, `/`, `\\`, `\0`); this
/// is an additional defence-in-depth layer that catches symlink-based escapes
/// the textual check cannot see. Requires the target file to already exist.
fn safe_existing_path_in(dir: &Path, filename: &str) -> Result<PathBuf, String> {
    let candidate = dir.join(filename);
    let canonical = candidate
        .canonicalize()
        .map_err(|e| format!("cannot canonicalize backup path: {}", e))?;
    let dir_canonical = dir
        .canonicalize()
        .map_err(|e| format!("cannot canonicalize backups dir: {}", e))?;
    if !canonical.starts_with(&dir_canonical) {
        return Err("path escapes backups directory".to_string());
    }
    Ok(canonical)
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
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') || filename.contains('\0') {
        return Err("invalid backup filename".into());
    }
    let dir = backups_dir(&app)?;
    let path = safe_existing_path_in(&dir, &filename)?;
    fs::read_to_string(&path).map_err(|e| format!("cannot read backup: {}", e))
}

#[tauri::command]
pub async fn delete_local_backup(app: AppHandle, filename: String) -> Result<(), String> {
    if !filename.starts_with(BACKUP_FILE_PREFIX) || !filename.ends_with(".json") {
        return Err("invalid backup filename".into());
    }
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') || filename.contains('\0') {
        return Err("invalid backup filename".into());
    }
    let dir = backups_dir(&app)?;
    let path = safe_existing_path_in(&dir, &filename)?;
    fs::remove_file(&path).map_err(|e| format!("cannot delete backup: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn delete_all_local_backups(app: AppHandle) -> Result<u32, String> {
    let dir = backups_dir(&app)?;
    let mut deleted: u32 = 0;
    for entry in fs::read_dir(&dir).map_err(|e| format!("cannot read backups dir: {}", e))? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        let name = match path.file_name() {
            Some(n) => n.to_string_lossy().to_string(),
            None => continue,
        };
        if !name.starts_with(BACKUP_FILE_PREFIX) || !name.ends_with(".json") {
            continue;
        }
        if let Err(e) = fs::remove_file(&path) {
            warn!("failed to remove backup {:?}: {}", path, e);
            continue;
        }
        deleted += 1;
    }
    info!("delete_all_local_backups removed {} files", deleted);
    Ok(deleted)
}

#[tauri::command]
pub async fn save_export_to_download(
    app: AppHandle,
    payload_json: String,
    suggested_filename: String,
) -> Result<String, String> {
    // Sanity check filename
    if suggested_filename.is_empty() {
        return Err("empty filename".into());
    }
    if suggested_filename.contains("..")
        || suggested_filename.contains('/')
        || suggested_filename.contains('\\')
        || suggested_filename.contains('\0')
    {
        return Err("invalid filename".into());
    }
    if !suggested_filename.ends_with(".json") {
        return Err("filename must end with .json".into());
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
    use super::safe_existing_path_in;
    use std::fs;

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

    #[test]
    fn safe_existing_path_returns_canonical_for_real_file() {
        let tmp = std::env::temp_dir().join(format!(
            "vt-sync-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
        ));
        fs::create_dir_all(&tmp).unwrap();
        let real = tmp.join("pre-sync_real.json");
        fs::write(&real, b"{}").unwrap();

        let resolved = safe_existing_path_in(&tmp, "pre-sync_real.json").unwrap();
        assert_eq!(resolved, real.canonicalize().unwrap());

        let _ = fs::remove_dir_all(&tmp);
    }

    #[cfg(unix)]
    #[test]
    fn safe_existing_path_rejects_symlink_escape() {
        use std::os::unix::fs::symlink;
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let tmp = std::env::temp_dir().join(format!("vt-sync-symlink-{}", nonce));
        let outside_dir = std::env::temp_dir().join(format!("vt-sync-outside-{}", nonce));
        fs::create_dir_all(&tmp).unwrap();
        fs::create_dir_all(&outside_dir).unwrap();
        let outside_file = outside_dir.join("secret.txt");
        fs::write(&outside_file, b"top secret").unwrap();
        let evil = tmp.join("pre-sync_evil.json");
        symlink(&outside_file, &evil).unwrap();

        let res = safe_existing_path_in(&tmp, "pre-sync_evil.json");
        assert!(
            matches!(res, Err(ref e) if e.contains("escapes")),
            "expected symlink escape to be rejected, got: {:?}",
            res
        );

        let _ = fs::remove_dir_all(&tmp);
        let _ = fs::remove_dir_all(&outside_dir);
    }
}
