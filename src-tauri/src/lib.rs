mod commands;
mod migrations;

use commands::{idle, keyring};
use std::sync::{Arc, Mutex};
use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

#[derive(serde::Serialize, Clone)]
struct UpdateMetadata {
    version: String,
    notes: Option<String>,
}

fn update_endpoint_for_channel(channel: &str) -> &'static str {
    match channel {
        "beta" => "https://github.com/jeremyrambaud/clepsydre/releases/download/latest-beta/latest.json",
        _ => "https://github.com/jeremyrambaud/clepsydre/releases/download/latest-stable/latest.json",
    }
}

#[tauri::command]
fn set_tray_timer_label(app: tauri::AppHandle, label: Option<String>) -> Result<(), String> {
    let tray = app
        .tray_by_id("main-tray")
        .ok_or_else(|| "Tray icon not found".to_string())?;

    tray.set_title(label.as_deref())
        .map_err(|e| format!("Failed to set tray title: {e}"))
}

#[tauri::command]
fn set_minimize_to_tray(
    enabled: bool,
    minimize_to_tray_state: tauri::State<Arc<Mutex<bool>>>,
) -> Result<(), String> {
    let mut state = minimize_to_tray_state
        .lock()
        .map_err(|e| format!("Failed to lock minimize_to_tray state: {e}"))?;
    *state = enabled;
    Ok(())
}

#[tauri::command]
async fn check_for_updates(
    app: tauri::AppHandle,
    channel: Option<String>,
    pending_update_state: tauri::State<'_, Arc<Mutex<Option<Update>>>>,
) -> Result<Option<UpdateMetadata>, String> {
    let selected_channel = channel.unwrap_or_else(|| "stable".to_string());
    let endpoint = update_endpoint_for_channel(&selected_channel);
    let endpoint_url = Url::parse(endpoint).map_err(|e| format!("Invalid update endpoint: {e}"))?;

    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint_url])
        .map_err(|e| format!("Failed to configure updater endpoint: {e}"))?
        .build()
        .map_err(|e| format!("Failed to build updater: {e}"))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Failed to check for updates: {e}"))?;

    let mut pending = pending_update_state
        .lock()
        .map_err(|e| format!("Failed to lock pending update state: {e}"))?;

    if let Some(update) = update {
        let metadata = UpdateMetadata {
            version: update.version.clone(),
            notes: update.body.clone(),
        };
        *pending = Some(update);
        Ok(Some(metadata))
    } else {
        *pending = None;
        Ok(None)
    }
}

#[tauri::command]
async fn install_pending_update(
    pending_update_state: tauri::State<'_, Arc<Mutex<Option<Update>>>>,
) -> Result<(), String> {
    let update = {
        let pending = pending_update_state
            .lock()
            .map_err(|e| format!("Failed to lock pending update state: {e}"))?;
        pending.clone()
    };

    let Some(update) = update else {
        return Err("No pending update available".to_string());
    };

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| format!("Failed to download/install update: {e}"))?;

    let mut pending = pending_update_state
        .lock()
        .map_err(|e| format!("Failed to lock pending update state: {e}"))?;
    *pending = None;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_migrations = migrations::get_migrations();
    let idle_monitor_state = Arc::new(Mutex::new(idle::IdleMonitorConfig::default()));
    let minimize_to_tray_state = Arc::new(Mutex::new(true));
    let pending_update_state: Arc<Mutex<Option<Update>>> = Arc::new(Mutex::new(None));

    tauri::Builder::default()
        .manage(idle_monitor_state.clone())
        .manage(minimize_to_tray_state.clone())
        .manage(pending_update_state.clone())
        .on_window_event({
            let minimize_to_tray_state = minimize_to_tray_state.clone();
            move |window, event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    let should_minimize_to_tray = minimize_to_tray_state
                        .lock()
                        .map(|state| *state)
                        .unwrap_or(true);
                    if should_minimize_to_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .setup(move |app| {
            idle::spawn_idle_monitor(app.handle().clone(), idle_monitor_state.clone());

            let tray_menu = MenuBuilder::new(app)
                .text("show", "Show Clepsydre")
                .separator()
                .quit()
                .build()?;

            let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;

            TrayIconBuilder::with_id("main-tray")
                .icon(tray_icon)
                .title("")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .on_menu_event(|app, event| {
                    if event.id().as_ref() == "show" {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

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
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            keyring::set_api_credentials,
            keyring::get_api_credentials,
            keyring::delete_api_credentials,
            idle::get_idle_seconds,
            idle::set_idle_monitor_config,
            set_tray_timer_label,
            set_minimize_to_tray,
            check_for_updates,
            install_pending_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
