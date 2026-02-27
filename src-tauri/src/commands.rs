use crate::config::ConfigStore;
use crate::credentials::CredentialManager;
use crate::providers::claude::ClaudeProvider;
use crate::providers::codex::CodexProvider;
use crate::providers::copilot::CopilotProvider;
use crate::providers::cursor::CursorProvider;
use crate::providers::gemini::GeminiProvider;
use crate::providers::jetbrains::JetBrainsProvider;
use crate::providers::kiro::KiroProvider;
use crate::providers::{
    build_shared_http_client, AuthMethod, CostData, Provider, ProviderError, ProviderInfo,
    ProviderStatus, QuotaLimit, UsageData,
};
use crate::quota_cache::{ProviderSnapshot, QuotaCache};
use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tracing::instrument;

pub const PROVIDER_IDS: &[&str] = &[
    "codex",
    "claude",
    "gemini",
    "kiro",
    "copilot",
    "cursor",
    "jetbrains",
];

#[derive(Debug, Clone, Serialize)]
pub struct ProviderDescriptor {
    pub id: String,
    pub name: String,
    pub auth_method: AuthMethod,
}

#[derive(Debug, Clone, Serialize)]
pub struct HealthStatus {
    pub configured: bool,
    pub reachable: bool,
    pub last_checked: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DashboardEntry {
    pub info: ProviderInfo,
    pub usage: UsageData,
    pub quota: QuotaLimit,
    pub cost: Option<CostData>,
    pub health: HealthStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManualProviderInput {
    pub provider: String,
    pub requests: u64,
    pub tokens: u64,
    pub used: u64,
    pub limit: u64,
    pub unit: String,
    pub reset_at: String,
    pub cost_total: Option<f64>,
    pub plan_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DataSource {
    OAuth,
    Cli,
    Cache,
    Manual,
    Snapshot,
}

pub struct ProviderRegistry {
    codex: CodexProvider,
    claude: ClaudeProvider,
    gemini: GeminiProvider,
    kiro: KiroProvider,
    copilot: CopilotProvider,
    cursor: CursorProvider,
    jetbrains: JetBrainsProvider,
}

pub struct AppState {
    pub providers: ProviderRegistry,
    pub credential_manager: CredentialManager,
    pub config_store: ConfigStore,
    pub quota_cache: QuotaCache,
    #[allow(dead_code)]
    pub http_client: Client,
}

impl AppState {
    #[instrument]
    pub fn new() -> Self {
        let credential_manager = CredentialManager::new();
        let http_client = build_shared_http_client().unwrap_or_else(|_| Client::new());
        Self {
            providers: ProviderRegistry::new(credential_manager.clone(), http_client.clone()),
            credential_manager,
            config_store: ConfigStore,
            quota_cache: QuotaCache::default(),
            http_client,
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderRegistry {
    pub fn new(credential_manager: CredentialManager, http_client: Client) -> Self {
        Self {
            codex: CodexProvider::new(credential_manager.clone(), http_client.clone()),
            claude: ClaudeProvider::new(credential_manager.clone(), http_client.clone()),
            gemini: GeminiProvider::new(credential_manager.clone(), http_client.clone()),
            kiro: KiroProvider::new(credential_manager.clone(), http_client.clone()),
            copilot: CopilotProvider::new(credential_manager.clone(), http_client.clone()),
            cursor: CursorProvider::new(credential_manager.clone(), http_client.clone()),
            jetbrains: JetBrainsProvider::new(credential_manager, http_client),
        }
    }

    pub async fn descriptors(&self) -> Vec<ProviderDescriptor> {
        vec![
            ProviderDescriptor {
                id: "codex".to_string(),
                name: self.codex.name().await.to_string(),
                auth_method: self.codex.auth_method(),
            },
            ProviderDescriptor {
                id: "claude".to_string(),
                name: self.claude.name().await.to_string(),
                auth_method: self.claude.auth_method(),
            },
            ProviderDescriptor {
                id: "gemini".to_string(),
                name: self.gemini.name().await.to_string(),
                auth_method: self.gemini.auth_method(),
            },
            ProviderDescriptor {
                id: "kiro".to_string(),
                name: self.kiro.name().await.to_string(),
                auth_method: self.kiro.auth_method(),
            },
            ProviderDescriptor {
                id: "copilot".to_string(),
                name: self.copilot.name().await.to_string(),
                auth_method: self.copilot.auth_method(),
            },
            ProviderDescriptor {
                id: "cursor".to_string(),
                name: self.cursor.name().await.to_string(),
                auth_method: self.cursor.auth_method(),
            },
            ProviderDescriptor {
                id: "jetbrains".to_string(),
                name: self.jetbrains.name().await.to_string(),
                auth_method: self.jetbrains.auth_method(),
            },
        ]
    }

    pub async fn info_for(&self, provider: &str) -> Result<ProviderInfo, ProviderError> {
        match provider {
            "codex" => Ok(self.codex.provider_info().await),
            "claude" => Ok(self.claude.provider_info().await),
            "gemini" => Ok(self.gemini.provider_info().await),
            "kiro" => Ok(self.kiro.provider_info().await),
            "copilot" => Ok(self.copilot.provider_info().await),
            "cursor" => Ok(self.cursor.provider_info().await),
            "jetbrains" => Ok(self.jetbrains.provider_info().await),
            _ => Err(ProviderError::Operation(format!(
                "unsupported provider: {provider}"
            ))),
        }
    }

    pub async fn usage_for(&self, provider: &str) -> Result<UsageData, ProviderError> {
        match provider {
            "codex" => self.codex.fetch_usage().await,
            "claude" => self.claude.fetch_usage().await,
            "gemini" => self.gemini.fetch_usage().await,
            "kiro" => self.kiro.fetch_usage().await,
            "copilot" => self.copilot.fetch_usage().await,
            "cursor" => self.cursor.fetch_usage().await,
            "jetbrains" => self.jetbrains.fetch_usage().await,
            _ => Err(ProviderError::Operation(format!(
                "unsupported provider: {provider}"
            ))),
        }
    }

    pub async fn cost_for(&self, provider: &str) -> Result<Option<CostData>, ProviderError> {
        match provider {
            "codex" => self.codex.fetch_cost().await,
            "claude" => self.claude.fetch_cost().await,
            "gemini" => self.gemini.fetch_cost().await,
            "kiro" => self.kiro.fetch_cost().await,
            "copilot" => self.copilot.fetch_cost().await,
            "cursor" => self.cursor.fetch_cost().await,
            "jetbrains" => self.jetbrains.fetch_cost().await,
            _ => Err(ProviderError::Operation(format!(
                "unsupported provider: {provider}"
            ))),
        }
    }

    pub async fn quota_for(&self, provider: &str) -> Result<QuotaLimit, ProviderError> {
        match provider {
            "codex" => self.codex.fetch_quota().await,
            "claude" => self.claude.fetch_quota().await,
            "gemini" => self.gemini.fetch_quota().await,
            "kiro" => self.kiro.fetch_quota().await,
            "copilot" => self.copilot.fetch_quota().await,
            "cursor" => self.cursor.fetch_quota().await,
            "jetbrains" => self.jetbrains.fetch_quota().await,
            _ => Err(ProviderError::Operation(format!(
                "unsupported provider: {provider}"
            ))),
        }
    }
}

fn manual_data_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))?;
    Ok(dir.join("manual-provider-inputs.json"))
}

fn load_manual_inputs(
    app: &tauri::AppHandle,
) -> Result<HashMap<String, ManualProviderInput>, String> {
    let path = manual_data_path(app)?;
    if !path.exists() {
        return Ok(HashMap::new());
    }

    let raw = fs::read_to_string(path)
        .map_err(|error| format!("failed to read manual inputs: {error}"))?;
    serde_json::from_str::<HashMap<String, ManualProviderInput>>(&raw)
        .map_err(|error| format!("failed to parse manual inputs: {error}"))
}

fn save_manual_inputs(
    app: &tauri::AppHandle,
    entries: &HashMap<String, ManualProviderInput>,
) -> Result<(), String> {
    let path = manual_data_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create manual input dir: {error}"))?;
    }

    let payload = serde_json::to_string_pretty(entries)
        .map_err(|error| format!("failed to serialize manual inputs: {error}"))?;
    fs::write(path, payload).map_err(|error| format!("failed to save manual inputs: {error}"))
}

fn build_health_from_usage(usage: &UsageData, reachable: bool) -> HealthStatus {
    HealthStatus {
        configured: usage.status != ProviderStatus::NotConfigured,
        reachable,
        last_checked: Utc::now().to_rfc3339(),
    }
}

fn manual_to_entry(info: ProviderInfo, manual: &ManualProviderInput) -> DashboardEntry {
    let usage = UsageData {
        provider: manual.provider.clone(),
        requests: manual.requests,
        tokens: manual.tokens,
        period_start: String::new(),
        period_end: manual.reset_at.clone(),
        status: ProviderStatus::Ok,
    };

    let quota = QuotaLimit {
        used: manual.used,
        limit: manual.limit,
        unit: manual.unit.clone(),
        reset_at: manual.reset_at.clone(),
        status: ProviderStatus::Ok,
    };

    let existing_plan = info.plan_name.clone();
    let info = ProviderInfo {
        plan_name: manual.plan_name.clone().unwrap_or(existing_plan),
        ..info
    };

    let cost = manual.cost_total.map(|total| CostData {
        provider: manual.provider.clone(),
        currency: "USD".to_string(),
        total,
        period_start: String::new(),
        period_end: manual.reset_at.clone(),
        status: ProviderStatus::Ok,
    });

    DashboardEntry {
        info,
        usage,
        quota,
        cost,
        health: HealthStatus {
            configured: true,
            reachable: true,
            last_checked: Utc::now().to_rfc3339(),
        },
    }
}

async fn fetch_live_entry(
    provider: &str,
    state: &AppState,
) -> Result<DashboardEntry, ProviderError> {
    let info = state.providers.info_for(provider).await?;
    let usage = state.providers.usage_for(provider).await?;
    let quota = state.providers.quota_for(provider).await?;
    let cost = state.providers.cost_for(provider).await?;

    Ok(DashboardEntry {
        info,
        usage: usage.clone(),
        quota,
        cost,
        health: build_health_from_usage(&usage, usage.status == ProviderStatus::Ok),
    })
}

pub(crate) async fn resolve_dashboard_entry(
    provider: &str,
    state: &AppState,
    app: &tauri::AppHandle,
) -> Result<(DashboardEntry, DataSource), ProviderError> {
    let live = fetch_live_entry(provider, state).await;

    if let Ok(entry) = live.as_ref() {
        if entry.usage.status == ProviderStatus::Ok {
            let snapshot = ProviderSnapshot {
                info: entry.info.clone(),
                usage: entry.usage.clone(),
                quota: entry.quota.clone(),
                cost: entry.cost.clone(),
            };
            state.quota_cache.set(provider, snapshot);

            let source = if provider == "kiro" {
                DataSource::Cli
            } else if matches!(provider, "codex" | "claude" | "gemini") {
                DataSource::OAuth
            } else {
                DataSource::Snapshot
            };

            return Ok((entry.clone(), source));
        }
    }

    if let Some(snapshot) = state.quota_cache.get(provider) {
        let cached_usage = snapshot.usage.clone();
        let entry = DashboardEntry {
            info: snapshot.info,
            usage: cached_usage.clone(),
            quota: snapshot.quota,
            cost: snapshot.cost,
            health: build_health_from_usage(&cached_usage, false),
        };
        return Ok((entry, DataSource::Cache));
    }

    let manual_map = load_manual_inputs(app).unwrap_or_default();
    if let Some(manual) = manual_map.get(provider) {
        let info = state
            .providers
            .info_for(provider)
            .await
            .unwrap_or(ProviderInfo {
                id: provider.to_string(),
                name: provider.to_string(),
                icon: "circle".to_string(),
                auth_method: AuthMethod::None,
                plan_name: "Manual".to_string(),
                quota_limit: manual.limit,
                reset_period: "manual".to_string(),
            });
        return Ok((manual_to_entry(info, manual), DataSource::Manual));
    }

    match live {
        Ok(mut entry) => {
            entry.health = build_health_from_usage(&entry.usage, false);
            Ok((entry, DataSource::Snapshot))
        }
        Err(error) => Err(error),
    }
}

#[instrument(skip(state), fields(provider = provider))]
pub async fn provider_health(
    provider: &str,
    state: &AppState,
    app: &tauri::AppHandle,
) -> std::result::Result<HealthStatus, ProviderError> {
    let (entry, source) = resolve_dashboard_entry(provider, state, app).await?;
    let reachable = matches!(
        source,
        DataSource::OAuth | DataSource::Cli | DataSource::Snapshot
    ) && entry.usage.status == ProviderStatus::Ok;
    let has_credential = state
        .credential_manager
        .has_credential(provider)
        .unwrap_or(false);

    Ok(HealthStatus {
        configured: has_credential || entry.usage.status != ProviderStatus::NotConfigured,
        reachable,
        last_checked: Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub async fn get_providers(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ProviderDescriptor>, String> {
    Ok(state.providers.descriptors().await)
}

#[tauri::command]
pub async fn get_usage(
    provider: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<UsageData, String> {
    resolve_dashboard_entry(provider.as_str(), &state, &app)
        .await
        .map(|value| value.0.usage)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_cost(
    provider: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Option<CostData>, String> {
    resolve_dashboard_entry(provider.as_str(), &state, &app)
        .await
        .map(|value| value.0.cost)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_provider_info(
    provider: String,
    state: tauri::State<'_, AppState>,
) -> Result<ProviderInfo, String> {
    state
        .providers
        .info_for(provider.as_str())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_quota(
    provider: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<QuotaLimit, String> {
    resolve_dashboard_entry(provider.as_str(), &state, &app)
        .await
        .map(|value| value.0.quota)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_all_dashboard_data(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<DashboardEntry>, String> {
    let mut entries = Vec::with_capacity(PROVIDER_IDS.len());

    for provider in PROVIDER_IDS {
        let (entry, _) = resolve_dashboard_entry(provider, &state, &app)
            .await
            .map_err(|error| error.to_string())?;
        entries.push(entry);
    }

    Ok(entries)
}

#[tauri::command]
pub async fn check_provider_health(
    provider: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<HealthStatus, String> {
    provider_health(provider.as_str(), &state, &app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_credential(
    provider: String,
    credential: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state
        .credential_manager
        .save_credential(provider.as_str(), credential)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_credential(
    provider: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state
        .credential_manager
        .delete_credential(provider.as_str())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_manual_input(
    provider: String,
    input: ManualProviderInput,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if provider != input.provider {
        return Err("provider mismatch in manual input".to_string());
    }

    let mut manual = load_manual_inputs(&app)?;
    manual.insert(provider, input);
    save_manual_inputs(&app, &manual)
}

#[tauri::command]
pub fn clear_provider_data(
    provider: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    state.quota_cache.clear(Some(provider.as_str()));

    let mut manual = load_manual_inputs(&app)?;
    manual.remove(provider.as_str());
    save_manual_inputs(&app, &manual)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manual_input_roundtrip_shape() {
        let manual = ManualProviderInput {
            provider: "codex".to_string(),
            requests: 10,
            tokens: 11,
            used: 12,
            limit: 100,
            unit: "percent".to_string(),
            reset_at: "2026-03-01".to_string(),
            cost_total: Some(12.5),
            plan_name: Some("Manual".to_string()),
        };
        assert_eq!(manual.provider, "codex");
    }

    #[test]
    fn data_source_enum_shape_is_stable() {
        let source = DataSource::Cache;
        assert!(matches!(source, DataSource::Cache));
    }
}
