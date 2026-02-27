use crate::credentials::CredentialManager;
use reqwest::Client;
use serde_json::Value;
use tracing::instrument;

use super::{
    not_configured_quota, not_configured_usage, unreachable_quota,
    unreachable_usage, AuthMethod, CostData, Provider, ProviderInfo, ProviderStatus, QuotaLimit,
    Result, UsageData,
};

pub struct GeminiProvider {
    credential_manager: CredentialManager,
    client: Client,
}

impl GeminiProvider {
    #[instrument(skip(credential_manager))]
    pub fn new(credential_manager: CredentialManager, client: Client) -> Self {
        Self {
            credential_manager,
            client,
        }
    }
}

impl Provider for GeminiProvider {
    async fn name(&self) -> &str {
        "gemini"
    }

    async fn provider_info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "gemini".to_string(),
            name: "Google Gemini".to_string(),
            icon: "sparkles".to_string(),
            auth_method: AuthMethod::ApiKey,
            plan_name: "Gemini Advanced".to_string(),
            quota_limit: 500_000,
            reset_period: "daily".to_string(),
        }
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        let Some(credential) = self
            .credential_manager
            .get_credential("gemini")
            .ok()
            .flatten()
        else {
            return Ok(not_configured_usage("gemini"));
        };

        let endpoint = format!(
            "https://generativelanguage.googleapis.com/v1beta/models?key={}",
            credential.as_str()
        );

        let value = match self.client.get(endpoint).send().await {
            Ok(response) => response.json::<Value>().await.ok(),
            Err(_) => None,
        };

        let Some(value) = value else {
            return Ok(unreachable_usage("gemini"));
        };

        let model_count = value
            .get("models")
            .and_then(Value::as_array)
            .map(|models| models.len() as u64)
            .unwrap_or(0);

        Ok(UsageData {
            provider: "gemini".to_string(),
            requests: model_count,
            tokens: model_count.saturating_mul(1_000),
            period_start: String::new(),
            period_end: String::new(),
            status: ProviderStatus::Ok,
        })
    }

    async fn fetch_cost(&self) -> Result<Option<CostData>> {
        let usage = self.fetch_usage().await?;
        Ok(Some(CostData {
            provider: "gemini".to_string(),
            currency: "USD".to_string(),
            total: (usage.tokens as f64) * 0.000_003_5,
            period_start: usage.period_start,
            period_end: usage.period_end,
            status: usage.status,
        }))
    }

    async fn fetch_quota(&self) -> Result<QuotaLimit> {
        let usage = self.fetch_usage().await?;
        if usage.status == ProviderStatus::NotConfigured {
            return Ok(not_configured_quota());
        }
        if usage.status == ProviderStatus::Unreachable {
            return Ok(unreachable_quota("tokens"));
        }

        Ok(QuotaLimit {
            used: usage.tokens,
            limit: 500_000,
            unit: "tokens".to_string(),
            reset_at: String::new(),
            status: ProviderStatus::Ok,
        })
    }

    fn auth_method(&self) -> AuthMethod {
        AuthMethod::ApiKey
    }
}
