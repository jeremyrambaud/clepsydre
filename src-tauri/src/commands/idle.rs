use user_idle::UserIdle;

#[tauri::command]
pub fn get_idle_seconds() -> Result<u64, String> {
    UserIdle::get_time()
        .map(|idle| idle.as_seconds())
        .map_err(|e| e.to_string())
}
