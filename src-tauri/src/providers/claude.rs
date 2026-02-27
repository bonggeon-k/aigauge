use crate::credentials::CredentialManager;
use reqwest::header::AUTHORIZATION;
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tracing::instrument;

use once_cell::sync::Lazy;

use super::{
    not_configured_quota, not_configured_usage, unreachable_quota, unreachable_usage, AuthMethod,
    CostData, Provider, ProviderInfo, ProviderStatus, QuotaLimit, Result, UsageData,
};

static LAST_PLAN: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new("Unknown".to_string()));

#[derive(Debug, Deserialize)]
struct ClaudeCredentials {
    #[serde(rename = "claudeAiOauth")]
    claude_ai_oauth: Option<ClaudeOauth>,
}

#[derive(Debug, Clone, Deserialize)]
struct ClaudeOauth {
    #[serde(rename = "accessToken")]
    access_token: Option<String>,
    #[serde(rename = "expiresAt")]
    expires_at: Option<i64>,
    scopes: Option<Vec<String>>,
}

pub struct ClaudeProvider {
    credential_manager: CredentialManager,
    client: Client,
}

impl ClaudeProvider {
    #[instrument(skip(credential_manager))]
    pub fn new(credential_manager: CredentialManager, client: Client) -> Self {
        Self {
            credential_manager,
            client,
        }
    }

    fn credentials_path() -> Option<PathBuf> {
        std::env::var("HOME").ok().map(|home| {
            PathBuf::from(home)
                .join(".claude")
                .join(".credentials.json")
        })
    }

    fn read_oauth() -> Option<ClaudeOauth> {
        let path = Self::credentials_path()?;
        let raw = fs::read_to_string(path).ok()?;
        let credentials: ClaudeCredentials = serde_json::from_str(raw.as_str()).ok()?;
        credentials.claude_ai_oauth
    }

    fn is_valid_oauth(oauth: &ClaudeOauth) -> bool {
        let now_ms = chrono::Utc::now().timestamp_millis();
        let expires_ok = oauth.expires_at.map(|exp| exp > now_ms).unwrap_or(false);
        let scope_ok = oauth
            .scopes
            .as_ref()
            .map(|scopes| scopes.iter().any(|scope| scope == "user:profile"))
            .unwrap_or(false);
        expires_ok && scope_ok
    }

    fn parse_plan(tier: &str) -> String {
        let tier = tier.to_lowercase();
        if tier.contains("pro_max_5") {
            "Claude Max".to_string()
        } else if tier.contains("team") {
            "Team".to_string()
        } else if tier.contains("pro") {
            "Pro".to_string()
        } else if tier.contains("free") {
            "Free".to_string()
        } else {
            "Unknown".to_string()
        }
    }

    fn utilization_to_percent(utilization: Option<f64>) -> u64 {
        (utilization.unwrap_or(0.0) * 100.0).round() as u64
    }
}

impl Provider for ClaudeProvider {
    async fn name(&self) -> &str {
        "claude"
    }

    async fn provider_info(&self) -> ProviderInfo {
        let plan = LAST_PLAN
            .lock()
            .map(|value| value.clone())
            .unwrap_or_else(|_| "Unknown".to_string());
        ProviderInfo {
            id: "claude".to_string(),
            name: "Anthropic Claude".to_string(),
            icon: "brain".to_string(),
            auth_method: AuthMethod::OAuth,
            plan_name: plan,
            quota_limit: 100,
            reset_period: "rolling".to_string(),
        }
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        let oauth = Self::read_oauth();
        let token = oauth
            .as_ref()
            .and_then(|oauth| oauth.access_token.clone())
            .filter(|_| oauth.as_ref().map(Self::is_valid_oauth).unwrap_or(false))
            .or_else(|| {
                self.credential_manager
                    .get_credential("claude")
                    .ok()
                    .flatten()
                    .map(|value| value.to_string())
            });

        let Some(token) = token else {
            return Ok(not_configured_usage("claude"));
        };

        let response = self
            .client
            .get("https://api.claude.ai/api/usage")
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .send()
            .await;

        let value = match response {
            Ok(response) => match response.json::<Value>().await {
                Ok(value) => value,
                Err(_) => return Ok(unreachable_usage("claude")),
            },
            Err(_) => return Ok(unreachable_usage("claude")),
        };

        let five_hour = Self::utilization_to_percent(
            value
                .pointer("/fiveHour/utilization")
                .and_then(Value::as_f64),
        );
        let seven_day = Self::utilization_to_percent(
            value
                .pointer("/sevenDay/utilization")
                .and_then(Value::as_f64),
        );

        let tier = value
            .get("rateLimitTier")
            .and_then(Value::as_str)
            .unwrap_or("unknown");

        if let Ok(mut guard) = LAST_PLAN.lock() {
            *guard = Self::parse_plan(tier);
        }

        Ok(UsageData {
            provider: "claude".to_string(),
            requests: five_hour,
            tokens: seven_day,
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
            return Ok(unreachable_quota("percent"));
        }

        Ok(QuotaLimit {
            used: usage.requests.max(usage.tokens),
            limit: 100,
            unit: "percent".to_string(),
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
    fn tier_to_plan() {
        assert_eq!(ClaudeProvider::parse_plan("pro_max_5"), "Claude Max");
        assert_eq!(ClaudeProvider::parse_plan("team_business"), "Team");
        assert_eq!(ClaudeProvider::parse_plan("pro"), "Pro");
        assert_eq!(ClaudeProvider::parse_plan("free_tier"), "Free");
    }

    #[test]
    fn valid_oauth_requires_scope_and_expiry() {
        let oauth = ClaudeOauth {
            access_token: Some("x".to_string()),
            expires_at: Some(chrono::Utc::now().timestamp_millis() + 60000),
            scopes: Some(vec!["user:profile".to_string()]),
        };
        assert!(ClaudeProvider::is_valid_oauth(&oauth));
    }
}
