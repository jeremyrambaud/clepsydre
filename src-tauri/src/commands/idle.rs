use user_idle::UserIdle;
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State, UserAttentionType};

#[derive(Clone, Default)]
pub struct IdleMonitorConfig {
    pub enabled: bool,
    pub threshold_seconds: u64,
    pub tracking_active: bool,
}

pub type IdleMonitorState = Arc<Mutex<IdleMonitorConfig>>;

#[derive(Clone, Serialize)]
struct IdleResumePayload {
    idle_seconds: u64,
}

#[tauri::command]
pub fn get_idle_seconds() -> Result<u64, String> {
    UserIdle::get_time()
        .map(|idle| idle.as_seconds())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_idle_monitor_config(
    enabled: bool,
    threshold_minutes: u64,
    tracking_active: bool,
    state: State<'_, IdleMonitorState>,
) -> Result<(), String> {
    let mut config = state.lock().map_err(|e| e.to_string())?;
    config.enabled = enabled;
    config.threshold_seconds = threshold_minutes.saturating_mul(60);
    config.tracking_active = tracking_active;
    Ok(())
}

pub fn spawn_idle_monitor(app: AppHandle, state: IdleMonitorState) {
    thread::spawn(move || {
        let mut threshold_exceeded = false;
        let mut exceeded_peak_seconds = 0_u64;

        loop {
            thread::sleep(Duration::from_secs(2));

            let config = match state.lock() {
                Ok(guard) => guard.clone(),
                Err(_) => continue,
            };

            if !config.enabled || !config.tracking_active || config.threshold_seconds == 0 {
                threshold_exceeded = false;
                exceeded_peak_seconds = 0;
                continue;
            }

            let idle_seconds = match UserIdle::get_time() {
                Ok(idle) => idle.as_seconds(),
                Err(_) => continue,
            };

            if idle_seconds >= config.threshold_seconds {
                threshold_exceeded = true;
                exceeded_peak_seconds = exceeded_peak_seconds.max(idle_seconds);
                continue;
            }

            if !threshold_exceeded {
                continue;
            }

            threshold_exceeded = false;
            let exceeded_idle_seconds = if exceeded_peak_seconds == 0 {
                config.threshold_seconds
            } else {
                exceeded_peak_seconds
            };
            exceeded_peak_seconds = 0;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.request_user_attention(Some(UserAttentionType::Critical));
            }

            let payload = IdleResumePayload {
                idle_seconds: exceeded_idle_seconds,
            };
            let _ = app.emit("idle-resume-threshold-exceeded", payload);
        }
    });
}
