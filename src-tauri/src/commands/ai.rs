use crate::chat;

#[tauri::command]
pub async fn ai_process_text(
    api_key: String,
    system_prompt: String,
    user_text: String,
) -> Result<String, String> {
    chat::chat_completion(&api_key, &system_prompt, &user_text)
        .await
        .map_err(|e| e.to_string())
}
