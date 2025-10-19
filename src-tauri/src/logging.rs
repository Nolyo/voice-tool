use parking_lot::RwLock;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tracing::{Level, Subscriber};
use tracing_subscriber::layer::{Context, SubscriberExt};
use tracing_subscriber::Layer;

/// Custom tracing layer that emits log events to the frontend
pub struct TauriLogLayer {
    app_handle: Arc<RwLock<Option<AppHandle>>>,
}

impl TauriLogLayer {
    pub fn new() -> Self {
        Self {
            app_handle: Arc::new(RwLock::new(None)),
        }
    }

    pub fn set_app_handle(&self, handle: AppHandle) {
        *self.app_handle.write() = Some(handle);
    }
}

impl<S> Layer<S> for TauriLogLayer
where
    S: Subscriber,
{
    fn on_event(
        &self,
        event: &tracing::Event<'_>,
        _ctx: Context<'_, S>,
    ) {
        let metadata = event.metadata();
        let level = match *metadata.level() {
            Level::ERROR => "error",
            Level::WARN => "warn",
            Level::INFO => "info",
            Level::DEBUG => "debug",
            Level::TRACE => "trace",
        };

        // Extract the message from the event
        let mut visitor = MessageVisitor::default();
        event.record(&mut visitor);
        let message = visitor.message;

        // Get current timestamp
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();

        // Emit event to frontend
        if let Some(app) = self.app_handle.read().as_ref() {
            let log_event = serde_json::json!({
                "timestamp": timestamp,
                "level": level,
                "message": message,
            });

            let _ = app.emit("app-log", log_event);
        }
    }
}

#[derive(Default)]
struct MessageVisitor {
    message: String,
}

impl tracing::field::Visit for MessageVisitor {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        if field.name() == "message" {
            self.message = format!("{:?}", value);
            // Remove quotes from the debug format
            if self.message.starts_with('"') && self.message.ends_with('"') {
                self.message = self.message[1..self.message.len() - 1].to_string();
            }
        }
    }
}

/// Initialize the logging system
pub fn init_logging() -> TauriLogLayer {
    let tauri_layer = TauriLogLayer::new();

    // Create a filter that only shows INFO and above for our app, and WARN+ for dependencies
    let filter = tracing_subscriber::EnvFilter::new("voice_tool=info,warn");

    // Set up subscriber with both console output and Tauri event emission
    let subscriber = tracing_subscriber::registry()
        .with(filter)
        .with(
            tracing_subscriber::fmt::layer()
                .with_target(false)
                .with_thread_ids(false)
                .with_line_number(false)
                .with_file(false)
        )
        .with(tauri_layer.clone());

    tracing::subscriber::set_global_default(subscriber)
        .expect("Failed to set tracing subscriber");

    tauri_layer
}

// Implement Clone manually
impl Clone for TauriLogLayer {
    fn clone(&self) -> Self {
        Self {
            app_handle: Arc::clone(&self.app_handle),
        }
    }
}
