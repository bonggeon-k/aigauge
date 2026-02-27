use crate::credentials::CredentialManager;
use reqwest::header::{AUTHORIZATION, COOKIE};
use reqwest::Client;
use serde_json::Value;
use tracing::instrument;

use super::{
    default_http_client, not_configured_quota, not_configured_usage, unreachable_quota,
    unreachable_usage, AuthMethod, CostData, Provider, ProviderInfo, ProviderStatus, QuotaLimit,
    Result, UsageData,
};

pub struct ClaudeProvider {
    credential_manager: CredentialManager,
    client: Client,
}

impl ClaudeProvider {
    #[instrument(skip(credential_manager))]
    pub fn new(credential_manager: CredentialManager) -> Self {
        let client = default_http_client().unwrap_or_else(|_| Client::new());
        Self {
            credential_manager,
            client,
        }
    }

    async fn fetch_json(&self, credential: &str) -> std::result::Result<Value, ()> {
        let mut request = self.client.get("https://api.anthropic.com/v1/usage");
        if credential.starts_with("org_") {
            request = request.header(COOKIE, format!("organizationId={credential}"));
        } else {
            request = request
                .header(AUTHORIZATION, format!("Bearer {credential}"))
                .header("x-api-key", credential)
                .header("anthropic-version", "2023-06-01");
        }

        let response = request.send().await.map_err(|_| ())?;
        response.json::<Value>().await.map_err(|_| ())
    }
}

impl Provider for ClaudeProvider {
    async fn name(&self) -> &str {
        "claude"
    }

    async fn provider_info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "claude".to_string(),
            name: "Anthropic Claude".to_string(),
            icon: "brain".to_string(),
            auth_method: AuthMethod::ApiKey,
            plan_name: "Pro / Team".to_string(),
            quota_limit: 300_000,
            reset_period: "monthly".to_string(),
        }
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        let Some(credential) = self
            .credential_manager
            .get_credential("claude")
            .ok()
            .flatten()
        else {
            return Ok(not_configured_usage("claude"));
        };

        let value = match self.fetch_json(credential.as_str()).await {
            Ok(value) => value,
            Err(_) => return Ok(unreachable_usage("claude")),
        };

        Ok(UsageData {
            provider: "claude".to_string(),
            requests: value
                .get("requests")
                .and_then(Value::as_u64)
                .or_else(|| value.get("message_count").and_then(Value::as_u64))
                .unwrap_or(0),
            tokens: value
                .get("input_tokens")
                .and_then(Value::as_u64)
                .unwrap_or(0)
                + value
                    .get("output_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
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
        let status = usage.status.clone();
        if status == ProviderStatus::NotConfigured {
            return Ok(Some(CostData {
                provider: "claude".to_string(),
                currency: "USD".to_string(),
                total: 0.0,
                period_start: String::new(),
                period_end: String::new(),
                status,
            }));
        }

        Ok(Some(CostData {
            provider: "claude".to_string(),
            currency: "USD".to_string(),
            total: (usage.tokens as f64) * 0.000_006,
            period_start: usage.period_start,
            period_end: usage.period_end,
            status,
        }))
    }

    async fn fetch_quota(&self) -> Result<QuotaLimit> {
        let usage = self.fetch_usage().await?;
        if usage.status == ProviderStatus::NotConfigured {
            return Ok(not_configured_quota());
        }
        if usage.status == ProviderStatus::Unreachable {
            return Ok(unreachable_quota("messages"));
        }

        Ok(QuotaLimit {
            used: usage.requests,
            limit: 15_000,
            unit: "messages".to_string(),
            reset_at: usage.period_end,
            status: ProviderStatus::Ok,
        })
    }

    fn auth_method(&self) -> AuthMethod {
        AuthMethod::ApiKey
    }
}
