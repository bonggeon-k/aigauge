use crate::credentials::CredentialManager;
use reqwest::header::AUTHORIZATION;
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tracing::instrument;

use super::{
    home_dir, not_configured_quota, not_configured_usage, unreachable_quota, unreachable_usage,
    AuthMethod, CostData, Provider, ProviderInfo, ProviderStatus, QuotaLimit, Result, UsageData,
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
        home_dir().map(|home| home.join(".gemini").join("oauth_creds.json"))
    }

    fn read_creds() -> Option<GeminiOauthCreds> {
        let path = Self::creds_path()?;
        let raw = fs::read_to_string(path).ok()?;
        serde_json::from_str(raw.as_str()).ok()
    }

    fn is_valid(creds: &GeminiOauthCreds) -> bool {
        let now = chrono::Utc::now().timestamp();
        let min_valid_until = now + 5 * 60;
        creds
            .expires_at
            .map(|exp| exp > min_valid_until)
            .unwrap_or(false)
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

        let response = match response {
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
            expires_at: Some(chrono::Utc::now().timestamp() + 1000),
        };
        assert!(GeminiProvider::is_valid(&valid));
    }

    #[test]
    fn rejects_expiring_soon_token() {
        let invalid = GeminiOauthCreds {
            access_token: Some("x".to_string()),
            expires_at: Some(chrono::Utc::now().timestamp() + 30),
        };
        assert!(!GeminiProvider::is_valid(&invalid));
    }

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
