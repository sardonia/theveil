use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let project_dir = manifest_dir
        .parent()
        .expect("CARGO_MANIFEST_DIR should have a parent");
    let resources_dir = project_dir.join("resources");
    let resource_path = resources_dir.join("veil.gguf");
    let manifest_resources_dir = manifest_dir.join("resources");
    let manifest_resource_path = manifest_resources_dir.join("veil.gguf");

    if !manifest_resource_path.exists() {
        if resource_path.exists() {
            let _ = fs::create_dir_all(&manifest_resources_dir);
            let _ = fs::copy(&resource_path, &manifest_resource_path);
        } else if let Ok(override_path) = env::var("VEIL_MODEL_PATH") {
            let override_path = PathBuf::from(override_path);
            if override_path.exists() {
                let _ = fs::create_dir_all(&manifest_resources_dir);
                let _ = fs::copy(&override_path, &manifest_resource_path);
            }
        }
    }

    if !resource_path.exists() && manifest_resource_path.exists() {
        let _ = fs::create_dir_all(&resources_dir);
        let _ = fs::copy(&manifest_resource_path, &resource_path);
    }

    tauri_build::build()
}
