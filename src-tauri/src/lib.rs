use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri::webview::PageLoadEvent;
use chrono::Datelike;

use async_trait::async_trait;
use mistralrs::{
    GgufModelBuilder,
    Model as MistralModel,
    RequestBuilder,
    SamplingParams as MistralSamplingParams,
    StopTokens,
    TextMessageRole,
};

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

#[derive(Clone, Copy, Debug)]
#[allow(dead_code)]
enum ReadingSource {
    Model,
    Stub,
}

impl ReadingSource {
    fn as_str(self) -> &'static str {
        match self {
            ReadingSource::Model => "model",
            ReadingSource::Stub => "stub",
        }
    }
}

pub struct StubBackend;

#[async_trait]
impl HoroscopeModelBackend for StubBackend {
    async fn generate_json(
        &self,
        request: &ReadingRequest,
        _sampling: &SamplingParams,
    ) -> Result<String, String> {
        serde_json::to_string(&crate::generate_stub_reading(request))
            .map_err(|error| error.to_string())
    }

    async fn generate_dashboard_json(
        &self,
        request: &ReadingRequest,
        _sampling: &SamplingParams,
    ) -> Result<String, String> {
        serde_json::to_string(&crate::generate_stub_dashboard(request))
            .map_err(|error| error.to_string())
    }
}

pub struct EmbeddedBackend {
    model_path: PathBuf,
    model_size_bytes: u64,
    model: Arc<MistralModel>,
}

impl EmbeddedBackend {
    async fn load(model_path: PathBuf) -> Result<Self, String> {
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

#[derive(Clone)]
pub struct ModelManager {
    status: Arc<Mutex<ModelStatus>>,
    backend: Arc<Mutex<Arc<dyn HoroscopeModelBackend>>>,
}

impl ModelManager {
    fn new() -> Self {
        Self {
            status: Arc::new(Mutex::new(ModelStatus::Unloaded)),
            backend: Arc::new(Mutex::new(Arc::new(StubBackend))),
        }
    }

    fn get_status(&self) -> ModelStatus {
        self.status
            .lock()
            .map(|status| status.clone())
            .unwrap_or(ModelStatus::Error {
                message: "Unable to read model status".to_string(),
            })
    }

    fn set_status(&self, status: ModelStatus) {
        if let Ok(mut guard) = self.status.lock() {
            *guard = status;
        }
    }

    fn set_backend(&self, backend: Arc<dyn HoroscopeModelBackend>) {
        if let Ok(mut guard) = self.backend.lock() {
            *guard = backend;
        }
    }

    fn select_backend(&self) -> Result<(Arc<dyn HoroscopeModelBackend>, ReadingSource), String> {
        match self.get_status() {
            ModelStatus::Loaded { .. } => self
                .backend
                .lock()
                .map(|backend| (backend.clone(), ReadingSource::Model))
                .map_err(|_| "Unable to access loaded model backend.".to_string()),
            ModelStatus::Loading { .. } => Err("Model is still loading.".to_string()),
            ModelStatus::Unloaded => Err("Model is not initialized.".to_string()),
            ModelStatus::Error { message } => Err(message),
        }
    }
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

#[tauri::command]
async fn init_model(state: State<'_, ModelManager>, app: AppHandle) -> Result<ModelStatus, String> {
    let status = state.get_status();
    if matches!(
        status,
        ModelStatus::Loading { .. } | ModelStatus::Loaded { .. }
    ) {
        return Ok(status);
    }

    state.set_status(ModelStatus::Loading { progress: 0.1 });
    emit_status(&app, state.get_status());

    let state_clone = state.inner().clone();
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut progress = 0.1_f32;
        let mut interval = tokio::time::interval(Duration::from_millis(180));
        let load_future = async {
            let model_path = resolve_model_path(&app_clone)?;
            EmbeddedBackend::load(model_path).await
        };
        tokio::pin!(load_future);
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    progress = (progress + 0.15).min(0.9);
                    state_clone.set_status(ModelStatus::Loading { progress });
                    emit_status(&app_clone, state_clone.get_status());
                }
                load_result = &mut load_future => {
                    match load_result {
                        Ok(backend) => {
                            let model_size_bytes = backend.model_size_bytes;
                            let model_size_mb = (model_size_bytes as f32) / (1024.0 * 1024.0);
                            let model_path = backend.model_path.display().to_string();
                            state_clone.set_backend(Arc::new(backend));
                            state_clone.set_status(ModelStatus::Loaded {
                                model_path,
                                model_size_mb,
                                model_size_bytes,
                            });
                            emit_status(&app_clone, state_clone.get_status());
                        }
                        Err(message) => {
                            state_clone.set_status(ModelStatus::Error { message });
                            emit_status(&app_clone, state_clone.get_status());
                        }
                    }
                    break;
                }
            }
        }
    }

    Ok(state.get_status())
}

#[tauri::command]
fn model_status(state: State<'_, ModelManager>) -> ModelStatus {
    state.get_status()
}

#[tauri::command]
async fn generate_horoscope(
    state: State<'_, ModelManager>,
    profile: Profile,
    date: String,
    prompt: Option<String>,
) -> Result<Reading, String> {
    let request = ReadingRequest {
        profile,
        date,
        prompt,
        sampling: SamplingParams::default(),
    };

    let (backend, source) = state.select_backend()?;
    let result = backend
        .generate_json(&request, &request.sampling)
        .await
        .and_then(|json| parse_reading_json(json, source));
    match result {
        Ok(reading) => Ok(reading),
        Err(error) => {
            if matches!(source, ReadingSource::Model) {
                eprintln!("Model inference failed, falling back to stub: {}", error);
                Ok(crate::generate_stub_reading(&request))
            } else {
                Err(error)
            }
        }
    }
}

#[tauri::command]
async fn generate_horoscope_stream(
    state: State<'_, ModelManager>,
    app: AppHandle,
    profile: Profile,
    date: String,
    prompt: Option<String>,
    sampling: Option<SamplingParams>,
) -> Result<Reading, String> {
    let request = ReadingRequest {
        profile,
        date,
        prompt,
        sampling: sampling.unwrap_or_default(),
    };

    let (backend, source) = state.select_backend()?;
    emit_stream_event(&app, StreamEvent::Start);
    let result = backend
        .generate_json(&request, &request.sampling)
        .await
        .and_then(|json| parse_reading_json(json, source));
    match result {
        Ok(reading) => {
            stream_message(&app, &reading.message).await;
            emit_stream_event(&app, StreamEvent::End);
            Ok(reading)
        }
        Err(error) => {
            if matches!(source, ReadingSource::Model) {
                eprintln!("Model inference failed, falling back to stub: {}", error);
                let reading = crate::generate_stub_reading(&request);
                stream_message(&app, &reading.message).await;
                emit_stream_event(&app, StreamEvent::End);
                Ok(reading)
            } else {
                emit_stream_event(&app, StreamEvent::End);
                Err(error)
            }
        }
    }
}

#[tauri::command]
async fn generate_dashboard_payload(
    state: State<'_, ModelManager>,
    profile: Profile,
    date: String,
    prompt: Option<String>,
    sampling: Option<SamplingParams>,
) -> Result<String, String> {
    let request = ReadingRequest {
        profile,
        date,
        prompt,
        sampling: sampling.unwrap_or_default(),
    };

    let (backend, source) = state.select_backend()?;
    match backend
        .generate_dashboard_json(&request, &request.sampling)
        .await
    {
        Ok(json) => Ok(json),
        Err(error) => {
            if matches!(source, ReadingSource::Model) {
                eprintln!("Model inference failed while generating dashboard JSON: {}", error);
                let fallback = serde_json::to_string(&crate::generate_stub_dashboard(&request))
                    .map_err(|serialization| serialization.to_string())?;
                Ok(fallback)
            } else {
                Err(error)
            }
        }
    }
}

fn emit_status(app: &AppHandle, status: ModelStatus) {
    let _ = app.emit("model:status", status);
}

fn emit_stream_event(app: &AppHandle, event: StreamEvent) {
    let _ = app.emit("reading:stream", event);
}

async fn stream_message(app: &AppHandle, message: &str) {
    let chunk_size = 28;
    for chunk in message.as_bytes().chunks(chunk_size) {
        if let Ok(chunk_str) = std::str::from_utf8(chunk) {
            emit_stream_event(
                app,
                StreamEvent::Chunk {
                    chunk: chunk_str.to_string(),
                },
            );
        }
        tokio::time::sleep(Duration::from_millis(40)).await;
    }
}

fn parse_reading_json(json: String, source: ReadingSource) -> Result<Reading, String> {
    let mut reading: Reading = serde_json::from_str(&json).map_err(|error| error.to_string())?;
    reading.source = source.as_str().to_string();
    Ok(reading)
}

fn resolve_model_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<(String, PathBuf)> = Vec::new();
    if let Ok(override_path) = std::env::var("VEIL_MODEL_PATH") {
        candidates.push(("VEIL_MODEL_PATH".to_string(), PathBuf::from(override_path)));
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push((
            "resource_dir".to_string(),
            resource_dir.join("veil.gguf"),
        ));
        candidates.push((
            "resource_dir/resources".to_string(),
            resource_dir.join("resources/veil.gguf"),
        ));
    }
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        candidates.push((
            "app_data_dir".to_string(),
            app_data_dir.join("veil.gguf"),
        ));
    }
    #[cfg(any(debug_assertions, dev))]
    {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        if let Some(project_dir) = manifest_dir.parent() {
            candidates.push((
                "project/resources".to_string(),
                project_dir.join("resources/veil.gguf"),
            ));
        }
        candidates.push((
            "src-tauri/resources".to_string(),
            manifest_dir.join("resources/veil.gguf"),
        ));
    }

    for (_, candidate) in &candidates {
        if candidate.exists() {
            if candidate.is_file() {
                return Ok(candidate.clone());
            }
            return Err(format!(
                "Model path {} exists but is not a file.",
                candidate.display()
            ));
        }
    }

    let searched = candidates
        .iter()
        .map(|(label, path)| {
            let status = match std::fs::metadata(path) {
                Ok(metadata) => {
                    if metadata.is_file() {
                        format!("file, {} bytes", metadata.len())
                    } else {
                        "exists, not a file".to_string()
                    }
                }
                Err(_) => "missing".to_string(),
            };
            format!("{}: {} ({})", label, path.display(), status)
        })
        .collect::<Vec<_>>()
        .join(", ");
    Err(format!(
        "Model file veil.gguf not found. Looked in: {}.",
        searched
    ))
}

fn generate_stub_reading(request: &ReadingRequest) -> Reading {
    let sign = zodiac_sign(&request.profile.birthdate);
    let seed = seeded_hash(&format!(
        "{}-{}-{}-{}-{}",
        request.profile.name,
        request.date,
        sign,
        request.profile.mood,
        request.profile.personality
    ));
    let mut rng = SeededRng::new(seed);

    let titles = [
        "The hush before a bright idea",
        "Soft focus, clear intention",
        "A horizon you can trust",
        "The spark beneath stillness",
        "A graceful return to center",
    ];
    let openings = vec![
        format!(
            "Today opens with a {} current that invites gentler choices.",
            request.profile.mood.to_lowercase()
        ),
        format!(
            "The day moves at a {} pace, offering room to breathe.",
            request.profile.mood.to_lowercase()
        ),
        format!(
            "You may notice a {} undertone guiding your timing.",
            request.profile.mood.to_lowercase()
        ),
    ];
    let middles = vec![
        format!(
            "As a {}, you naturally notice patterns others miss, so trust what quietly repeats.",
            request.profile.personality
        ),
        format!(
            "Your {} instincts highlight what is worth protecting and what can soften.",
            request.profile.personality.to_lowercase()
        ),
        format!(
            "The {} in you is ready to translate intuition into a simple next step.",
            request.profile.personality.to_lowercase()
        ),
    ];
    let closers = [
        "Let small rituals ground you, and remember that clarity arrives in layers, not lightning bolts.",
        "If you pause before responding, the right phrasing will rise on its own.",
        "Choose one gentle action that honors your energy, and let that be enough.",
    ];

    let message = format!(
        "{} {} {}",
        pick_string(&mut rng, &openings),
        pick_string(&mut rng, &middles),
        pick(&mut rng, &closers)
    );

    let mut themes = vec![
        "Quiet confidence",
        "Meaningful timing",
        "Boundaries with kindness",
        "Creative listening",
        "Soft courage",
        "Steady focus",
    ];
    shuffle(&mut rng, &mut themes);

    Reading {
        date: request.date.clone(),
        sign,
        title: pick(&mut rng, &titles).to_string(),
        message,
        themes: [
            themes[0].to_string(),
            themes[1].to_string(),
            themes[2].to_string(),
        ],
        affirmation: pick(
            &mut rng,
            &[
                "I meet today with grounded curiosity.",
                "I can move gently and still be powerful.",
                "My inner compass grows clearer with every breath.",
                "I honor what I feel and choose what I need.",
            ],
        )
        .to_string(),
        lucky_color: pick(
            &mut rng,
            &[
                "Moonlit Indigo",
                "Starlight Silver",
                "Luminous Lavender",
                "Sea-glass Teal",
                "Amber Mist",
            ],
        )
        .to_string(),
        lucky_number: (rng.next() * 9.0).floor() as u8 + 1,
        created_at: chrono::Utc::now().to_rfc3339(),
        source: "stub".to_string(),
    }
}

fn generate_stub_dashboard(request: &ReadingRequest) -> serde_json::Value {
    let sign = zodiac_sign(&request.profile.birthdate);
    let seed = seeded_hash(&format!(
        "{}-{}-{}-{}-{}",
        request.profile.name,
        request.date,
        sign,
        request.profile.mood,
        request.profile.personality
    ));
    let mut rng = SeededRng::new(seed);

    let title = pick(
        &mut rng,
        &[
            "Soft focus, clear intention",
            "The hush before a bright idea",
            "A horizon you can trust",
            "The spark beneath stillness",
            "A graceful return to center",
        ],
    );
    let openings = vec![
        format!(
            "The day opens with a {} current that invites gentler choices.",
            request.profile.mood.to_lowercase()
        ),
        format!(
            "A {} undertone guides your timing and attention.",
            request.profile.mood.to_lowercase()
        ),
        format!(
            "You move through a {} rhythm that rewards patience.",
            request.profile.mood.to_lowercase()
        ),
    ];
    let middles = vec![
        format!(
            "As {}, your {} nature notices subtle shifts first.",
            sign,
            request.profile.personality.to_lowercase()
        ),
        format!(
            "Your {} instincts highlight what wants to soften.",
            request.profile.personality.to_lowercase()
        ),
        format!(
            "The {} in you translates intuition into one clear step.",
            request.profile.personality.to_lowercase()
        ),
    ];
    let closers = vec![
        "Let small rituals ground you, and let clarity arrive in layers.".to_string(),
        "Pause before replying and your best phrasing will surface.".to_string(),
        "Choose one gentle action that honors your energy, and let that be enough.".to_string(),
    ];
    let message = format!(
        "{} {} {}",
        pick_string(&mut rng, &openings),
        pick_string(&mut rng, &middles),
        pick_string(&mut rng, &closers)
    );

    let date_label = chrono::NaiveDate::parse_from_str(&request.date, "%Y-%m-%d")
        .map(|date| date.format("%A, %B %-d").to_string())
        .unwrap_or_else(|_| request.date.clone());

    json!({
        "meta": {
            "dateISO": request.date.clone(),
            "localeDateLabel": date_label,
            "generatedAtISO": chrono::Utc::now().to_rfc3339(),
            "sign": sign,
            "name": request.profile.name.clone()
        },
        "tabs": {
            "activeDefault": "today"
        },
        "today": {
            "headline": title,
            "subhead": message,
            "theme": pick(&mut rng, &["Clarity", "Patience", "Warmth", "Alignment", "Ease"]),
            "energyScore": (rng.next() * 45.0).floor() as u8 + 55,
            "bestHours": [
                { "label": "Morning", "start": "9:00 AM", "end": "11:00 AM" },
                { "label": "Evening", "start": "5:00 PM", "end": "7:00 PM" }
            ],
            "ratings": {
                "love": (rng.next() * 3.0).floor() as u8 + 3,
                "work": (rng.next() * 3.0).floor() as u8 + 3,
                "money": (rng.next() * 3.0).floor() as u8 + 2,
                "health": (rng.next() * 3.0).floor() as u8 + 3
            },
            "lucky": {
                "color": pick(&mut rng, &["Gold", "Moonlit Indigo", "Soft Lavender", "Sea-glass Teal"]),
                "number": (rng.next() * 9.0).floor() as u8 + 1,
                "symbol": pick(&mut rng, &["★", "☾", "✦"])
            },
            "doDont": {
                "do": "Trust your instincts and keep plans simple.",
                "dont": "Overshare or rush to fill quiet moments."
            },
            "sections": [
                { "title": "Focus", "body": "Pick one clear priority and let the rest soften." },
                { "title": "Relationships", "body": "Lead with warmth and give others space to respond." },
                { "title": "Action", "body": "Take one grounded step that supports your long view." },
                { "title": "Reflection", "body": "Notice what feels steady and keep returning to it." }
            ]
        },
        "cosmicWeather": {
            "moon": {
                "phase": pick(&mut rng, &["First Quarter", "Waxing Crescent", "Full Moon", "New Moon"]),
                "sign": pick(&mut rng, &["Cancer", "Libra", "Scorpio", "Taurus"])
            },
            "transits": [
                {
                    "title": "Mercury review cycle",
                    "tone": "neutral",
                    "meaning": "Double-check details before committing."
                },
                {
                    "title": "Venus harmony",
                    "tone": "soft",
                    "meaning": "Gentle conversations land with ease."
                }
            ],
            "affectsToday": "Emotional tides rise and fall; choose calm responses."
        },
        "compatibility": {
            "bestFlowWith": ["Aries", "Gemini"],
            "handleGentlyWith": ["Taurus"],
            "tips": {
                "conflict": "Pause before replying to keep things kind.",
                "affection": "Playful honesty keeps the mood light."
            }
        },
        "journalRitual": {
            "prompt": "What feels most important to protect today?",
            "starters": ["I feel…", "I need…", "I'm avoiding…"],
            "mantra": "I move with grace and clear intention.",
            "ritual": "Light a candle and name one priority out loud.",
            "bestDayForDecisions": {
                "dayLabel": "Thursday",
                "reason": "Clarity peaks in the afternoon."
            }
        },
        "week": {
            "arc": {
                "start": "Settle into a calm, focused rhythm.",
                "midweek": "Tune inward before making changes.",
                "weekend": "Conversations flow and ease returns."
            },
            "keyOpportunity": "Strengthen a bond through simple honesty.",
            "keyCaution": "Avoid overcommitting before you feel ready.",
            "bestDayFor": {
                "decisions": "Thursday",
                "conversations": "Wednesday",
                "rest": "Sunday"
            }
        },
        "month": {
            "theme": "Clarity through gentle structure.",
            "keyDates": [
                { "dateLabel": "Jan 9–10", "title": "New Moon", "note": "Set intentions around focus." },
                { "dateLabel": "Jan 17", "title": "Personal reset", "note": "Simplify a lingering task." },
                { "dateLabel": "Jan 25", "title": "Full Moon", "note": "Release what feels heavy." }
            ],
            "newMoon": { "dateLabel": "Jan 9–10", "intention": "Commit to one steady practice." },
            "fullMoon": { "dateLabel": "Jan 25", "release": "Let go of scattered priorities." },
            "oneThing": "If you do one thing, choose the gentlest next step."
        },
        "year": {
            "headline": "A year to trust your timing and refine your craft.",
            "quarters": [
                { "label": "Q1", "focus": "Grounded beginnings and clearing space." },
                { "label": "Q2", "focus": "Momentum builds through collaboration." },
                { "label": "Q3", "focus": "Visibility grows with steady effort." },
                { "label": "Q4", "focus": "Integration and graceful completion." }
            ],
            "powerMonths": ["March", "July"],
            "challengeMonth": { "month": "October", "guidance": "Slow down and streamline." }
        }
    })
}

fn zodiac_sign(date: &str) -> String {
    let parsed = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d");
    if let Ok(date) = parsed {
        let month = date.month();
        let day = date.day();
        let sign = if (month == 3 && day >= 21) || (month == 4 && day <= 19) {
            "Aries"
        } else if (month == 4 && day >= 20) || (month == 5 && day <= 20) {
            "Taurus"
        } else if (month == 5 && day >= 21) || (month == 6 && day <= 20) {
            "Gemini"
        } else if (month == 6 && day >= 21) || (month == 7 && day <= 22) {
            "Cancer"
        } else if (month == 7 && day >= 23) || (month == 8 && day <= 22) {
            "Leo"
        } else if (month == 8 && day >= 23) || (month == 9 && day <= 22) {
            "Virgo"
        } else if (month == 9 && day >= 23) || (month == 10 && day <= 22) {
            "Libra"
        } else if (month == 10 && day >= 23) || (month == 11 && day <= 21) {
            "Scorpio"
        } else if (month == 11 && day >= 22) || (month == 12 && day <= 21) {
            "Sagittarius"
        } else if (month == 12 && day >= 22) || (month == 1 && day <= 19) {
            "Capricorn"
        } else if (month == 1 && day >= 20) || (month == 2 && day <= 18) {
            "Aquarius"
        } else {
            "Pisces"
        };
        return sign.to_string();
    }
    "Unknown".to_string()
}

fn seeded_hash(value: &str) -> u32 {
    let mut hash: u32 = 2166136261;
    for byte in value.bytes() {
        hash ^= byte as u32;
        hash = hash
            .wrapping_add(hash << 1)
            .wrapping_add(hash << 4)
            .wrapping_add(hash << 7)
            .wrapping_add(hash << 8)
            .wrapping_add(hash << 24);
    }
    hash
}

struct SeededRng {
    state: u32,
}

impl SeededRng {
    fn new(seed: u32) -> Self {
        Self { state: seed ^ 0x9e3779b9 }
    }

    fn next(&mut self) -> f32 {
        self.state ^= self.state << 13;
        self.state ^= self.state >> 17;
        self.state ^= self.state << 5;
        (self.state % 10_000) as f32 / 10_000.0
    }
}

fn pick<'a>(rng: &mut SeededRng, values: &'a [&str]) -> &'a str {
    let index = (rng.next() * values.len() as f32).floor() as usize;
    values[index % values.len()]
}

fn pick_string(rng: &mut SeededRng, values: &[String]) -> String {
    let index = (rng.next() * values.len() as f32).floor() as usize;
    values[index % values.len()].clone()
}

fn shuffle(rng: &mut SeededRng, values: &mut Vec<&str>) {
    let len = values.len();
    for i in (1..len).rev() {
        let j = (rng.next() * (i as f32 + 1.0)).floor() as usize;
        values.swap(i, j.min(i));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ModelManager::new())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(splash_window) = app.get_webview_window("splashscreen") {
                let _ = splash_window.show();
            }
            Ok(())
        })
        .on_page_load(|webview, payload| {
            if webview.label() != "main" {
                return;
            }
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let app_handle = webview.window().app_handle().clone();
            if let Some(splash_window) = app_handle.get_webview_window("splashscreen") {
                let _ = splash_window.close();
            }
            if let Some(main_window) = app_handle.get_webview_window("main") {
                let _ = main_window.show();
                let _ = main_window.set_focus();
            }
        })
        .invoke_handler(tauri::generate_handler![
            close_splashscreen,
            init_model,
            model_status,
            generate_horoscope,
            generate_horoscope_stream,
            generate_dashboard_payload
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn close_splashscreen(app: tauri::AppHandle) {
    if let Some(splash_window) = app.get_webview_window("splashscreen") {
        let _ = splash_window.close();
    }
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.show();
        let _ = main_window.set_focus();
    }
}
