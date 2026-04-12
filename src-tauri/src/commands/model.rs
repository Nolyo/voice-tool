use tauri::AppHandle;

use crate::transcription_local;

#[tauri::command]
pub async fn download_local_model(app_handle: AppHandle, model: String) -> Result<String, String> {
    transcription_local::download_model(app_handle, model)
        .await
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn check_local_model_exists(model: String) -> bool {
    transcription_local::check_model_exists(&model)
}

#[tauri::command]
pub fn delete_local_model(model: String) -> Result<(), String> {
    transcription_local::delete_model(&model).map_err(|e| e.to_string())
}
