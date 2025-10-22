use crate::deepgram_types::{DeepgramError, DeepgramResponse};
use anyhow::{Context, Result, anyhow};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::{mpsc, Mutex};
use tokio::task::JoinHandle;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{
        client::IntoClientRequest,
        http::HeaderValue,
        Message,
    },
};

type WsStream = tokio_tungstenite::WebSocketStream<
    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
>;

/// Deepgram streaming transcription manager
pub struct DeepgramStreamer {
    audio_tx: Option<mpsc::Sender<Vec<i16>>>,
    ws_task: Option<JoinHandle<()>>,
    audio_task: Option<JoinHandle<()>>,
}

impl DeepgramStreamer {
    pub fn new() -> Self {
        Self {
            audio_tx: None,
            ws_task: None,
            audio_task: None,
        }
    }

    /// Connect to Deepgram WebSocket and start streaming
    pub async fn connect<R: Runtime>(
        &mut self,
        api_key: String,
        language: String,
        sample_rate: u32,
        app_handle: AppHandle<R>,
    ) -> Result<()> {
        // Stop any existing connection
        self.disconnect().await;

        tracing::info!(
            "Connecting to Deepgram (language: {}, sample_rate: {})",
            language,
            sample_rate
        );

        // Build WebSocket URL
        let url = format!(
            "wss://api.deepgram.com/v1/listen?language={}&punctuate=true&interim_results=true&encoding=linear16&sample_rate={}&channels=1",
            language, sample_rate
        );

        // Create WebSocket request with Authorization header
        let mut request = url.into_client_request()?;
        request.headers_mut().insert(
            "Authorization",
            HeaderValue::from_str(&format!("Token {}", api_key))?,
        );

        // Connect to WebSocket
        let (ws_stream, response) = connect_async(request)
            .await
            .context("Failed to connect to Deepgram WebSocket")?;

        tracing::info!("Deepgram WebSocket connected: {:?}", response.status());

        let (ws_sink, ws_source) = ws_stream.split();

        // Create MPSC channel for audio chunks (buffer 100 chunks)
        let (audio_tx, audio_rx) = mpsc::channel::<Vec<i16>>(100);

        // Store audio sender
        self.audio_tx = Some(audio_tx.clone());

        // Wrap sink in Arc<Mutex> for shared ownership
        let ws_sink = Arc::new(Mutex::new(ws_sink));

        // Task 1: Send audio chunks to WebSocket
        let ws_sink_clone = Arc::clone(&ws_sink);
        let app_handle_audio = app_handle.clone();
        let audio_task = tokio::spawn(async move {
            Self::audio_sender_task(audio_rx, ws_sink_clone, app_handle_audio).await;
        });

        // Task 2: Receive transcriptions from WebSocket
        let app_handle_ws = app_handle.clone();
        let ws_task = tokio::spawn(async move {
            Self::transcription_receiver_task(ws_source, app_handle_ws).await;
        });

        self.audio_task = Some(audio_task);
        self.ws_task = Some(ws_task);

        // Emit connection success event
        let _ = app_handle.emit("deepgram-connected", json!({"status": "connected"}));

        tracing::info!("Deepgram streaming tasks started successfully");

        Ok(())
    }

    /// Send audio chunk to Deepgram
    pub async fn send_audio(&self, chunk: Vec<i16>) -> Result<()> {
        if let Some(tx) = &self.audio_tx {
            tx.send(chunk)
                .await
                .context("Failed to send audio chunk to Deepgram")?;
        } else {
            return Err(anyhow!("Deepgram not connected"));
        }
        Ok(())
    }

    /// Disconnect from Deepgram and cleanup
    pub async fn disconnect(&mut self) {
        tracing::info!("Disconnecting from Deepgram");

        // Drop audio sender to signal tasks to stop
        self.audio_tx = None;

        // Allow background tasks to finish gracefully
        if let Some(task) = self.audio_task.take() {
            if let Err(err) = task.await {
                if !err.is_cancelled() {
                    tracing::debug!("Audio sender task ended with error: {}", err);
                }
            }
        }

        if let Some(task) = self.ws_task.take() {
            if let Err(err) = task.await {
                if !err.is_cancelled() {
                    tracing::debug!("Transcription receiver task ended with error: {}", err);
                }
            }
        }

        tracing::info!("Deepgram disconnected");
    }

    /// Check if currently connected
    pub fn is_connected(&self) -> bool {
        self.audio_tx.is_some()
    }

    // === Private Helper Tasks ===

    /// Task to send audio chunks to WebSocket
    async fn audio_sender_task<R: Runtime>(
        mut audio_rx: mpsc::Receiver<Vec<i16>>,
        ws_sink: Arc<Mutex<futures_util::stream::SplitSink<WsStream, Message>>>,
        app_handle: AppHandle<R>,
    ) {
        tracing::info!("Audio sender task started");

        let mut buffer: Vec<i16> = Vec::with_capacity(4800); // ~100ms at 48kHz
        let send_interval = tokio::time::Duration::from_millis(100); // Send every 100ms
        let mut next_flush_deadline = tokio::time::Instant::now() + send_interval;

        loop {
            tokio::select! {
                // Receive audio chunks
                chunk_opt = audio_rx.recv() => {
                    match chunk_opt {
                        Some(chunk) => {
                            buffer.extend_from_slice(&chunk);

                            // Send if buffer is large enough or enough time has passed
                            if buffer.len() >= 4800 || tokio::time::Instant::now() >= next_flush_deadline {
                                if !buffer.is_empty() {
                                    if Self::flush_audio_buffer(&mut buffer, &ws_sink, &app_handle).await.is_err() {
                                        break;
                                    }
                                    next_flush_deadline = tokio::time::Instant::now() + send_interval;
                                }
                            }
                        }
                        None => {
                            // Flush remaining samples before closing
                            if !buffer.is_empty() {
                                if Self::flush_audio_buffer(&mut buffer, &ws_sink, &app_handle).await.is_err() {
                                    break;
                                }
                            }

                            // Notify Deepgram that the stream is complete before closing
                            let mut sink = ws_sink.lock().await;
                            if let Err(e) = sink.send(Message::Text(r#"{"type":"CloseStream"}"#.into())).await {
                                tracing::debug!("Failed to send Deepgram CloseStream message: {}", e);
                            }

                            if let Err(e) = sink.close().await {
                                tracing::debug!("Failed to close Deepgram WebSocket cleanly: {}", e);
                            }

                            break;
                        }
                    }
                }

                // Timeout to flush buffer periodically even if not full
                _ = tokio::time::sleep(send_interval) => {
                    if !buffer.is_empty() && tokio::time::Instant::now() >= next_flush_deadline {
                        if Self::flush_audio_buffer(&mut buffer, &ws_sink, &app_handle).await.is_err() {
                            break;
                        }
                        next_flush_deadline = tokio::time::Instant::now() + send_interval;
                    }
                }
            }
        }

        tracing::info!("Audio sender task stopped");
    }

    async fn flush_audio_buffer<R: Runtime>(
        buffer: &mut Vec<i16>,
        ws_sink: &Arc<Mutex<futures_util::stream::SplitSink<WsStream, Message>>>,
        app_handle: &AppHandle<R>,
    ) -> Result<(), ()> {
        if buffer.is_empty() {
            return Ok(());
        }

        let bytes: Vec<u8> = buffer.iter().flat_map(|s| s.to_le_bytes()).collect();

        let mut sink = ws_sink.lock().await;
        if let Err(e) = sink.send(Message::Binary(bytes)).await {
            tracing::error!("Failed to send audio to Deepgram: {}", e);
            let _ = app_handle.emit(
                "deepgram-error",
                json!({
                    "code": "SEND_ERROR",
                    "message": format!("Failed to send audio: {}", e)
                }),
            );
            return Err(());
        }

        buffer.clear();
        Ok(())
    }

    /// Task to receive transcriptions from WebSocket
    async fn transcription_receiver_task<R: Runtime>(
        mut ws_source: futures_util::stream::SplitStream<WsStream>,
        app_handle: AppHandle<R>,
    ) {
        tracing::info!("Transcription receiver task started");

        while let Some(msg_result) = ws_source.next().await {
            match msg_result {
                Ok(Message::Text(text)) => {
                    // Try to parse as normal response
                    if let Ok(response) = serde_json::from_str::<DeepgramResponse>(&text) {
                        Self::handle_transcription_response(response, &app_handle);
                    }
                    // Try to parse as error response
                    else if let Ok(error) = serde_json::from_str::<DeepgramError>(&text) {
                        tracing::error!(
                            "Deepgram error: {} - {:?}",
                            error.error_type,
                            error.message
                        );
                        let _ = app_handle.emit(
                            "deepgram-error",
                            json!({
                                "code": error.error_type,
                                "message": error.message.unwrap_or_else(|| "Unknown error".to_string())
                            }),
                        );
                    }
                    // Unknown message format
                    else {
                        tracing::warn!("Unknown Deepgram message format: {}", text);
                    }
                }
                Ok(Message::Close(frame)) => {
                    tracing::info!("Deepgram WebSocket closed: {:?}", frame);
                    let _ = app_handle.emit(
                        "deepgram-disconnected",
                        json!({"reason": "Connection closed"}),
                    );
                    break;
                }
                Ok(_) => {} // Ignore other message types (Binary, Ping, Pong)
                Err(e) => {
                    tracing::error!("WebSocket error: {}", e);
                    let _ = app_handle.emit(
                        "deepgram-error",
                        json!({
                            "code": "WEBSOCKET_ERROR",
                            "message": format!("WebSocket error: {}", e)
                        }),
                    );
                    break;
                }
            }
        }

        tracing::info!("Transcription receiver task stopped");
    }

    /// Handle transcription response from Deepgram
    fn handle_transcription_response<R: Runtime>(
        response: DeepgramResponse,
        app_handle: &AppHandle<R>,
    ) {
        // Skip if no alternatives
        if response.channel.alternatives.is_empty() {
            return;
        }

        let transcript = &response.channel.alternatives[0].transcript;

        // Skip empty transcripts
        if transcript.is_empty() {
            return;
        }

        let is_final = response.is_final.unwrap_or(false);
        let speech_final = response.speech_final.unwrap_or(false);
        let confidence = response.channel.alternatives[0].confidence;

        if is_final {
            tracing::info!(
                "Deepgram final: \"{}\" (confidence: {:?}, speech_final: {})",
                transcript,
                confidence,
                speech_final
            );
            let _ = app_handle.emit(
                "transcription-final",
                json!({
                    "text": transcript,
                    "confidence": confidence,
                    "speech_final": speech_final
                }),
            );
        } else {
            tracing::debug!("Deepgram interim: \"{}\"", transcript);
            let _ = app_handle.emit(
                "transcription-interim",
                json!({
                    "text": transcript,
                    "confidence": confidence
                }),
            );
        }
    }
}

impl Drop for DeepgramStreamer {
    fn drop(&mut self) {
        // Cleanup on drop
        if let Some(task) = self.audio_task.take() {
            task.abort();
        }
        if let Some(task) = self.ws_task.take() {
            task.abort();
        }
    }
}
