use serde::Serialize;
use tracing::instrument;

use crate::commands::ensure_main_window;

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub body: String,
}

#[tauri::command]
#[instrument(skip(app))]
pub async fn check_for_update(
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<Option<UpdateInfo>, String> {
    ensure_main_window(&window)?;
    if cfg!(debug_assertions) {
        tracing::debug!("skip updater check in debug build");
        return Ok(None);
    }

    let updater = match tauri_plugin_updater::UpdaterExt::updater_builder(&app).build() {
        Ok(updater) => updater,
        Err(error) => {
            return Err(format!("updater unavailable during check: {error}"));
        }
    };

    let Some(update) = (match updater.check().await {
        Ok(update) => update,
        Err(error) => {
            return Err(format!("updater check failed: {error}"));
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
pub async fn install_update(app: tauri::AppHandle, window: tauri::Window) -> Result<bool, String> {
    ensure_main_window(&window)?;
    if cfg!(debug_assertions) {
        tracing::debug!("skip updater install in debug build");
        return Ok(false);
    }

    let updater = match tauri_plugin_updater::UpdaterExt::updater_builder(&app).build() {
        Ok(updater) => updater,
        Err(error) => {
            return Err(format!("updater unavailable during install: {error}"));
        }
    };

    let Some(update) = (match updater.check().await {
        Ok(update) => update,
        Err(error) => {
            return Err(format!("updater check failed before install: {error}"));
        }
    }) else {
        return Ok(false);
    };

    if let Err(error) = update.download_and_install(|_, _| {}, || {}).await {
        return Err(format!("updater install failed: {error}"));
    }

    Ok(true)
}
