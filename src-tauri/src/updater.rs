use serde::Serialize;
use tracing::instrument;

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub body: String,
}

#[tauri::command]
#[instrument(skip(app))]
pub async fn check_for_update(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = tauri_plugin_updater::UpdaterExt::updater_builder(&app)
        .build()
        .map_err(|error| format!("failed to initialize updater: {error}"))?;

    let Some(update) = updater
        .check()
        .await
        .map_err(|error| format!("failed to check for update: {error}"))?
    else {
        return Ok(None);
    };

    Ok(Some(UpdateInfo {
        version: update.version,
        body: update.body.unwrap_or_default(),
    }))
}

#[tauri::command]
#[instrument(skip(app))]
pub async fn install_update(app: tauri::AppHandle) -> Result<bool, String> {
    let updater = tauri_plugin_updater::UpdaterExt::updater_builder(&app)
        .build()
        .map_err(|error| format!("failed to initialize updater: {error}"))?;

    let Some(update) = updater
        .check()
        .await
        .map_err(|error| format!("failed to check for update: {error}"))?
    else {
        return Ok(false);
    };

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| format!("failed to install update: {error}"))?;

    Ok(true)
}
