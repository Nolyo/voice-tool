//! Lemon Squeezy checkout entry point.
//!
//! Cf. ADR 0013 (premium offer) et plan billing 2026-05-05.

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
    #[error("user_id is required to attach custom_data for the webhook")]
    MissingUserId,
    #[error("invalid checkout url: {0}")]
    InvalidUrl(String),
    #[error("failed to open external url: {0}")]
    OpenFailed(String),
}

/// Opens the Lemon Squeezy checkout URL in the user's default browser.
/// `user_id` is propagated as `checkout[custom][user_id]` so the webhook
/// associates the resulting subscription with the right Supabase auth user.
#[tauri::command]
pub async fn open_checkout(
    app: AppHandle,
    checkout_url: String,
    user_id: String,
    email: Option<String>,
) -> Result<CheckoutOpenResult, CheckoutError> {
    if user_id.trim().is_empty() {
        return Err(CheckoutError::MissingUserId);
    }
    if checkout_url.trim().is_empty() {
        return Err(CheckoutError::MissingCheckoutUrl);
    }

    let mut url = url::Url::parse(&checkout_url)
        .map_err(|e| CheckoutError::InvalidUrl(e.to_string()))?;
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("checkout[custom][user_id]", &user_id);
        if let Some(e) = email.as_deref() {
            q.append_pair("checkout[email]", e);
        }
        q.append_pair("embed", "0");
    }
    let final_url = url.to_string();

    info!(target = "billing", user_id = %user_id, "opening Lemon Squeezy checkout");

    app.opener()
        .open_url(&final_url, None::<&str>)
        .map_err(|e| CheckoutError::OpenFailed(e.to_string()))?;

    let _ = app.emit("billing-checkout-opened", &final_url);

    Ok(CheckoutOpenResult {
        opened_url: final_url,
    })
}
