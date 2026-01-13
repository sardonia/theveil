use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let resources_dir = manifest_dir.join("resources");
    let resource_path = resources_dir.join("veil.gguf");

    if !resource_path.exists() {
        if let Ok(override_path) = env::var("VEIL_MODEL_PATH") {
            let override_path = PathBuf::from(override_path);
            if override_path.exists() {
                let _ = fs::create_dir_all(&resources_dir);
                let _ = fs::copy(&override_path, &resource_path);
            }
        }
    }

    tauri_build::build()
}
