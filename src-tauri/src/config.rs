use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use tracing::instrument;

use crate::commands::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NotificationSettings {
    pub quota_warning: bool,
    pub quota_critical: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppConfig {
    pub polling_intervals: HashMap<String, u64>,
    pub enabled_providers: Vec<String>,
    pub theme_preference: String,
    pub language: String,
    pub onboarding_complete: bool,
    pub telemetry_enabled: bool,
    pub notifications: NotificationSettings,
}

impl Default for AppConfig {
    fn default() -> Self {
        let polling_intervals = [
            ("codex".to_string(), 300_u64),
            ("claude".to_string(), 300_u64),
            ("gemini".to_string(), 300_u64),
            ("kiro".to_string(), 300_u64),
            ("copilot".to_string(), 300_u64),
            ("cursor".to_string(), 300_u64),
            ("jetbrains".to_string(), 300_u64),
        ]
        .into_iter()
        .collect();

        Self {
            polling_intervals,
            enabled_providers: vec![
                "codex".to_string(),
                "claude".to_string(),
                "gemini".to_string(),
                "kiro".to_string(),
                "copilot".to_string(),
                "cursor".to_string(),
                "jetbrains".to_string(),
            ],
            theme_preference: "system".to_string(),
            language: "en".to_string(),
            onboarding_complete: false,
            telemetry_enabled: false,
            notifications: NotificationSettings {
                quota_warning: true,
                quota_critical: true,
            },
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct ConfigStore;

impl ConfigStore {
    #[instrument(skip(self, app))]
    pub fn load(&self, app: &tauri::AppHandle) -> Result<AppConfig, String> {
        let path = Self::config_path(app)?;
        Self::load_from_path(path.as_path())
    }

    #[instrument(skip(self, app, config))]
    pub fn save(&self, app: &tauri::AppHandle, config: &AppConfig) -> Result<AppConfig, String> {
        let path = Self::config_path(app)?;
        Self::save_to_path(path.as_path(), config)?;
        Ok(config.clone())
    }

    #[instrument(skip(path))]
    pub fn load_from_path(path: &Path) -> Result<AppConfig, String> {
        if !path.exists() {
            return Ok(AppConfig::default());
        }

        let raw =
            fs::read_to_string(path).map_err(|error| format!("failed to read config: {error}"))?;
        serde_json::from_str::<AppConfig>(&raw)
            .map_err(|error| format!("failed to parse config: {error}"))
    }

    #[instrument(skip(path, config))]
    pub fn save_to_path(path: &Path, config: &AppConfig) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create config directory: {error}"))?;
        }

        let payload = serde_json::to_string_pretty(config)
            .map_err(|error| format!("failed to serialize config: {error}"))?;
        fs::write(path, payload).map_err(|error| format!("failed to write config: {error}"))
    }

    #[instrument(skip(app))]
    pub fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("failed to resolve app data dir: {error}"))?;
        Ok(app_data_dir.join("config.json"))
    }
}

#[tauri::command]
#[instrument(skip(state, app))]
pub fn get_config(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<AppConfig, String> {
    state.config_store.load(&app)
}

#[tauri::command]
#[instrument(skip(state, app, config))]
pub fn update_config(
    config: AppConfig,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<AppConfig, String> {
    state.config_store.save(&app, &config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_and_load_roundtrip() {
        let temp = tempfile::tempdir().expect("tempdir should be created");
        let path = temp.path().join("config.json");
        let config = AppConfig::default();

        ConfigStore::save_to_path(path.as_path(), &config).expect("save should succeed");
        let loaded = ConfigStore::load_from_path(path.as_path()).expect("load should succeed");

        assert_eq!(loaded, config);
    }

    #[test]
    fn load_default_when_missing() {
        let temp = tempfile::tempdir().expect("tempdir should be created");
        let path = temp.path().join("missing.json");
        let loaded = ConfigStore::load_from_path(path.as_path()).expect("default should load");
        assert_eq!(loaded, AppConfig::default());
    }
}
