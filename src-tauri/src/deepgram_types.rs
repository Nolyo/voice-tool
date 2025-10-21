use serde::{Deserialize, Serialize};

/// Response from Deepgram WebSocket API
#[derive(Debug, Deserialize, Serialize)]
pub struct DeepgramResponse {
    #[serde(rename = "type")]
    pub message_type: String,
    pub channel_index: Option<Vec<usize>>,
    pub duration: Option<f64>,
    pub start: Option<f64>,
    pub is_final: Option<bool>,
    pub speech_final: Option<bool>,
    pub channel: DeepgramChannel,
    pub metadata: Option<DeepgramMetadata>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DeepgramChannel {
    pub alternatives: Vec<DeepgramAlternative>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DeepgramAlternative {
    pub transcript: String,
    pub confidence: Option<f64>,
    pub words: Option<Vec<DeepgramWord>>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DeepgramWord {
    pub word: String,
    pub start: Option<f64>,
    pub end: Option<f64>,
    pub confidence: Option<f64>,
    pub punctuated_word: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DeepgramMetadata {
    pub request_id: Option<String>,
    pub model_info: Option<DeepgramModelInfo>,
    pub model_uuid: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DeepgramModelInfo {
    pub name: Option<String>,
    pub version: Option<String>,
    pub arch: Option<String>,
}

/// Error response from Deepgram
#[derive(Debug, Deserialize, Serialize)]
pub struct DeepgramError {
    #[serde(rename = "type")]
    pub error_type: String,
    pub description: Option<String>,
    pub message: Option<String>,
    pub variant: Option<String>,
}
