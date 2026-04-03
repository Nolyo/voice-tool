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
        .map_err(|e| anyhow!("Erreur lors de la création du client HTTP: {}", e))?;

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
                anyhow!("Délai d'attente dépassé. Vérifiez votre connexion internet.")
            } else if e.is_connect() {
                tracing::error!("Connection error: {}", e);
                anyhow!("Impossible de se connecter à l'API OpenAI. Vérifiez votre connexion internet.")
            } else if e.is_request() {
                tracing::error!("Request error: {}", e);
                anyhow!("Erreur lors de l'envoi de la requête. Vérifiez votre connexion réseau.")
            } else {
                tracing::error!("HTTP error: {}", e);
                anyhow!("Erreur de connexion: {}", e)
            }
        })?;

    let status = response.status();
    tracing::info!("Received response from OpenAI (status: {})", status);

    if !status.is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Erreur inconnue".to_string());
        tracing::error!("OpenAI API error {}: {}", status, error_text);

        return Err(match status.as_u16() {
            401 => anyhow!("Clé API OpenAI invalide. Vérifiez votre clé dans les paramètres."),
            429 => anyhow!("Trop de requêtes. Veuillez patienter quelques instants."),
            500..=599 => anyhow!("Erreur du serveur OpenAI. Réessayez dans quelques instants."),
            _ => anyhow!("Erreur OpenAI ({}): {}", status, error_text),
        });
    }

    let chat_response: ChatResponse = response
        .json()
        .await
        .map_err(|e| anyhow!("Erreur lors de la lecture de la réponse: {}", e))?;

    let text = chat_response
        .choices
        .into_iter()
        .next()
        .and_then(|c| c.message.content)
        .unwrap_or_default();

    tracing::info!("AI response received ({} characters)", text.len());
    Ok(text)
}
