mod bridge_server;
mod commands;
mod migrations;

use commands::{idle, integration, keyring};
use reqwest::StatusCode;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{
    LogicalPosition, LogicalSize, Manager, Position, Size,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Window, WindowEvent,
};
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

#[derive(serde::Serialize, Clone)]
struct UpdateMetadata {
    version: String,
    notes: Option<String>,
}

#[derive(serde::Deserialize)]
struct GithubReleaseResponse {
    body: Option<String>,
}

#[derive(serde::Deserialize)]
struct GithubReleaseAssetResponse {
    name: String,
    browser_download_url: String,
}

#[derive(serde::Deserialize)]
struct GithubReleaseSummaryResponse {
    prerelease: bool,
    #[serde(default)]
    assets: Vec<GithubReleaseAssetResponse>,
}

const MIN_WINDOW_WIDTH: f64 = 390.0;
const MIN_WINDOW_HEIGHT: f64 = 700.0;

#[derive(Clone, Copy)]
struct TrayI18n {
    show: &'static str,
    quit: &'static str,
    current_ticket: &'static str,
    current_time: &'static str,
    none: &'static str,
}

fn tray_i18n() -> TrayI18n {
    let is_french = sys_locale::get_locale()
        .map(|locale| locale.to_lowercase().starts_with("fr"))
        .unwrap_or(false);

    if is_french {
        TrayI18n {
            show: "Afficher Clepsydre",
            quit: "Quitter",
            current_ticket: "Ticket en cours",
            current_time: "Temps",
            none: "Aucun",
        }
    } else {
        TrayI18n {
            show: "Show Clepsydre",
            quit: "Quit",
            current_ticket: "Current ticket",
            current_time: "Elapsed",
            none: "None",
        }
    }
}

// Sizes and positions are stored in LOGICAL units so they remain consistent
// across displays with different scale factors (HiDPI/Retina vs standard).
#[derive(serde::Serialize, serde::Deserialize)]
struct StoredWindowState {
    width: f64,
    height: f64,
    x: f64,
    y: f64,
}

fn window_state_file_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("window-state.json"))
}

fn save_window_state<R: tauri::Runtime>(app: &tauri::AppHandle<R>, state: &StoredWindowState) {
    let Some(path) = window_state_file_path(app) else {
        return;
    };

    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(serialized) = serde_json::to_string(state) {
        let _ = fs::write(path, serialized);
    }
}

fn load_window_state<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<StoredWindowState> {
    let path = window_state_file_path(app)?;
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn persist_window_state<R: tauri::Runtime>(window: &Window<R>) {
    if window.is_maximized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) {
        return;
    }

    // outer_size()/outer_position() return PHYSICAL pixels; convert to logical
    // using the window's current scale factor before storing.
    let Ok(scale) = window.scale_factor() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let Ok(position) = window.outer_position() else {
        return;
    };

    let logical_size = size.to_logical::<f64>(scale);
    let logical_position = position.to_logical::<f64>(scale);

    // Ignore bogus sizes (can happen while the window is hidden/minimized).
    if logical_size.width < 1.0 || logical_size.height < 1.0 {
        return;
    }

    let state = StoredWindowState {
        width: logical_size.width,
        height: logical_size.height,
        x: logical_position.x,
        y: logical_position.y,
    };

    save_window_state(&window.app_handle(), &state);
}

fn restore_window_state<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let Some(saved) = load_window_state(app) else {
        return;
    };

    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let mut width = saved.width.max(MIN_WINDOW_WIDTH);
    let mut height = saved.height.max(MIN_WINDOW_HEIGHT);

    // Clamp to the current monitor's logical size to guard against stale or
    // oversized values (e.g. data saved on a larger/HiDPI screen) that would
    // otherwise make the window appear far too wide or tall.
    if let Ok(Some(monitor)) = window.current_monitor() {
        let monitor_logical = monitor.size().to_logical::<f64>(monitor.scale_factor());
        if monitor_logical.width >= MIN_WINDOW_WIDTH {
            width = width.min(monitor_logical.width);
        }
        if monitor_logical.height >= MIN_WINDOW_HEIGHT {
            height = height.min(monitor_logical.height);
        }
    }

    let _ = window.set_size(Size::Logical(LogicalSize::new(width, height)));
    let _ = window.set_position(Position::Logical(LogicalPosition::new(saved.x, saved.y)));
}

fn stable_manifest_endpoint() -> &'static str {
    "https://github.com/jeremyrambaud/clepsydre/releases/latest/download/latest.json"
}

async fn fetch_latest_prerelease_manifest_endpoint() -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(4))
        .build()
        .ok()?;

    let response = client
        .get("https://api.github.com/repos/jeremyrambaud/clepsydre/releases?per_page=20")
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "clepsydre-updater")
        .send()
        .await
        .ok()?;

    if !response.status().is_success() {
        return None;
    }

    let releases = response.json::<Vec<GithubReleaseSummaryResponse>>().await.ok()?;
    for release in releases {
        if !release.prerelease {
            continue;
        }

        if let Some(asset) = release.assets.into_iter().find(|asset| asset.name == "latest.json") {
            return Some(asset.browser_download_url);
        }
    }

    None
}

async fn update_endpoint_for_channel(channel: &str) -> String {
    match channel {
        "beta" => fetch_latest_prerelease_manifest_endpoint()
            .await
            .unwrap_or_else(|| stable_manifest_endpoint().to_string()),
        _ => stable_manifest_endpoint().to_string(),
    }
}

async fn fetch_github_release_body(version: &str) -> Option<String> {
    let candidates = if version.starts_with('v') {
        vec![version.to_string(), version.trim_start_matches('v').to_string()]
    } else {
        vec![format!("v{version}"), version.to_string()]
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(4))
        .build()
        .ok()?;

    for tag in candidates {
        let endpoint = format!(
            "https://api.github.com/repos/jeremyrambaud/clepsydre/releases/tags/{tag}"
        );

        let response = match client
            .get(endpoint)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", "clepsydre-updater")
            .send()
            .await
        {
            Ok(response) => response,
            Err(_) => continue,
        };

        if response.status() == StatusCode::NOT_FOUND {
            continue;
        }

        if !response.status().is_success() {
            continue;
        }

        let release = match response.json::<GithubReleaseResponse>().await {
            Ok(release) => release,
            Err(_) => continue,
        };

        if let Some(body) = release.body {
            let trimmed = body.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }

    None
}

fn format_clock_timer(seconds: u32) -> String {
    let h = seconds / 3600;
    let m = (seconds % 3600) / 60;
    let s = seconds % 60;
    format!("{h:02}:{m:02}:{s:02}")
}

fn now_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

fn compute_live_elapsed_seconds(state: &integration::TimerStatePayload) -> u32 {
    match state.status.as_str() {
        "running" => {
            if let Some(start_time_ms) = state.start_time_ms {
                let diff_ms = now_unix_ms().saturating_sub(start_time_ms);
                (diff_ms / 1000) as u32
            } else {
                state.elapsed_seconds
            }
        }
        "paused" => state.elapsed_seconds,
        _ => 0,
    }
}

fn spawn_tray_timer_sync<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    timer_state: integration::SharedTimerState,
    tray_ticket_item: tauri::menu::MenuItem<R>,
    tray_time_item: tauri::menu::MenuItem<R>,
    i18n: TrayI18n,
) {
    thread::spawn(move || {
        let mut last_label: Option<String> = None;
        let mut last_ticket_label: Option<String> = None;
        let mut last_time_label: Option<String> = None;

        loop {
            let snapshot = match timer_state.lock() {
                Ok(state) => state.clone(),
                Err(_) => {
                    thread::sleep(Duration::from_secs(1));
                    continue;
                }
            };

            let next_label = match snapshot.status.as_str() {
                "running" | "paused" => {
                    let elapsed = compute_live_elapsed_seconds(&snapshot);
                    match snapshot.issue_id {
                        Some(issue_id) => format!("  {} (#{issue_id})", format_clock_timer(elapsed)),
                        None => format!("  {}", format_clock_timer(elapsed)),
                    }
                }
                _ => String::new(),
            };

            let next_ticket_label = match snapshot.issue_id {
                Some(issue_id) => format!("{}: #{issue_id}", i18n.current_ticket),
                None => format!("{}: {}", i18n.current_ticket, i18n.none),
            };

            let next_time_label = match snapshot.status.as_str() {
                "running" | "paused" => {
                    let elapsed = compute_live_elapsed_seconds(&snapshot);
                    format!("{}: {}", i18n.current_time, format_clock_timer(elapsed))
                }
                _ => format!("{}: --:--:--", i18n.current_time),
            };

            if last_label.as_deref() != Some(next_label.as_str()) {
                if let Some(tray) = app.tray_by_id("main-tray") {
                    let _ = tray.set_title(Some(next_label.as_str()));
                }
                last_label = Some(next_label);
            }

            if last_ticket_label.as_deref() != Some(next_ticket_label.as_str()) {
                let _ = tray_ticket_item.set_text(next_ticket_label.as_str());
                last_ticket_label = Some(next_ticket_label);
            }

            if last_time_label.as_deref() != Some(next_time_label.as_str()) {
                let _ = tray_time_item.set_text(next_time_label.as_str());
                last_time_label = Some(next_time_label);
            }

            thread::sleep(Duration::from_secs(1));
        }
    });
}

#[tauri::command]
fn set_tray_timer_label(app: tauri::AppHandle, label: Option<String>) -> Result<(), String> {
    let tray = app
        .tray_by_id("main-tray")
        .ok_or_else(|| "Tray icon not found".to_string())?;

    let title = label.unwrap_or_default();
    tray.set_title(Some(title.as_str()))
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
fn get_system_locale() -> Option<String> {
    sys_locale::get_locale()
}

#[tauri::command]
async fn check_for_updates(
    app: tauri::AppHandle,
    channel: Option<String>,
    pending_update_state: tauri::State<'_, Arc<Mutex<Option<Update>>>>,
) -> Result<Option<UpdateMetadata>, String> {
    let selected_channel = channel.unwrap_or_else(|| "stable".to_string());
    let endpoint = update_endpoint_for_channel(&selected_channel).await;
    let endpoint_url =
        Url::parse(endpoint.as_str()).map_err(|e| format!("Invalid update endpoint: {e}"))?;

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

    if let Some(update) = update {
        let github_release_body = fetch_github_release_body(&update.version).await;
        let metadata = UpdateMetadata {
            version: update.version.clone(),
            notes: github_release_body.or(update.body.clone()),
        };

        let mut pending = pending_update_state
            .lock()
            .map_err(|e| format!("Failed to lock pending update state: {e}"))?;
        *pending = Some(update);
        Ok(Some(metadata))
    } else {
        let mut pending = pending_update_state
            .lock()
            .map_err(|e| format!("Failed to lock pending update state: {e}"))?;
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
    let timer_state = integration::default_timer_state();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let _ = integration::show_main_window(app.clone());
        }))
        .manage(idle_monitor_state.clone())
        .manage(minimize_to_tray_state.clone())
        .manage(pending_update_state.clone())
        .manage(timer_state.clone())
        .on_window_event({
            let minimize_to_tray_state = minimize_to_tray_state.clone();
            move |window, event| {
                match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        persist_window_state(window);

                        let should_minimize_to_tray = minimize_to_tray_state
                            .lock()
                            .map(|state| *state)
                            .unwrap_or(true);
                        if should_minimize_to_tray {
                            api.prevent_close();
                            #[cfg(target_os = "macos")]
                            {
                                let _ = window
                                    .app_handle()
                                    .set_activation_policy(tauri::ActivationPolicy::Accessory);
                            }
                            let _ = window.set_skip_taskbar(true);
                            let _ = window.hide();
                        }
                    }
                    WindowEvent::Moved(_) | WindowEvent::Resized(_) => persist_window_state(window),
                    _ => {}
                }
            }
        })
        .setup(move |app| {
            if let Some(window) = app.handle().get_webview_window("main") {
                let _ = window.set_min_size(Some(Size::Logical(LogicalSize::new(
                    MIN_WINDOW_WIDTH,
                    MIN_WINDOW_HEIGHT,
                ))));
            }

            restore_window_state(&app.handle());

            idle::spawn_idle_monitor(app.handle().clone(), idle_monitor_state.clone());
            bridge_server::spawn_bridge_server(app.handle().clone(), timer_state.clone());

            let i18n = tray_i18n();

            let tray_ticket_item = MenuItemBuilder::with_id(
                "tray-current-ticket",
                format!("{}: {}", i18n.current_ticket, i18n.none),
            )
                .enabled(false)
                .build(app)?;

            let tray_time_item = MenuItemBuilder::with_id(
                "tray-current-time",
                format!("{}: --:--:--", i18n.current_time),
            )
                .enabled(false)
                .build(app)?;

            let tray_menu = MenuBuilder::new(app)
                .items(&[&tray_ticket_item, &tray_time_item])
                .separator()
                .text("show", i18n.show)
                .separator()
                .text("quit", i18n.quit)
                .build()?;

            let tray_icon_bytes: &[u8] = if cfg!(target_os = "windows") {
                include_bytes!("../icons/tray-windows.png")
            } else {
                include_bytes!("../icons/tray.png")
            };
            let tray_icon = tauri::image::Image::from_bytes(tray_icon_bytes)?;

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
                            #[cfg(target_os = "macos")]
                            {
                                let _ = tray
                                    .app_handle()
                                    .set_activation_policy(tauri::ActivationPolicy::Regular);
                            }
                            let _ = window.set_skip_taskbar(false);
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .on_menu_event(|app, event| {
                    if event.id().as_ref() == "show" {
                        if let Some(window) = app.get_webview_window("main") {
                            #[cfg(target_os = "macos")]
                            {
                                let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
                            }
                            let _ = window.set_skip_taskbar(false);
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    } else if event.id().as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .build(app)?;

            spawn_tray_timer_sync(
                app.handle().clone(),
                timer_state.clone(),
                tray_ticket_item.clone(),
                tray_time_item.clone(),
                i18n,
            );

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
            keyring::set_api_key,
            keyring::get_api_key,
            keyring::delete_api_key,
            idle::get_idle_seconds,
            idle::set_idle_monitor_config,
            integration::show_main_window,
            integration::update_timer_state,
            integration::get_timer_state,
            integration::integration_request,
            integration::integration_respond,
            set_tray_timer_label,
            set_minimize_to_tray,
            get_system_locale,
            check_for_updates,
            install_pending_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
