use crate::config::ConfigStore;
use crate::credentials::CredentialManager;
use crate::providers::claude::ClaudeProvider;
use crate::providers::codex::CodexProvider;
use crate::providers::copilot::CopilotProvider;
use crate::providers::cursor::CursorProvider;
use crate::providers::gemini::GeminiProvider;
use crate::providers::kiro::KiroProvider;
use crate::providers::{
    AuthMethod, CostData, Provider, ProviderError, ProviderInfo, ProviderStatus, QuotaLimit,
    UsageData,
};
use chrono::Utc;
use serde::Serialize;
use tracing::instrument;

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

pub struct ProviderRegistry {
    codex: CodexProvider,
    claude: ClaudeProvider,
    gemini: GeminiProvider,
    kiro: KiroProvider,
    copilot: CopilotProvider,
    cursor: CursorProvider,
}

pub struct AppState {
    pub providers: ProviderRegistry,
    pub credential_manager: CredentialManager,
    pub config_store: ConfigStore,
}

impl AppState {
    #[instrument]
    pub fn new() -> Self {
        let credential_manager = CredentialManager::new();
        Self {
            providers: ProviderRegistry::new(credential_manager.clone()),
            credential_manager,
            config_store: ConfigStore,
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderRegistry {
    pub fn new(credential_manager: CredentialManager) -> Self {
        Self {
            codex: CodexProvider::new(credential_manager.clone()),
            claude: ClaudeProvider::new(credential_manager.clone()),
            gemini: GeminiProvider::new(credential_manager.clone()),
            kiro: KiroProvider::new(credential_manager.clone()),
            copilot: CopilotProvider::new(credential_manager.clone()),
            cursor: CursorProvider::new(credential_manager),
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
            _ => Err(ProviderError::Operation(format!(
                "unsupported provider: {provider}"
            ))),
        }
    }
}

#[instrument(skip(state), fields(provider = provider))]
pub async fn provider_health(
    provider: &str,
    state: &AppState,
) -> std::result::Result<HealthStatus, ProviderError> {
    let configured = state
        .credential_manager
        .has_credential(provider)
        .map_err(|error| ProviderError::Operation(error.to_string()))?;

    let usage = state.providers.usage_for(provider).await?;
    let reachable = matches!(usage.status, ProviderStatus::Ok) && configured;

    Ok(HealthStatus {
        configured,
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
) -> Result<UsageData, String> {
    state
        .providers
        .usage_for(provider.as_str())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_cost(
    provider: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<CostData>, String> {
    state
        .providers
        .cost_for(provider.as_str())
        .await
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
) -> Result<QuotaLimit, String> {
    state
        .providers
        .quota_for(provider.as_str())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_all_dashboard_data(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DashboardEntry>, String> {
    let providers = ["codex", "claude", "gemini", "kiro", "copilot", "cursor"];
    let mut entries = Vec::with_capacity(providers.len());

    for provider in providers {
        let info = state
            .providers
            .info_for(provider)
            .await
            .map_err(|error| error.to_string())?;
        let usage = state
            .providers
            .usage_for(provider)
            .await
            .map_err(|error| error.to_string())?;
        let quota = state
            .providers
            .quota_for(provider)
            .await
            .map_err(|error| error.to_string())?;
        let cost = state
            .providers
            .cost_for(provider)
            .await
            .map_err(|error| error.to_string())?;
        let health = provider_health(provider, &state)
            .await
            .map_err(|error| error.to_string())?;

        entries.push(DashboardEntry {
            info,
            usage,
            quota,
            cost,
            health,
        });
    }

    Ok(entries)
}

#[tauri::command]
pub async fn check_provider_health(
    provider: String,
    state: tauri::State<'_, AppState>,
) -> Result<HealthStatus, String> {
    provider_health(provider.as_str(), &state)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn health_reports_not_configured() {
        let state = AppState::new();
        let health = provider_health("codex", &state)
            .await
            .expect("health should return data");

        assert!(!health.configured);
        assert!(!health.reachable);
        assert!(!health.last_checked.is_empty());
    }
}
