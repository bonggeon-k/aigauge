use crate::credentials::CredentialManager;
use crate::providers::claude::ClaudeProvider;
use crate::providers::codex::CodexProvider;
use crate::providers::copilot::CopilotProvider;
use crate::providers::cursor::CursorProvider;
use crate::providers::gemini::GeminiProvider;
use crate::providers::kiro::KiroProvider;
use crate::providers::{AuthMethod, CostData, Provider, ProviderError, UsageData};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ProviderDescriptor {
    pub id: String,
    pub name: String,
    pub auth_method: AuthMethod,
}

#[derive(Default)]
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
}

impl AppState {
    pub fn new() -> Self {
        Self {
            providers: ProviderRegistry::default(),
            credential_manager: CredentialManager::new(),
        }
    }
}

impl ProviderRegistry {
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
