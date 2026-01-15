use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use chrono::Datelike;

#[cfg(feature = "mistral")]
mod mistral_backend {
    use super::{HoroscopeModelBackend, ReadingRequest, SamplingParams};

    pub struct MistralBackend;

    impl MistralBackend {
        pub fn new() -> Self {
            Self
        }
    }

    impl HoroscopeModelBackend for MistralBackend {
        fn generate_json(
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

pub trait HoroscopeModelBackend: Send + Sync {
    fn generate_json(
        &self,
        request: &ReadingRequest,
        sampling: &SamplingParams,
    ) -> Result<String, String>;
}

#[derive(Clone, Copy, Debug)]
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

impl HoroscopeModelBackend for StubBackend {
    fn generate_json(
        &self,
        request: &ReadingRequest,
        _sampling: &SamplingParams,
    ) -> Result<String, String> {
        serde_json::to_string(&crate::generate_stub_reading(request))
            .map_err(|error| error.to_string())
    }
}

pub struct EmbeddedBackend {
    model_path: PathBuf,
    model_size_bytes: u64,
}

impl EmbeddedBackend {
    fn new(model_path: PathBuf) -> Result<Self, String> {
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
        Ok(Self {
            model_path,
            model_size_bytes: metadata.len(),
        })
    }
}

impl HoroscopeModelBackend for EmbeddedBackend {
    fn generate_json(
        &self,
        request: &ReadingRequest,
        sampling: &SamplingParams,
    ) -> Result<String, String> {
        let _ = (&self.model_path, sampling);
        serde_json::to_string(&crate::generate_stub_reading(request))
            .map_err(|error| error.to_string())
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

    fn select_backend(&self) -> (Arc<dyn HoroscopeModelBackend>, ReadingSource) {
        if matches!(self.get_status(), ModelStatus::Loaded { .. }) {
            if let Ok(backend) = self.backend.lock() {
                return (backend.clone(), ReadingSource::Model);
            }
        }
        (Arc::new(StubBackend), ReadingSource::Stub)
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
            temperature: 0.7,
            top_p: 0.9,
            top_k: 40,
            repeat_penalty: 1.12,
            max_tokens: 320,
            seed: None,
            stop: vec!["\n\n".to_string(), "```".to_string()],
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
    tauri::async_runtime::spawn_blocking(move || {
        let steps = [0.25, 0.5, 0.75, 0.9];
        for progress in steps {
            std::thread::sleep(Duration::from_millis(180));
            state_clone.set_status(ModelStatus::Loading { progress });
            emit_status(&app_clone, state_clone.get_status());
        }

        match resolve_model_path(&app_clone)
            .and_then(|model_path| EmbeddedBackend::new(model_path))
        {
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
    });

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

    let (backend, source) = state.select_backend();
    let result = backend
        .generate_json(&request, &request.sampling)
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

    let (backend, source) = state.select_backend();
    emit_stream_event(&app, StreamEvent::Start);
    let result = backend
        .generate_json(&request, &request.sampling)
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

fn emit_status(app: &AppHandle, status: ModelStatus) {
    let _ = app.emit("model:status", status);
}

fn emit_stream_event(app: &AppHandle, event: StreamEvent) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("reading:stream", event.clone());
    }
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
            let splash = app.get_webview_window("splashscreen");
            let main = app.get_webview_window("main");

            if let Some(splash_window) = &splash {
                let _ = splash_window.show();
            }

            if let (Some(splash_window), Some(main_window)) = (splash, main) {
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    let _ = splash_window.close();
                    let _ = main_window.show();
                    let _ = main_window.set_focus();
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            init_model,
            model_status,
            generate_horoscope,
            generate_horoscope_stream
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
