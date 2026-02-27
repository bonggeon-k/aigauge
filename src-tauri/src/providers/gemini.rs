use crate::credentials::CredentialManager;
use reqwest::header::AUTHORIZATION;
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tracing::instrument;

use super::{
    not_configured_quota, not_configured_usage, unreachable_quota, unreachable_usage, AuthMethod,
    CostData, Provider, ProviderInfo, ProviderStatus, QuotaLimit, Result, UsageData,
};

#[derive(Debug, Clone, Deserialize)]
struct GeminiOauthCreds {
    access_token: Option<String>,
    expires_at: Option<i64>,
}

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

    fn creds_path() -> Option<PathBuf> {
        std::env::var("HOME")
            .ok()
            .map(|home| PathBuf::from(home).join(".gemini").join("oauth_creds.json"))
    }

    fn read_creds() -> Option<GeminiOauthCreds> {
        let path = Self::creds_path()?;
        let raw = fs::read_to_string(path).ok()?;
        serde_json::from_str(raw.as_str()).ok()
    }

    fn is_valid(creds: &GeminiOauthCreds) -> bool {
        let now = chrono::Utc::now().timestamp();
        creds.expires_at.map(|exp| exp > now).unwrap_or(false)
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
            auth_method: AuthMethod::OAuth,
            plan_name: "Gemini Advanced".to_string(),
            quota_limit: 100,
            reset_period: "daily".to_string(),
        }
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        let creds = Self::read_creds();
        let token = creds
            .as_ref()
            .and_then(|value| value.access_token.clone())
            .filter(|_| creds.as_ref().map(Self::is_valid).unwrap_or(false))
            .or_else(|| {
                self.credential_manager
                    .get_credential("gemini")
                    .ok()
                    .flatten()
                    .map(|value| value.to_string())
            });

        let Some(token) = token else {
            return Ok(not_configured_usage("gemini"));
        };

        let response = self
            .client
            .post("https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota")
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .json(&serde_json::json!({}))
            .send()
            .await;

        let value = match response {
            Ok(response) => match response.json::<Value>().await {
                Ok(value) => value,
                Err(_) => return Ok(unreachable_usage("gemini")),
            },
            Err(_) => return Ok(unreachable_usage("gemini")),
        };

        let used = value.get("quotaUsed").and_then(Value::as_u64).unwrap_or(0);
        let limit = value.get("quotaLimit").and_then(Value::as_u64).unwrap_or(0);

        Ok(UsageData {
            provider: "gemini".to_string(),
            requests: used,
            tokens: limit,
            period_start: String::new(),
            period_end: String::new(),
            status: ProviderStatus::Ok,
        })
    }

    async fn fetch_cost(&self) -> Result<Option<CostData>> {
        Ok(None)
    }

    async fn fetch_quota(&self) -> Result<QuotaLimit> {
        let usage = self.fetch_usage().await?;
        if usage.status == ProviderStatus::NotConfigured {
            return Ok(not_configured_quota());
        }
        if usage.status == ProviderStatus::Unreachable {
            return Ok(unreachable_quota("requests"));
        }

        Ok(QuotaLimit {
            used: usage.requests,
            limit: usage.tokens,
            unit: "requests".to_string(),
            reset_at: usage.period_end,
            status: ProviderStatus::Ok,
        })
    }

    fn auth_method(&self) -> AuthMethod {
        AuthMethod::OAuth
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_expiry() {
        let valid = GeminiOauthCreds {
            access_token: Some("x".to_string()),
            expires_at: Some(chrono::Utc::now().timestamp() + 100),
        };
        assert!(GeminiProvider::is_valid(&valid));
    }
}
