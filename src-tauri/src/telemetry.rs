use serde::Serialize;
use tracing::instrument;

use crate::commands::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct TelemetryStatus {
    pub enabled: bool,
    pub configured_provider_count: usize,
    pub app_version: String,
    pub os: String,
}

#[tauri::command]
#[instrument(skip(state, app))]
pub fn get_telemetry_status(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<TelemetryStatus, String> {
    let config = state.config_store.load(&app)?;
    Ok(TelemetryStatus {
        enabled: config.telemetry_enabled,
        configured_provider_count: config.enabled_providers.len(),
        app_version: app.package_info().version.to_string(),
        os: std::env::consts::OS.to_string(),
    })
}

#[tauri::command]
#[instrument(skip(state, app))]
pub fn set_telemetry_enabled(
    enabled: bool,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<TelemetryStatus, String> {
    let mut config = state.config_store.load(&app)?;
    config.telemetry_enabled = enabled;
    let saved = state.config_store.save(&app, &config)?;

    Ok(TelemetryStatus {
        enabled: saved.telemetry_enabled,
        configured_provider_count: saved.enabled_providers.len(),
        app_version: app.package_info().version.to_string(),
        os: std::env::consts::OS.to_string(),
    })
}
