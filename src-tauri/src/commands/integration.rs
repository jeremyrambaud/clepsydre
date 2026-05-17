use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State, UserAttentionType};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerStatePayload {
    pub status: String, // "idle" | "running" | "paused"
    pub issue_id: Option<u32>,
    pub issue_subject: Option<String>,
    pub elapsed_seconds: u32,
    pub redmine_url: Option<String>,
}

pub type SharedTimerState = Arc<Mutex<TimerStatePayload>>;

pub fn default_timer_state() -> SharedTimerState {
    Arc::new(Mutex::new(TimerStatePayload {
        status: "idle".into(),
        issue_id: None,
        issue_subject: None,
        elapsed_seconds: 0,
        redmine_url: None,
    }))
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.request_user_attention(Some(UserAttentionType::Critical));
    Ok(())
}

#[tauri::command]
pub fn update_timer_state(
    status: String,
    issue_id: Option<u32>,
    issue_subject: Option<String>,
    elapsed_seconds: u32,
    redmine_url: Option<String>,
    state: State<'_, SharedTimerState>,
) -> Result<(), String> {
    let mut timer = state.lock().map_err(|e| e.to_string())?;
    timer.status = status;
    timer.issue_id = issue_id;
    timer.issue_subject = issue_subject;
    timer.elapsed_seconds = elapsed_seconds;
    timer.redmine_url = redmine_url;
    Ok(())
}

#[tauri::command]
pub fn get_timer_state(
    state: State<'_, SharedTimerState>,
) -> Result<TimerStatePayload, String> {
    let timer = state.lock().map_err(|e| e.to_string())?;
    Ok(timer.clone())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationRequest {
    pub action: String,
    pub issue_id: Option<u32>,
    pub request_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationResponse {
    pub request_id: String,
    pub action: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<TimerStatePayload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub switch_required: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_issue_id: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_issue_subject: Option<String>,
}

#[tauri::command]
pub fn integration_request(
    app: AppHandle,
    action: String,
    issue_id: Option<u32>,
    request_id: String,
) -> Result<(), String> {
    let payload = IntegrationRequest {
        action,
        issue_id,
        request_id,
    };
    app.emit("integration-request", payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn integration_respond(
    app: AppHandle,
    response: IntegrationResponse,
) -> Result<(), String> {
    app.emit("integration-response", response)
        .map_err(|e| e.to_string())
}
