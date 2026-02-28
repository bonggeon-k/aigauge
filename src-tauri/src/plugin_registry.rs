use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use tracing::instrument;

use crate::commands::{ensure_trusted_window, AppState};
use crate::providers::AuthMethod;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    pub auth_method: AuthMethod,
    pub api_endpoint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenericProvider {
    pub manifest: PluginManifest,
}

static PLUGIN_ID_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new("^[a-z0-9_-]+$").expect("plugin id regex should compile"));

impl GenericProvider {
    #[allow(dead_code)]
    #[instrument(skip(self, state))]
    pub async fn fetch_usage(&self, state: &AppState) -> Result<serde_json::Value, String> {
        let credential = state
            .credential_manager
            .get_credential(self.manifest.id.as_str())
            .map_err(|error| format!("credential read failed: {error}"))?;

        let request = state.http_client.get(self.manifest.api_endpoint.as_str());
        let request = if let Some(secret) = credential {
            request.header("authorization", format!("Bearer {}", secret.as_str()))
        } else {
            request
        };

        let response = request
            .send()
            .await
            .map_err(|error| format!("plugin request failed: {error}"))?;
        response
            .json::<serde_json::Value>()
            .await
            .map_err(|error| format!("plugin response parse failed: {error}"))
    }
}

fn is_valid_manifest(manifest: &PluginManifest) -> bool {
    let trimmed_id = manifest.id.trim();
    if trimmed_id.is_empty() || manifest.name.trim().is_empty() {
        return false;
    }
    if !PLUGIN_ID_RE.is_match(trimmed_id) {
        return false;
    }
    if manifest.api_endpoint.trim().is_empty() {
        return false;
    }
    if manifest.api_endpoint.starts_with("javascript:") {
        return false;
    }
    manifest.api_endpoint.starts_with("https://")
}

fn plugin_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))?
        .join("plugins");
    Ok(dir)
}

fn load_plugins_from_dir(path: &Path) -> Result<Vec<PluginManifest>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let mut manifests = Vec::new();
    let entries =
        fs::read_dir(path).map_err(|error| format!("failed to read plugin dir: {error}"))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("failed to read plugin entry: {error}"))?;
        let entry_path = entry.path();
        if entry_path.extension().and_then(|ext| ext.to_str()) != Some("toml") {
            continue;
        }

        let raw = fs::read_to_string(&entry_path)
            .map_err(|error| format!("failed to read plugin manifest: {error}"))?;
        let manifest = toml::from_str::<PluginManifest>(&raw)
            .map_err(|error| format!("failed to parse plugin manifest: {error}"))?;

        if is_valid_manifest(&manifest) {
            let _provider = GenericProvider {
                manifest: manifest.clone(),
            };
            manifests.push(manifest);
        }
    }

    Ok(manifests)
}

fn plugin_target_path(dir: &Path, plugin_id: &str) -> Result<PathBuf, String> {
    if !PLUGIN_ID_RE.is_match(plugin_id) {
        return Err("invalid plugin id".to_string());
    }
    let root = dir
        .canonicalize()
        .map_err(|error| format!("failed to resolve plugin root: {error}"))?;
    let target = root.join(format!("{plugin_id}.toml"));
    let parent = target
        .parent()
        .ok_or_else(|| "invalid plugin target path".to_string())?
        .canonicalize()
        .map_err(|error| format!("failed to resolve plugin target dir: {error}"))?;
    if !parent.starts_with(&root) {
        return Err("invalid plugin target path".to_string());
    }
    Ok(target)
}

#[tauri::command]
#[instrument(skip(app))]
pub fn get_plugins(app: tauri::AppHandle) -> Result<Vec<PluginManifest>, String> {
    let dir = plugin_dir(&app)?;
    load_plugins_from_dir(dir.as_path())
}

#[tauri::command]
#[instrument(skip(app, manifest))]
pub fn register_plugin(
    manifest: PluginManifest,
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<PluginManifest, String> {
    ensure_trusted_window(&window)?;
    if !is_valid_manifest(&manifest) {
        return Err("invalid plugin manifest".to_string());
    }

    let dir = plugin_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|error| format!("failed to create plugin dir: {error}"))?;
    let target = plugin_target_path(&dir, manifest.id.as_str())?;

    let raw = toml::to_string_pretty(&manifest)
        .map_err(|error| format!("failed to serialize plugin manifest: {error}"))?;
    fs::write(target, raw).map_err(|error| format!("failed to save plugin manifest: {error}"))?;

    Ok(manifest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_manifest_from_toml() {
        let raw = r#"
id = "demo"
name = "Demo"
version = "1.0.0"
author = "AIGauge"
description = "demo"
auth_method = "api_key"
api_endpoint = "https://example.com/usage"
"#;
        let parsed = toml::from_str::<PluginManifest>(raw).expect("manifest should parse");
        assert_eq!(parsed.id, "demo");
        assert!(is_valid_manifest(&parsed));
    }
}
