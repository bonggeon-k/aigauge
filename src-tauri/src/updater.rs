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
    let updater = match tauri_plugin_updater::UpdaterExt::updater_builder(&app).build() {
        Ok(updater) => updater,
        Err(error) => {
            tracing::warn!("updater unavailable during check: {error}");
            return Ok(None);
        }
    };

    let Some(update) = (match updater.check().await {
        Ok(update) => update,
        Err(error) => {
            tracing::warn!("updater check failed: {error}");
            return Ok(None);
        }
    }) else {
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
    let updater = match tauri_plugin_updater::UpdaterExt::updater_builder(&app).build() {
        Ok(updater) => updater,
        Err(error) => {
            tracing::warn!("updater unavailable during install: {error}");
            return Ok(false);
        }
    };

    let Some(update) = (match updater.check().await {
        Ok(update) => update,
        Err(error) => {
            tracing::warn!("updater check failed before install: {error}");
            return Ok(false);
        }
    }) else {
        return Ok(false);
    };

    if let Err(error) = update.download_and_install(|_, _| {}, || {}).await {
        tracing::warn!("updater install failed: {error}");
        return Ok(false);
    }

    Ok(true)
}
