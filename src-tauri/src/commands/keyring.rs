use tauri::AppHandle;
use tauri_plugin_keyring::KeyringExt;

const SERVICE: &str = "com.clepsydre.app";
const ACCOUNT_KEY: &str = "redmine_api_key";

#[tauri::command]
pub fn set_api_key(app: AppHandle, api_key: String) -> Result<(), String> {
    let keyring = app.keyring();
    keyring
        .set_password(SERVICE, ACCOUNT_KEY, &api_key)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_api_key(app: AppHandle) -> Result<String, String> {
    let keyring = app.keyring();
    let api_key = keyring
        .get_password(SERVICE, ACCOUNT_KEY)
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    Ok(api_key)
}

#[tauri::command]
pub fn delete_api_key(app: AppHandle) -> Result<(), String> {
    let keyring = app.keyring();
    let _ = keyring.delete_password(SERVICE, ACCOUNT_KEY);
    Ok(())
}
