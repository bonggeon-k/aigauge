use crate::credentials::CredentialManager;
use reqwest::header::AUTHORIZATION;
use reqwest::Client;
use serde_json::Value;
use tracing::instrument;

use super::{
    not_configured_quota, not_configured_usage, unreachable_quota, unreachable_usage, AuthMethod,
    CostData, Provider, ProviderInfo, ProviderStatus, QuotaLimit, Result, UsageData,
};

pub struct JetBrainsProvider {
    credential_manager: CredentialManager,
    client: Client,
}

impl JetBrainsProvider {
    #[instrument(skip(credential_manager))]
    pub fn new(credential_manager: CredentialManager, client: Client) -> Self {
        // TODO(phase-5): production API integration
        Self {
            credential_manager,
            client,
        }
    }

    async fn fetch_json(&self, url: &str, credential: &str) -> std::result::Result<Value, ()> {
        let response = self
            .client
            .get(url)
            .header(AUTHORIZATION, format!("Bearer {credential}"))
            .send()
            .await
            .map_err(|_| ())?;

        response.json::<Value>().await.map_err(|_| ())
    }
}

impl Provider for JetBrainsProvider {
    async fn name(&self) -> &str {
        "jetbrains"
    }

    async fn provider_info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "jetbrains".to_string(),
            name: "JetBrains AI Assistant".to_string(),
            icon: "brain-circuit".to_string(),
            auth_method: AuthMethod::ApiKey,
            plan_name: "AI Pro".to_string(),
            quota_limit: 150_000,
            reset_period: "monthly".to_string(),
        }
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        let Some(credential) = self
            .credential_manager
            .get_credential("jetbrains")
            .ok()
            .flatten()
        else {
            return Ok(not_configured_usage("jetbrains"));
        };

        let value = match self
            .fetch_json(
                "https://api.jetbrains.ai/assistant/usage",
                credential.as_str(),
            )
            .await
        {
            Ok(value) => value,
            Err(_) => return Ok(unreachable_usage("jetbrains")),
        };

        Ok(UsageData {
            provider: "jetbrains".to_string(),
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
        let Some(credential) = self
            .credential_manager
            .get_credential("jetbrains")
            .ok()
            .flatten()
        else {
            return Ok(Some(CostData {
                provider: "jetbrains".to_string(),
                currency: "USD".to_string(),
                total: 0.0,
                period_start: String::new(),
                period_end: String::new(),
                status: ProviderStatus::NotConfigured,
            }));
        };

        let value = match self
            .fetch_json(
                "https://api.jetbrains.ai/assistant/cost",
                credential.as_str(),
            )
            .await
        {
            Ok(value) => value,
            Err(_) => {
                return Ok(Some(CostData {
                    provider: "jetbrains".to_string(),
                    currency: "USD".to_string(),
                    total: 0.0,
                    period_start: String::new(),
                    period_end: String::new(),
                    status: ProviderStatus::Unreachable,
                }));
            }
        };

        Ok(Some(CostData {
            provider: "jetbrains".to_string(),
            currency: value
                .get("currency")
                .and_then(Value::as_str)
                .unwrap_or("USD")
                .to_string(),
            total: value.get("total").and_then(Value::as_f64).unwrap_or(0.0),
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
            limit: 150_000,
            unit: "tokens".to_string(),
            reset_at: usage.period_end,
            status: ProviderStatus::Ok,
        })
    }

    fn auth_method(&self) -> AuthMethod {
        AuthMethod::ApiKey
    }
}
