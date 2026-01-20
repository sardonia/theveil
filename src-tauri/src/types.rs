use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ModelStatus {
    Unloaded,
    Loading { progress: f32 },
    Loaded {
        #[serde(rename = "modelPath")]
        model_path: String,
        #[serde(rename = "modelSizeMb")]
        model_size_mb: f32,
        #[serde(rename = "modelSizeBytes")]
        model_size_bytes: u64,
    },
    Error { message: String },
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Profile {
    pub name: String,
    pub birthdate: String,
    pub mood: String,
    pub personality: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Reading {
    pub date: String,
    pub sign: String,
    pub title: String,
    pub message: String,
    pub themes: [String; 3],
    pub affirmation: String,
    pub lucky_color: String,
    pub lucky_number: u8,
    pub created_at: String,
    pub source: String,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SamplingParams {
    pub temperature: f32,
    pub top_p: f32,
    pub top_k: u32,
    pub repeat_penalty: f32,
    pub max_tokens: u32,
    pub seed: Option<u32>,
    pub stop: Vec<String>,
}

impl Default for SamplingParams {
    fn default() -> Self {
        Self {
            temperature: 0.45,
            top_p: 0.9,
            top_k: 50,
            repeat_penalty: 1.1,
            // Dashboard JSON is large; low token limits frequently truncate output.
            max_tokens: 3600,
            seed: None,
            stop: vec![],
        }
    }
}

#[derive(Clone, Deserialize)]
pub struct ReadingRequest {
    pub profile: Profile,
    pub date: String,
    pub prompt: Option<String>,
    #[serde(default)]
    pub sampling: SamplingParams,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum StreamEvent {
    Start,
    Chunk { chunk: String },
    End,
}
