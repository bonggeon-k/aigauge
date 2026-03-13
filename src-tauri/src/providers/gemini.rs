use crate::credentials::CredentialManager;
use reqwest::header::AUTHORIZATION;
use reqwest::Client;
use serde_json::Value;
use tracing::instrument;

use super::{
    not_configured_quota, not_configured_usage, unreachable_quota, unreachable_usage, AuthMethod,
    AuthSourceMode, CostData, Provider, ProviderInfo, ProviderStatus, QuotaLimit, Result,
    UsageData,
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

    fn parse_quota_number(raw: &Value) -> Option<u64> {
        raw.as_u64()
            .or_else(|| raw.as_f64().map(|number| number.round() as u64))
            .or_else(|| raw.as_i64().map(|number| number.max(0) as u64))
    }

    fn read_quota_number(value: &Value, paths: &[&str]) -> u64 {
        for path in paths {
            if path.starts_with('/') {
                if let Some(found) = value.pointer(path).and_then(Self::parse_quota_number) {
                    return found;
                }
                continue;
            }

            if let Some(found) = value.get(*path).and_then(Self::parse_quota_number) {
                return found;
            }
        }
        0
    }

    fn read_reset_at(value: &Value) -> String {
        for path in ["/resetAt", "/reset_at", "/quota/resetAt", "/quota/reset_at"] {
            if let Some(reset_at) = value.pointer(path).and_then(Value::as_str) {
                return reset_at.to_string();
            }
        }
        String::new()
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
            supported_auth_modes: vec![AuthSourceMode::ApiKey],
            default_auth_mode: AuthSourceMode::ApiKey,
            plan_name: "Gemini API".to_string(),
            quota_limit: 100,
            reset_period: "daily".to_string(),
        }
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        let credential = self
            .credential_manager
            .get_credential("gemini")
            .ok()
            .flatten()
            .map(|value| value.to_string())
            .filter(|value| !value.trim().is_empty());

        let Some(secret) = credential else {
            return Ok(not_configured_usage("gemini"));
        };

        let mut request = self
            .client
            .post("https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota")
            .json(&serde_json::json!({}));

        if secret.starts_with("AIza") {
            request = request.query(&[("key", secret.as_str())]);
        } else {
            request = request.header(AUTHORIZATION, format!("Bearer {secret}"));
        }

        let response = match request.send().await {
            Ok(response) => response,
            Err(_) => return Ok(unreachable_usage("gemini")),
        };

        if response.status().as_u16() == 401 || response.status().as_u16() == 403 {
            return Ok(not_configured_usage("gemini"));
        }
        if !response.status().is_success() {
            return Ok(unreachable_usage("gemini"));
        }

        let value = match response.json::<Value>().await {
            Ok(value) => value,
            Err(_) => return Ok(unreachable_usage("gemini")),
        };

        let used = Self::read_quota_number(&value, &["quotaUsed", "/quota/used", "quota_used"]);
        let limit = Self::read_quota_number(&value, &["quotaLimit", "/quota/limit", "quota_limit"]);
        let reset_at = Self::read_reset_at(&value);

        Ok(UsageData {
            provider: "gemini".to_string(),
            requests: used,
            tokens: limit,
            period_start: String::new(),
            period_end: reset_at,
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
        AuthMethod::ApiKey
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_nested_quota_shape() {
        let payload = serde_json::json!({
            "quota": {
                "used": 120.0,
                "limit": 300.0,
                "resetAt": "2026-03-01"
            }
        });
        assert_eq!(
            GeminiProvider::read_quota_number(&payload, &["quotaUsed", "/quota/used"]),
            120
        );
        assert_eq!(
            GeminiProvider::read_quota_number(&payload, &["quotaLimit", "/quota/limit"]),
            300
        );
        assert_eq!(GeminiProvider::read_reset_at(&payload), "2026-03-01");
    }
}
