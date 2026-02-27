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

pub struct CodexProvider {
    credential_manager: CredentialManager,
    client: Client,
}

impl CodexProvider {
    #[instrument(skip(credential_manager))]
    pub fn new(credential_manager: CredentialManager) -> Self {
        let client = default_http_client().unwrap_or_else(|_| Client::new());
        Self {
            credential_manager,
            client,
        }
    }

    async fn fetch_json(&self, url: &str, credential: &str) -> std::result::Result<Value, ()> {
        let mut request = self.client.get(url);
        if credential.starts_with("sess_") {
            request = request.header(
                COOKIE,
                format!("__Secure-next-auth.session-token={credential}"),
            );
        } else {
            request = request.header(AUTHORIZATION, format!("Bearer {credential}"));
        }

        let response = request.send().await.map_err(|_| ())?;
        response.json::<Value>().await.map_err(|_| ())
    }

    fn parse_usage(&self, value: &Value) -> UsageData {
        let requests = value
            .get("requests")
            .and_then(Value::as_u64)
            .or_else(|| value.get("n_requests").and_then(Value::as_u64))
            .unwrap_or(0);
        let tokens = value
            .get("total_tokens")
            .and_then(Value::as_u64)
            .or_else(|| value.get("tokens").and_then(Value::as_u64))
            .unwrap_or(0);

        UsageData {
            provider: "codex".to_string(),
            requests,
            tokens,
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
        }
    }
}

impl Provider for CodexProvider {
    async fn name(&self) -> &str {
        "codex"
    }

    async fn provider_info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "codex".to_string(),
            name: "OpenAI Codex".to_string(),
            icon: "bot".to_string(),
            auth_method: AuthMethod::ApiKey,
            plan_name: "Usage-based".to_string(),
            quota_limit: 1_000_000,
            reset_period: "monthly".to_string(),
        }
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        let Some(credential) = self
            .credential_manager
            .get_credential("codex")
            .ok()
            .flatten()
        else {
            return Ok(not_configured_usage("codex"));
        };

        let url = "https://api.openai.com/v1/usage";
        let usage = match self.fetch_json(url, credential.as_str()).await {
            Ok(value) => self.parse_usage(&value),
            Err(_) => unreachable_usage("codex"),
        };
        Ok(usage)
    }

    async fn fetch_cost(&self) -> Result<Option<CostData>> {
        let Some(credential) = self
            .credential_manager
            .get_credential("codex")
            .ok()
            .flatten()
        else {
            return Ok(Some(CostData {
                provider: "codex".to_string(),
                currency: "USD".to_string(),
                total: 0.0,
                period_start: String::new(),
                period_end: String::new(),
                status: ProviderStatus::NotConfigured,
            }));
        };

        let url = "https://api.openai.com/v1/dashboard/billing/usage";
        let value = match self.fetch_json(url, credential.as_str()).await {
            Ok(value) => value,
            Err(_) => {
                return Ok(Some(CostData {
                    provider: "codex".to_string(),
                    currency: "USD".to_string(),
                    total: 0.0,
                    period_start: String::new(),
                    period_end: String::new(),
                    status: ProviderStatus::Unreachable,
                }));
            }
        };

        Ok(Some(CostData {
            provider: "codex".to_string(),
            currency: "USD".to_string(),
            total: value
                .get("total_usage")
                .and_then(Value::as_f64)
                .map(|amount| amount / 100.0)
                .unwrap_or(0.0),
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
            limit: 1_000_000,
            unit: "tokens".to_string(),
            reset_at: usage.period_end,
            status: ProviderStatus::Ok,
        })
    }

    fn auth_method(&self) -> AuthMethod {
        AuthMethod::ApiKey
    }
}
