use std::path::PathBuf;
use std::sync::Arc;

use async_trait::async_trait;
use mistralrs::{
    GgufModelBuilder,
    Model as MistralModel,
    RequestBuilder,
    SamplingParams as MistralSamplingParams,
    StopTokens,
    TextMessageRole,
};

use crate::stub::{generate_stub_dashboard, generate_stub_reading};
use crate::types::{ReadingRequest, SamplingParams};

#[cfg(feature = "mistral")]
mod mistral_backend {
    use super::{HoroscopeModelBackend, ReadingRequest, SamplingParams};
    use async_trait::async_trait;

    pub struct MistralBackend;

    impl MistralBackend {
        pub fn new() -> Self {
            Self
        }
    }

    #[async_trait]
    impl HoroscopeModelBackend for MistralBackend {
        async fn generate_json(
            &self,
            _request: &ReadingRequest,
            _sampling: &SamplingParams,
        ) -> Result<String, String> {
            Err("Mistral backend not configured yet.".to_string())
        }

        async fn generate_dashboard_json(
            &self,
            _request: &ReadingRequest,
            _sampling: &SamplingParams,
        ) -> Result<String, String> {
            Err("Mistral backend not configured yet.".to_string())
        }
    }
}

#[async_trait]
pub trait HoroscopeModelBackend: Send + Sync {
    async fn generate_json(
        &self,
        request: &ReadingRequest,
        sampling: &SamplingParams,
    ) -> Result<String, String>;

    async fn generate_dashboard_json(
        &self,
        request: &ReadingRequest,
        sampling: &SamplingParams,
    ) -> Result<String, String>;
}

pub struct StubBackend;

#[async_trait]
impl HoroscopeModelBackend for StubBackend {
    async fn generate_json(
        &self,
        request: &ReadingRequest,
        _sampling: &SamplingParams,
    ) -> Result<String, String> {
        serde_json::to_string(&generate_stub_reading(request)).map_err(|error| error.to_string())
    }

    async fn generate_dashboard_json(
        &self,
        request: &ReadingRequest,
        _sampling: &SamplingParams,
    ) -> Result<String, String> {
        serde_json::to_string(&generate_stub_dashboard(request))
            .map_err(|error| error.to_string())
    }
}

pub(crate) struct EmbeddedBackend {
    pub(crate) model_path: PathBuf,
    pub(crate) model_size_bytes: u64,
    model: Arc<MistralModel>,
}

impl EmbeddedBackend {
    pub(crate) async fn load(model_path: PathBuf) -> Result<Self, String> {
        let file = std::fs::File::open(&model_path).map_err(|error| match error.kind() {
            std::io::ErrorKind::NotFound => {
                format!("Model file {} is missing.", model_path.display())
            }
            std::io::ErrorKind::PermissionDenied => format!(
                "Model file {} is not readable (permission denied).",
                model_path.display()
            ),
            _ => format!(
                "Failed to open model at {}: {}",
                model_path.display(),
                error
            ),
        })?;
        let metadata = file.metadata().map_err(|error| {
            format!(
                "Failed to read model metadata at {}: {}",
                model_path.display(),
                error
            )
        })?;

        let model_dir = model_path
            .parent()
            .ok_or_else(|| format!("Model path {} has no parent directory.", model_path.display()))?;
        let model_file = model_path
            .file_name()
            .ok_or_else(|| format!("Model path {} has no filename.", model_path.display()))?
            .to_string_lossy()
            .to_string();
        let model_dir_str = model_dir.to_string_lossy().to_string();

        let force_cpu = std::env::var("VEIL_MISTRALRS_FORCE_CPU").ok().as_deref() == Some("1");
        let enable_logging = std::env::var("VEIL_MISTRALRS_LOGGING").ok().as_deref() == Some("1");
        let tok_model_id = std::env::var("VEIL_MISTRALRS_TOK_MODEL_ID").ok();
        let chat_template = std::env::var("VEIL_MISTRALRS_CHAT_TEMPLATE").ok();

        let build_with = |mut builder: GgufModelBuilder| {
            if force_cpu {
                builder = builder.with_force_cpu();
            }
            if enable_logging {
                builder = builder.with_logging();
            }
            if let Some(tok_model_id) = tok_model_id.clone() {
                if !tok_model_id.trim().is_empty() {
                    builder = builder.with_tok_model_id(tok_model_id);
                }
            }
            if let Some(chat_template) = chat_template.clone() {
                if !chat_template.trim().is_empty() {
                    builder = builder.with_chat_template(chat_template);
                }
            }
            builder
        };

        let attempt_primary = build_with(GgufModelBuilder::new(model_dir_str.clone(), vec![model_file.clone()]))
            .build()
            .await;

        let model = match attempt_primary {
            Ok(model) => model,
            Err(primary_error) => {
                // Some GGUF pipelines accept a fully-qualified path in the `files` list.
                // When the standard <dir> + <filename> load fails, try again with the full path.
                let full_path = model_path.to_string_lossy().to_string();
                let attempt_full_path = build_with(GgufModelBuilder::new("local".to_string(), vec![full_path]))
                    .build()
                    .await;
                match attempt_full_path {
                    Ok(model) => model,
                    Err(second_error) => {
                        return Err(format!(
                            "Failed to load GGUF model. Primary error: {}. Full-path fallback error: {}",
                            primary_error, second_error
                        ));
                    }
                }
            }
        };
        Ok(Self {
            model_path,
            model_size_bytes: metadata.len(),
            model: Arc::new(model),
        })
    }
}

async fn send_chat_request_blocking(
    model: Arc<MistralModel>,
    request_builder: RequestBuilder,
) -> Result<String, String> {
    let started_at = std::time::Instant::now();
    let join = tauri::async_runtime::spawn_blocking(move || {
        let result = tauri::async_runtime::block_on(async {
            model
                .send_chat_request(request_builder)
                .await
                .map_err(|error| error.to_string())
        });
        result
    });
    let response = join
        .await
        .map_err(|error| format!("Model task join failed: {}", error))??;
    let elapsed_ms = started_at.elapsed().as_millis();
    eprintln!("[Veil] model:invoke:complete durationMs={}", elapsed_ms);
    let content = response
        .choices
        .get(0)
        .and_then(|choice| choice.message.content.clone())
        .ok_or_else(|| "Model returned empty content.".to_string())?;
    Ok(content)
}

fn to_mistral_sampling_params(params: &SamplingParams) -> MistralSamplingParams {
    let stop_toks = if params.stop.is_empty() {
        None
    } else {
        Some(StopTokens::Seqs(params.stop.clone()))
    };

    MistralSamplingParams {
        temperature: Some(params.temperature as f64),
        top_k: Some(params.top_k as usize),
        top_p: Some(params.top_p as f64),
        min_p: None,
        top_n_logprobs: 0,
        frequency_penalty: None,
        presence_penalty: None,
        repetition_penalty: Some(params.repeat_penalty),
        stop_toks,
        max_len: Some(params.max_tokens as usize),
        logits_bias: None,
        n_choices: 1,
        dry_params: None,
    }
}

fn build_fallback_prompt(request: &ReadingRequest) -> String {
    format!(
        "You are an offline horoscope assistant. Output JSON only.\nName: {}\nBirthdate: {}\nMood: {}\nPersonality: {}\nDate: {}\nReturn a premium, soothing horoscope dashboard JSON.",
        request.profile.name,
        request.profile.birthdate,
        request.profile.mood,
        request.profile.personality,
        request.date
    )
}

// A small, high-leverage system prompt for chat-tuned GGUF models.
// We keep it short so it doesn't eat context, but strong enough to enforce
// strict JSON and the desired "Veil" voice.
const VEIL_SYSTEM_PROMPT: &str = "You are Veil, a warm feminine astrologer with a loving aura. You are an expert who writes premium, modern astrology. Always follow the user's schema and output STRICT JSON only (double-quoted keys/strings, no trailing commas, no markdown). End output immediately after the final '}' character.";

#[async_trait]
impl HoroscopeModelBackend for EmbeddedBackend {
    async fn generate_json(
        &self,
        request: &ReadingRequest,
        sampling: &SamplingParams,
    ) -> Result<String, String> {
        let prompt = request
            .prompt
            .clone()
            .unwrap_or_else(|| build_fallback_prompt(request));

        let mistral_sampling = to_mistral_sampling_params(sampling);
        let request_builder = RequestBuilder::new()
            .add_message(TextMessageRole::System, VEIL_SYSTEM_PROMPT.to_string())
            .add_message(TextMessageRole::User, prompt)
            .set_sampling(mistral_sampling);

        send_chat_request_blocking(self.model.clone(), request_builder).await
    }

    async fn generate_dashboard_json(
        &self,
        request: &ReadingRequest,
        sampling: &SamplingParams,
    ) -> Result<String, String> {
        // Prefer the prompt built by the TypeScript pipeline, which includes
        // strict schema and UI style rules.
        let prompt = request
            .prompt
            .clone()
            .unwrap_or_else(|| build_fallback_prompt(request));

        let mistral_sampling = to_mistral_sampling_params(sampling);
        let request_builder = RequestBuilder::new()
            .add_message(TextMessageRole::System, VEIL_SYSTEM_PROMPT.to_string())
            .add_message(TextMessageRole::User, prompt)
            .set_sampling(mistral_sampling);

        send_chat_request_blocking(self.model.clone(), request_builder).await
    }
}
