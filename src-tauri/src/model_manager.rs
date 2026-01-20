use std::sync::{Arc, Mutex};

use crate::backends::{HoroscopeModelBackend, StubBackend};
use crate::types::ModelStatus;

#[derive(Clone, Copy, Debug)]
#[allow(dead_code)]
pub(crate) enum ReadingSource {
    Model,
    Stub,
}

impl ReadingSource {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            ReadingSource::Model => "model",
            ReadingSource::Stub => "stub",
        }
    }
}

#[derive(Clone)]
pub struct ModelManager {
    status: Arc<Mutex<ModelStatus>>,
    backend: Arc<Mutex<Arc<dyn HoroscopeModelBackend>>>,
}

impl ModelManager {
    pub fn new() -> Self {
        Self {
            status: Arc::new(Mutex::new(ModelStatus::Unloaded)),
            backend: Arc::new(Mutex::new(Arc::new(StubBackend))),
        }
    }

    pub(crate) fn get_status(&self) -> ModelStatus {
        self.status
            .lock()
            .map(|status| status.clone())
            .unwrap_or(ModelStatus::Error {
                message: "Unable to read model status".to_string(),
            })
    }

    pub(crate) fn set_status(&self, status: ModelStatus) {
        if let Ok(mut guard) = self.status.lock() {
            *guard = status;
        }
    }

    pub(crate) fn set_backend(&self, backend: Arc<dyn HoroscopeModelBackend>) {
        if let Ok(mut guard) = self.backend.lock() {
            *guard = backend;
        }
    }

    pub(crate) fn select_backend(&self) -> Result<(Arc<dyn HoroscopeModelBackend>, ReadingSource), String> {
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
