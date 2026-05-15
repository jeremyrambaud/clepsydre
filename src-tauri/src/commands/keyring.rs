use tauri::AppHandle;
use tauri_plugin_keyring::KeyringExt;

const SERVICE: &str = "com.clepsydre.app";
const ACCOUNT_URL: &str = "redmine_url";
const ACCOUNT_KEY: &str = "redmine_api_key";

#[tauri::command]
pub fn set_api_credentials(
    app: AppHandle,
    url: String,
    api_key: String,
) -> Result<(), String> {
    let keyring = app.keyring();
    keyring
        .set_password(SERVICE, ACCOUNT_URL, &url)
        .map_err(|e| e.to_string())?;
    keyring
        .set_password(SERVICE, ACCOUNT_KEY, &api_key)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_api_credentials(app: AppHandle) -> Result<(String, String), String> {
    let keyring = app.keyring();
    let url = keyring
        .get_password(SERVICE, ACCOUNT_URL)
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    let api_key = keyring
        .get_password(SERVICE, ACCOUNT_KEY)
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    Ok((url, api_key))
}

#[tauri::command]
pub fn delete_api_credentials(app: AppHandle) -> Result<(), String> {
    let keyring = app.keyring();
    let _ = keyring.delete_password(SERVICE, ACCOUNT_URL);
    let _ = keyring.delete_password(SERVICE, ACCOUNT_KEY);
    Ok(())
}
