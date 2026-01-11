use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use chrono::Datelike;

#[cfg(feature = "mistral")]
mod mistral_backend {
    use super::{HoroscopeModelBackend, Reading, ReadingRequest};

    pub struct MistralBackend;

    impl MistralBackend {
        pub fn new() -> Self {
            Self
        }
    }

    impl HoroscopeModelBackend for MistralBackend {
        fn generate(&self, _request: &ReadingRequest) -> Result<Reading, String> {
            Err("Mistral backend not configured yet.".to_string())
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ModelStatus {
    Unloaded,
    Loading { progress: f32 },
    Ready,
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
    fn generate(&self, request: &ReadingRequest) -> Result<Reading, String>;
}

pub struct StubBackend;

impl HoroscopeModelBackend for StubBackend {
    fn generate(&self, request: &ReadingRequest) -> Result<Reading, String> {
        Ok(generate_stub_reading(request))
    }
}

#[derive(Clone)]
pub struct ModelManager {
    status: Arc<Mutex<ModelStatus>>,
    backend: Arc<dyn HoroscopeModelBackend>,
}

impl ModelManager {
    fn new() -> Self {
        #[cfg(feature = "mistral")]
        let backend: Arc<dyn HoroscopeModelBackend> = Arc::new(mistral_backend::MistralBackend::new());
        #[cfg(not(feature = "mistral"))]
        let backend: Arc<dyn HoroscopeModelBackend> = Arc::new(StubBackend);

        Self {
            status: Arc::new(Mutex::new(ModelStatus::Unloaded)),
            backend,
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
}

#[derive(Clone, Deserialize)]
pub struct ReadingRequest {
    pub profile: Profile,
    pub date: String,
    pub prompt: Option<String>,
}

#[tauri::command]
async fn init_model(state: State<'_, ModelManager>, app: AppHandle) -> Result<ModelStatus, String> {
    let status = state.get_status();
    if matches!(status, ModelStatus::Loading { .. } | ModelStatus::Ready) {
        return Ok(status);
    }

    state.set_status(ModelStatus::Loading { progress: 0.1 });
    emit_status(&app, state.get_status());

    let state_clone = state.clone();
    tauri::async_runtime::spawn(async move {
        let steps = [0.25, 0.45, 0.7, 0.9, 1.0];
        for progress in steps {
            std::thread::sleep(Duration::from_millis(360));
            state_clone.set_status(ModelStatus::Loading { progress });
            emit_status(&app, state_clone.get_status());
        }
        state_clone.set_status(ModelStatus::Ready);
        emit_status(&app, state_clone.get_status());
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
    };

    match state.backend.generate(&request) {
        Ok(mut reading) => {
            reading.source = if matches!(state.get_status(), ModelStatus::Ready) {
                "model".to_string()
            } else {
                "stub".to_string()
            };
            Ok(reading)
        }
        Err(error) => Err(error),
    }
}

fn emit_status(app: &AppHandle, status: ModelStatus) {
    let _ = app.emit("model:status", status);
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
        .invoke_handler(tauri::generate_handler![
            init_model,
            model_status,
            generate_horoscope
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
