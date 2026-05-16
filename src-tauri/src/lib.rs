mod commands;
mod migrations;

use commands::{idle, keyring};
use std::sync::{Arc, Mutex};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_migrations = migrations::get_migrations();
    let idle_monitor_state = Arc::new(Mutex::new(idle::IdleMonitorConfig::default()));

    tauri::Builder::default()
        .manage(idle_monitor_state.clone())
        .setup(move |app| {
            idle::spawn_idle_monitor(app.handle().clone(), idle_monitor_state.clone());
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:clepsydre.db", db_migrations)
                .build(),
        )
        .plugin(tauri_plugin_keyring::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            keyring::set_api_credentials,
            keyring::get_api_credentials,
            keyring::delete_api_credentials,
            idle::get_idle_seconds,
            idle::set_idle_monitor_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
