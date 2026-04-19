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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChatProvider {
    OpenAI,
    Groq,
}

impl ChatProvider {
    pub fn parse(value: &str) -> Result<Self> {
        match value.to_ascii_lowercase().as_str() {
            "openai" => Ok(Self::OpenAI),
            "groq" => Ok(Self::Groq),
            other => Err(anyhow!("Unsupported chat provider: {}", other)),
        }
    }

    fn endpoint(self) -> &'static str {
        match self {
            Self::OpenAI => "https://api.openai.com/v1/chat/completions",
            Self::Groq => "https://api.groq.com/openai/v1/chat/completions",
        }
    }

    fn default_model(self) -> &'static str {
        match self {
            Self::OpenAI => "gpt-4o-mini",
            Self::Groq => "llama-3.1-8b-instant",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::OpenAI => "OpenAI",
            Self::Groq => "Groq",
        }
    }
}

/// Call OpenAI Chat Completions API (default provider, kept for backward compat).
pub async fn chat_completion(
    api_key: &str,
    system_prompt: &str,
    user_text: &str,
) -> Result<String> {
    chat_completion_with_provider(ChatProvider::OpenAI, api_key, system_prompt, user_text).await
}

/// Call a Chat Completions API on the given provider (OpenAI-compatible schema).
pub async fn chat_completion_with_provider(
    provider: ChatProvider,
    api_key: &str,
    system_prompt: &str,
    user_text: &str,
) -> Result<String> {
    if api_key.trim().is_empty() {
        return Err(anyhow!(
            "Missing {} API key. Configure it in settings.",
            provider.label()
        ));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| anyhow!("Failed to create HTTP client: {}", e))?;

    let body = serde_json::json!({
        "model": provider.default_model(),
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_text }
        ],
        "temperature": 0.3
    });

    tracing::info!(
        "Sending request to {} Chat Completions API (model: {})...",
        provider.label(),
        provider.default_model()
    );

    let response = client
        .post(provider.endpoint())
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
                anyhow!(
                    "Cannot connect to {} API. Check your internet connection.",
                    provider.label()
                )
            } else if e.is_request() {
                tracing::error!("Request error: {}", e);
                anyhow!("Failed to send request. Check your network connection.")
            } else {
                tracing::error!("HTTP error: {}", e);
                anyhow!("Connection error: {}", e)
            }
        })?;

    let status = response.status();
    tracing::info!(
        "Received response from {} (status: {})",
        provider.label(),
        status
    );

    if !status.is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        tracing::error!("{} API error {}: {}", provider.label(), status, error_text);

        return Err(match status.as_u16() {
            401 => anyhow!(
                "Invalid {} API key. Check your key in settings.",
                provider.label()
            ),
            429 => anyhow!("Too many requests. Please wait a moment."),
            500..=599 => anyhow!("{} server error. Try again in a moment.", provider.label()),
            _ => anyhow!("{} error ({}): {}", provider.label(), status, error_text),
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
