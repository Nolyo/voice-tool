use std::fmt;
use std::io::Cursor;
use std::sync::OnceLock;
use std::time::Duration;

use reqwest::multipart::{Form, Part};
use serde::{Deserialize, Serialize};

fn api_base() -> &'static str {
    option_env!("LEXENA_CLOUD_API_BASE").unwrap_or("https://api.lexena.app")
}

static CLOUD_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn cloud_client() -> &'static reqwest::Client {
    CLOUD_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .expect("failed to build cloud reqwest client")
    })
}

#[derive(Debug)]
pub enum CloudError {
    Network(reqwest::Error),
    Api {
        status: u16,
        code: String,
        message: String,
    },
    MissingAuth,
    WavEncoding(String),
}

impl fmt::Display for CloudError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CloudError::Network(e) => write!(f, "network error: {}", e),
            CloudError::Api { status, code, message } => {
                write!(f, "worker {} ({}): {}", status, code, message)
            }
            CloudError::MissingAuth => write!(f, "missing auth token"),
            CloudError::WavEncoding(e) => write!(f, "wav encoding failed: {}", e),
        }
    }
}

impl std::error::Error for CloudError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            CloudError::Network(e) => Some(e),
            _ => None,
        }
    }
}

impl From<reqwest::Error> for CloudError {
    fn from(e: reqwest::Error) -> Self {
        CloudError::Network(e)
    }
}

impl Serialize for CloudError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        match self {
            CloudError::Api { status, code, message } => {
                let mut map = serializer.serialize_map(Some(4))?;
                map.serialize_entry("kind", "api")?;
                map.serialize_entry("status", status)?;
                map.serialize_entry("code", code)?;
                map.serialize_entry("message", message)?;
                map.end()
            }
            CloudError::Network(e) => {
                let mut map = serializer.serialize_map(Some(2))?;
                map.serialize_entry("kind", "network")?;
                map.serialize_entry("message", &e.to_string())?;
                map.end()
            }
            CloudError::MissingAuth => {
                let mut map = serializer.serialize_map(Some(2))?;
                map.serialize_entry("kind", "missing_auth")?;
                map.serialize_entry("message", "missing auth token")?;
                map.end()
            }
            CloudError::WavEncoding(msg) => {
                let mut map = serializer.serialize_map(Some(2))?;
                map.serialize_entry("kind", "wav_encoding")?;
                map.serialize_entry("message", msg)?;
                map.end()
            }
        }
    }
}

#[derive(Deserialize)]
struct ErrorBody {
    error: String,
    message: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TranscriptionResult {
    pub text: String,
    pub duration_ms: u64,
    pub request_id: String,
    pub source: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PostProcessResult {
    pub text: String,
    pub tokens_in: u32,
    pub tokens_out: u32,
    pub request_id: String,
    pub source: String,
}

/// Encode i16 PCM samples as a WAV byte buffer in memory (mono, 16-bit).
/// Zero-retention compliant: nothing touches disk.
fn encode_wav_in_memory(samples: &[i16], sample_rate: u32) -> Result<Vec<u8>, CloudError> {
    let mut buf = Vec::with_capacity(44 + samples.len() * 2);
    {
        let cursor = Cursor::new(&mut buf);
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::new(cursor, spec)
            .map_err(|e| CloudError::WavEncoding(e.to_string()))?;
        for s in samples {
            writer
                .write_sample(*s)
                .map_err(|e| CloudError::WavEncoding(e.to_string()))?;
        }
        writer
            .finalize()
            .map_err(|e| CloudError::WavEncoding(e.to_string()))?;
    }
    Ok(buf)
}

async fn handle_response<T: for<'de> Deserialize<'de>>(
    res: reqwest::Response,
) -> Result<T, CloudError> {
    let status = res.status();
    if status.is_success() {
        Ok(res.json::<T>().await?)
    } else {
        let body = res.json::<ErrorBody>().await.unwrap_or(ErrorBody {
            error: "unknown".into(),
            message: format!("HTTP {}", status.as_u16()),
        });
        Err(CloudError::Api {
            status: status.as_u16(),
            code: body.error,
            message: body.message,
        })
    }
}

#[tauri::command]
pub async fn transcribe_audio_cloud(
    samples: Vec<i16>,
    sample_rate: u32,
    language: Option<String>,
    jwt: String,
    idempotency_key: Option<String>,
) -> Result<TranscriptionResult, CloudError> {
    if jwt.is_empty() {
        return Err(CloudError::MissingAuth);
    }
    let wav_bytes = encode_wav_in_memory(&samples, sample_rate)?;
    let part = Part::bytes(wav_bytes)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| CloudError::Api {
            status: 400,
            code: "client_error".into(),
            message: format!("invalid mime: {e}"),
        })?;
    let mut form = Form::new().part("audio", part);
    if let Some(lang) = language {
        form = form.text("language", lang);
    }

    let mut req = cloud_client()
        .post(format!("{}/transcribe", api_base()))
        .bearer_auth(&jwt)
        .multipart(form);
    if let Some(key) = idempotency_key {
        req = req.header("Idempotency-Key", key);
    }
    let res = req.send().await?;
    handle_response(res).await
}

#[tauri::command]
pub async fn post_process_cloud(
    task: String,
    text: String,
    language: Option<String>,
    model_tier: Option<String>,
    jwt: String,
    idempotency_key: Option<String>,
) -> Result<PostProcessResult, CloudError> {
    if jwt.is_empty() {
        return Err(CloudError::MissingAuth);
    }
    let body = serde_json::json!({
        "task": task,
        "text": text,
        "language": language,
        "model_tier": model_tier,
    });
    let mut req = cloud_client()
        .post(format!("{}/post-process", api_base()))
        .bearer_auth(&jwt)
        .json(&body);
    if let Some(key) = idempotency_key {
        req = req.header("Idempotency-Key", key);
    }
    let res = req.send().await?;
    handle_response(res).await
}
