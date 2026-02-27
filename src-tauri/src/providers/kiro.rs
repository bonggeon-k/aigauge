use crate::credentials::CredentialManager;
use reqwest::header::AUTHORIZATION;
use reqwest::Client;
use serde_json::Value;
use tracing::instrument;

use super::{
    default_http_client, not_configured_quota, not_configured_usage, unreachable_quota,
    unreachable_usage, AuthMethod, CostData, Provider, ProviderInfo, ProviderStatus, QuotaLimit,
    Result, UsageData,
};

pub struct KiroProvider {
    credential_manager: CredentialManager,
    client: Client,
}

impl KiroProvider {
    #[instrument(skip(credential_manager))]
    pub fn new(credential_manager: CredentialManager) -> Self {
        let client = default_http_client().unwrap_or_else(|_| Client::new());
        Self {
            credential_manager,
            client,
        }
    }
}

impl Provider for KiroProvider {
    async fn name(&self) -> &str {
        "kiro"
    }

    async fn provider_info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "kiro".to_string(),
            name: "Kiro".to_string(),
            icon: "cpu".to_string(),
            auth_method: AuthMethod::Token,
            plan_name: "Preview".to_string(),
            quota_limit: 120_000,
            reset_period: "weekly".to_string(),
        }
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        let Some(credential) = self
            .credential_manager
            .get_credential("kiro")
            .ok()
            .flatten()
        else {
            return Ok(not_configured_usage("kiro"));
        };

        let value = match self
            .client
            .get("https://api.kiro.dev/v1/usage")
            .header(AUTHORIZATION, format!("Bearer {}", credential.as_str()))
            .send()
            .await
        {
            Ok(response) => response.json::<Value>().await.ok(),
            Err(_) => None,
        };

        let Some(value) = value else {
            return Ok(unreachable_usage("kiro"));
        };

        Ok(UsageData {
            provider: "kiro".to_string(),
            requests: value.get("requests").and_then(Value::as_u64).unwrap_or(0),
            tokens: value.get("tokens").and_then(Value::as_u64).unwrap_or(0),
            period_start: value
                .get("period_start")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            period_end: value
                .get("period_end")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            status: ProviderStatus::Ok,
        })
    }

    async fn fetch_cost(&self) -> Result<Option<CostData>> {
        let usage = self.fetch_usage().await?;
        Ok(Some(CostData {
            provider: "kiro".to_string(),
            currency: "USD".to_string(),
            total: (usage.tokens as f64) * 0.000_002,
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
            limit: 120_000,
            unit: "tokens".to_string(),
            reset_at: usage.period_end,
            status: ProviderStatus::Ok,
        })
    }

    fn auth_method(&self) -> AuthMethod {
        AuthMethod::Token
    }
}
