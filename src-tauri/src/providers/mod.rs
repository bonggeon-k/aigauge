pub mod claude;
pub mod codex;
pub mod copilot;
pub mod cursor;
pub mod gemini;
pub mod jetbrains;
pub mod kiro;

use crate::platform;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
    ApiKey,
    OAuth,
    Token,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderStatus {
    Ok,
    NotConfigured,
    Unreachable,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UsageData {
    pub provider: String,
    pub requests: u64,
    pub tokens: u64,
    pub period_start: String,
    pub period_end: String,
    pub status: ProviderStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CostData {
    pub provider: String,
    pub currency: String,
    pub total: f64,
    pub period_start: String,
    pub period_end: String,
    pub status: ProviderStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub auth_method: AuthMethod,
    pub plan_name: String,
    pub quota_limit: u64,
    pub reset_period: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct QuotaLimit {
    pub used: u64,
    pub limit: u64,
    pub unit: String,
    pub reset_at: String,
    pub status: ProviderStatus,
}

#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("provider operation failed: {0}")]
    Operation(String),
}

pub type Result<T> = std::result::Result<T, ProviderError>;

pub fn not_configured_usage(provider: &str) -> UsageData {
    UsageData {
        provider: provider.to_string(),
        requests: 0,
        tokens: 0,
        period_start: String::new(),
        period_end: String::new(),
        status: ProviderStatus::NotConfigured,
    }
}

pub fn not_configured_quota() -> QuotaLimit {
    QuotaLimit {
        used: 0,
        limit: 0,
        unit: "tokens".to_string(),
        reset_at: String::new(),
        status: ProviderStatus::NotConfigured,
    }
}

pub fn unreachable_usage(provider: &str) -> UsageData {
    UsageData {
        provider: provider.to_string(),
        requests: 0,
        tokens: 0,
        period_start: String::new(),
        period_end: String::new(),
        status: ProviderStatus::Unreachable,
    }
}

pub fn unreachable_quota(unit: &str) -> QuotaLimit {
    QuotaLimit {
        used: 0,
        limit: 0,
        unit: unit.to_string(),
        reset_at: String::new(),
        status: ProviderStatus::Unreachable,
    }
}

pub fn build_shared_http_client() -> Result<Client> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .pool_idle_timeout(Duration::from_secs(90))
        .pool_max_idle_per_host(8)
        .build()
        .map_err(|error| ProviderError::Operation(format!("failed to build http client: {error}")))
}

pub fn home_dir() -> Option<PathBuf> {
    platform::home_dir()
}

#[allow(async_fn_in_trait)]
pub trait Provider: Send + Sync {
    async fn name(&self) -> &str;
    async fn provider_info(&self) -> ProviderInfo;
    async fn fetch_usage(&self) -> Result<UsageData>;
    async fn fetch_cost(&self) -> Result<Option<CostData>>;
    async fn fetch_quota(&self) -> Result<QuotaLimit>;
    fn auth_method(&self) -> AuthMethod;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::CredentialManager;
    use crate::providers::claude::ClaudeProvider;
    use crate::providers::codex::CodexProvider;
    use crate::providers::copilot::CopilotProvider;
    use crate::providers::cursor::CursorProvider;
    use crate::providers::gemini::GeminiProvider;
    use crate::providers::jetbrains::JetBrainsProvider;
    use crate::providers::kiro::KiroProvider;

    async fn assert_provider_shape<P: Provider>(provider: &P) {
        let name = provider.name().await;
        assert!(!name.is_empty());

        let info = provider.provider_info().await;
        assert_eq!(info.id, name);

        let usage = provider
            .fetch_usage()
            .await
            .expect("usage should return data");
        assert_eq!(usage.provider, name);

        let quota = provider
            .fetch_quota()
            .await
            .expect("quota should return data");
        assert!(!quota.unit.is_empty());

        let _ = provider
            .fetch_cost()
            .await
            .expect("cost should return data");
    }

    #[tokio::test]
    async fn providers_return_expected_shapes() {
        let manager = CredentialManager::new();
        let client = build_shared_http_client().expect("client should build");
        assert_provider_shape(&CodexProvider::new(manager.clone(), client.clone())).await;
        assert_provider_shape(&ClaudeProvider::new(manager.clone(), client.clone())).await;
        assert_provider_shape(&GeminiProvider::new(manager.clone(), client.clone())).await;
        assert_provider_shape(&KiroProvider::new(manager.clone(), client.clone())).await;
        assert_provider_shape(&CopilotProvider::new(manager.clone(), client.clone())).await;
        assert_provider_shape(&CursorProvider::new(manager.clone(), client.clone())).await;
        assert_provider_shape(&JetBrainsProvider::new(manager, client)).await;
    }
}
