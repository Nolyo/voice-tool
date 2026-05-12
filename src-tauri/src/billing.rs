//! Lemon Squeezy checkout entry point.
//!
//! L'URL de checkout est désormais générée côté Edge Function
//! `lemonsqueezy-create-checkout` (qui appelle l'API LS et y attache
//! `checkout_data.custom = { user_id, plan, cycle }`). Cette commande
//! ne fait plus que valider l'URL reçue et l'ouvrir dans le navigateur.
//! Cf. ADR 0013 et plan billing 2026-05-05.

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;
use tracing::info;

#[derive(Debug, Serialize)]
pub struct CheckoutOpenResult {
    pub opened_url: String,
}

#[derive(Debug, thiserror::Error, Serialize)]
pub enum CheckoutError {
    #[error("checkout_url is required")]
    MissingCheckoutUrl,
    #[error("invalid checkout url: {0}")]
    InvalidUrl(String),
    #[error("failed to open external url: {0}")]
    OpenFailed(String),
}

#[tauri::command]
pub async fn open_checkout(
    app: AppHandle,
    checkout_url: String,
) -> Result<CheckoutOpenResult, CheckoutError> {
    if checkout_url.trim().is_empty() {
        return Err(CheckoutError::MissingCheckoutUrl);
    }

    let url = url::Url::parse(&checkout_url)
        .map_err(|e| CheckoutError::InvalidUrl(e.to_string()))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(CheckoutError::InvalidUrl(format!(
            "scheme not allowed: {}",
            url.scheme()
        )));
    }

    let final_url = url.to_string();
    info!(target = "billing", "opening Lemon Squeezy checkout");

    app.opener()
        .open_url(&final_url, None::<&str>)
        .map_err(|e| CheckoutError::OpenFailed(e.to_string()))?;

    let _ = app.emit("billing-checkout-opened", &final_url);

    Ok(CheckoutOpenResult { opened_url: final_url })
}
