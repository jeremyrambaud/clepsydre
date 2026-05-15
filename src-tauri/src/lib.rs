mod commands;
mod migrations;

use commands::{idle, keyring};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_migrations = migrations::get_migrations();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:clepsydre.db", db_migrations)
                .build(),
        )
        .plugin(tauri_plugin_keyring::init())
        .invoke_handler(tauri::generate_handler![
            keyring::set_api_credentials,
            keyring::get_api_credentials,
            keyring::delete_api_credentials,
            idle::get_idle_seconds,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
