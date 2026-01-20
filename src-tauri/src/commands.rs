use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::backends::EmbeddedBackend;
use crate::model_manager::{ModelManager, ReadingSource};
use crate::stub::{generate_stub_dashboard, generate_stub_reading};
use crate::types::{ModelStatus, Profile, Reading, ReadingRequest, SamplingParams, StreamEvent};

#[tauri::command]
pub async fn init_model(state: State<'_, ModelManager>, app: AppHandle) -> Result<ModelStatus, String> {
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
    tauri::async_runtime::spawn(run_model_load(state_clone, app_clone));

    Ok(state.get_status())
}

async fn run_model_load(state: ModelManager, app: AppHandle) {
    let mut progress = 0.1_f32;
    let mut interval = tokio::time::interval(Duration::from_millis(180));
    let app_for_load = app.clone();
    let mut load_handle = tauri::async_runtime::spawn_blocking(move || {
        tauri::async_runtime::block_on(async {
            let model_path = resolve_model_path(&app_for_load)?;
            EmbeddedBackend::load(model_path).await
        })
    });

    let load_result = loop {
        tokio::select! {
            _ = interval.tick() => {
                if progress < 0.9 {
                    let next_progress = (progress + 0.15).min(0.9);
                    if (next_progress - progress).abs() > f32::EPSILON {
                        progress = next_progress;
                        state.set_status(ModelStatus::Loading { progress });
                        emit_status(&app, state.get_status());
                    }
                }
            }
            result = &mut load_handle => {
                break result;
            }
        }
    };

    match load_result {
        Ok(Ok(backend)) => {
            let model_size_bytes = backend.model_size_bytes;
            let model_size_mb = (model_size_bytes as f32) / (1024.0 * 1024.0);
            let model_path = backend.model_path.display().to_string();
            state.set_backend(Arc::new(backend));
            state.set_status(ModelStatus::Loaded {
                model_path,
                model_size_mb,
                model_size_bytes,
            });
            emit_status(&app, state.get_status());
        }
        Ok(Err(message)) => {
            state.set_status(ModelStatus::Error { message });
            emit_status(&app, state.get_status());
        }
        Err(error) => {
            let message = format!("Model load task failed: {}", error);
            state.set_status(ModelStatus::Error { message });
            emit_status(&app, state.get_status());
        }
    }
}

#[tauri::command]
pub fn model_status(state: State<'_, ModelManager>) -> ModelStatus {
    state.get_status()
}

#[tauri::command]
pub async fn generate_horoscope(
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
                Ok(generate_stub_reading(&request))
            } else {
                Err(error)
            }
        }
    }
}

#[tauri::command]
pub async fn generate_horoscope_stream(
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
                let reading = generate_stub_reading(&request);
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
pub async fn generate_dashboard_payload(
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
                let fallback = serde_json::to_string(&generate_stub_dashboard(&request))
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

#[tauri::command]
pub fn close_splashscreen(app: tauri::AppHandle) {
    if let Some(splash_window) = app.get_webview_window("splashscreen") {
        let _ = splash_window.close();
    }
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.show();
        let _ = main_window.set_focus();
    }
}
