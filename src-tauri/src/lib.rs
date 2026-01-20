mod backends;
mod commands;
mod model_manager;
mod stub;
mod types;

use tauri::webview::PageLoadEvent;
use tauri::Manager;

use crate::model_manager::ModelManager;

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
            commands::close_splashscreen,
            commands::init_model,
            commands::model_status,
            commands::generate_horoscope,
            commands::generate_horoscope_stream,
            commands::generate_dashboard_payload
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
