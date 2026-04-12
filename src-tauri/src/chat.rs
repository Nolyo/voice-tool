use anyhow::{Result, anyhow};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

/// Call OpenAI Chat Completions API
pub async fn chat_completion(
    api_key: &str,
    system_prompt: &str,
    user_text: &str,
) -> Result<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| anyhow!("Failed to create HTTP client: {}", e))?;

    let body = serde_json::json!({
        "model": "gpt-4o-mini",
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_text }
        ],
        "temperature": 0.3
    });

    tracing::info!("Sending request to OpenAI Chat Completions API...");

    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                tracing::error!("Request timed out: {}", e);
                anyhow!("Request timed out. Check your internet connection.")
            } else if e.is_connect() {
                tracing::error!("Connection error: {}", e);
                anyhow!("Cannot connect to OpenAI API. Check your internet connection.")
            } else if e.is_request() {
                tracing::error!("Request error: {}", e);
                anyhow!("Failed to send request. Check your network connection.")
            } else {
                tracing::error!("HTTP error: {}", e);
                anyhow!("Connection error: {}", e)
            }
        })?;

    let status = response.status();
    tracing::info!("Received response from OpenAI (status: {})", status);

    if !status.is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        tracing::error!("OpenAI API error {}: {}", status, error_text);

        return Err(match status.as_u16() {
            401 => anyhow!("Invalid OpenAI API key. Check your key in settings."),
            429 => anyhow!("Too many requests. Please wait a moment."),
            500..=599 => anyhow!("OpenAI server error. Try again in a moment."),
            _ => anyhow!("OpenAI error ({}): {}", status, error_text),
        });
    }

    let chat_response: ChatResponse = response
        .json()
        .await
        .map_err(|e| anyhow!("Failed to read response: {}", e))?;

    let text = chat_response
        .choices
        .into_iter()
        .next()
        .and_then(|c| c.message.content)
        .unwrap_or_default();

    tracing::info!("AI response received ({} characters)", text.len());
    Ok(text)
}
