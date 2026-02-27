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
    home_dir, not_configured_quota, not_configured_usage, unreachable_quota, unreachable_usage,
    AuthMethod, CostData, Provider, ProviderInfo, ProviderStatus, QuotaLimit, Result, UsageData,
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
    expires_at: Option<f64>,
    #[serde(rename = "rateLimitTier")]
    rate_limit_tier: Option<String>,
    scopes: Option<Vec<String>>,
}

enum UsageFetchResult {
    Ok(Value),
    NotConfigured,
    Unreachable,
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
        home_dir().map(|home| home.join(".claude").join(".credentials.json"))
    }

    fn read_oauth() -> Option<ClaudeOauth> {
        let path = Self::credentials_path()?;
        let raw = fs::read_to_string(path).ok()?;
        let credentials: ClaudeCredentials = serde_json::from_str(raw.as_str()).ok()?;
        credentials.claude_ai_oauth
    }

    fn is_valid_oauth(oauth: &ClaudeOauth) -> bool {
        let now_ms = chrono::Utc::now().timestamp_millis();
        let min_valid_until_ms = now_ms + 5 * 60 * 1000;
        let expires_ok = oauth
            .expires_at
            .map(|exp| exp > min_valid_until_ms as f64)
            .unwrap_or(false);
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
        } else if tier.contains("pro") {
            "Pro".to_string()
        } else if tier.contains("team") {
            "Team".to_string()
        } else if tier.contains("free") {
            "Free".to_string()
        } else {
            "Unknown".to_string()
        }
    }

    fn utilization_to_percent(utilization: Option<f64>) -> u64 {
        let raw = utilization.unwrap_or(0.0);
        let percent = if raw <= 1.0 { raw * 100.0 } else { raw };
        percent.clamp(0.0, 100.0).round() as u64
    }

    fn utilization_from_paths(value: &Value, paths: &[&str]) -> u64 {
        for path in paths {
            if let Some(utilization) = value.pointer(path).and_then(Value::as_f64) {
                return Self::utilization_to_percent(Some(utilization));
            }
        }
        0
    }

    fn reset_from_paths(value: &Value, paths: &[&str]) -> String {
        for path in paths {
            if let Some(reset_at) = value.pointer(path).and_then(Value::as_str) {
                return reset_at.to_string();
            }
        }
        String::new()
    }

    async fn fetch_usage_json_for_url(&self, token: &str, url: &str) -> UsageFetchResult {
        let response = match self
            .client
            .get(url)
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header("Accept", "application/json")
            .header("User-Agent", "AIGauge")
            .send()
            .await
        {
            Ok(response) => response,
            Err(_) => return UsageFetchResult::Unreachable,
        };

        if response.status().as_u16() == 401 || response.status().as_u16() == 403 {
            return UsageFetchResult::NotConfigured;
        }
        if !response.status().is_success() {
            return UsageFetchResult::Unreachable;
        }

        match response.json::<Value>().await {
            Ok(value) => UsageFetchResult::Ok(value),
            Err(_) => UsageFetchResult::Unreachable,
        }
    }

    async fn fetch_usage_json(&self, token: &str) -> UsageFetchResult {
        let endpoints = [
            "https://api.claude.ai/api/usage",
            "https://claude.ai/api/usage",
        ];
        for endpoint in endpoints {
            match self.fetch_usage_json_for_url(token, endpoint).await {
                UsageFetchResult::Ok(value) => return UsageFetchResult::Ok(value),
                UsageFetchResult::NotConfigured => return UsageFetchResult::NotConfigured,
                UsageFetchResult::Unreachable => continue,
            }
        }
        UsageFetchResult::Unreachable
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

        let value = match self.fetch_usage_json(token.as_str()).await {
            UsageFetchResult::Ok(value) => value,
            UsageFetchResult::NotConfigured => return Ok(not_configured_usage("claude")),
            UsageFetchResult::Unreachable => return Ok(unreachable_usage("claude")),
        };

        let five_hour = Self::utilization_from_paths(
            &value,
            &["/five_hour/utilization", "/fiveHour/utilization"],
        );
        let seven_day = Self::utilization_from_paths(
            &value,
            &["/seven_day/utilization", "/sevenDay/utilization"],
        );
        let seven_day_sonnet = Self::utilization_from_paths(
            &value,
            &[
                "/seven_day_sonnet/utilization",
                "/sevenDaySonnet/utilization",
            ],
        );
        let seven_day_opus = Self::utilization_from_paths(
            &value,
            &["/seven_day_opus/utilization", "/sevenDayOpus/utilization"],
        );

        let tier = value
            .pointer("/rate_limit_tier")
            .and_then(Value::as_str)
            .or_else(|| value.get("rateLimitTier").and_then(Value::as_str))
            .or_else(|| {
                oauth
                    .as_ref()
                    .and_then(|oauth| oauth.rate_limit_tier.as_deref())
            })
            .unwrap_or("unknown");

        if let Ok(mut guard) = LAST_PLAN.lock() {
            *guard = Self::parse_plan(tier);
        }

        let reset_at = Self::reset_from_paths(
            &value,
            &[
                "/seven_day_opus/resets_at",
                "/seven_day_sonnet/resets_at",
                "/seven_day/resets_at",
                "/sevenDayOpus/resetsAt",
                "/sevenDaySonnet/resetsAt",
                "/sevenDay/resetsAt",
                "/five_hour/resets_at",
                "/fiveHour/resetsAt",
            ],
        );
        let weekly = seven_day.max(seven_day_sonnet).max(seven_day_opus);

        Ok(UsageData {
            provider: "claude".to_string(),
            requests: five_hour,
            tokens: weekly,
            period_start: String::new(),
            period_end: reset_at,
            status: ProviderStatus::Ok,
        })
    }

    async fn fetch_cost(&self) -> Result<Option<CostData>> {
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
            return Ok(None);
        };

        let value = match self.fetch_usage_json(token.as_str()).await {
            UsageFetchResult::Ok(value) => value,
            UsageFetchResult::NotConfigured | UsageFetchResult::Unreachable => return Ok(None),
        };

        let enabled = value
            .pointer("/extra_usage/is_enabled")
            .and_then(Value::as_bool)
            .or_else(|| {
                value
                    .pointer("/extraUsage/isEnabled")
                    .and_then(Value::as_bool)
            })
            .unwrap_or(false);
        if !enabled {
            return Ok(None);
        }

        let total = value
            .pointer("/extra_usage/used_credits")
            .and_then(Value::as_f64)
            .or_else(|| {
                value
                    .pointer("/extraUsage/usedCredits")
                    .and_then(Value::as_f64)
            })
            .unwrap_or(0.0);
        let currency = value
            .pointer("/extra_usage/currency")
            .and_then(Value::as_str)
            .or_else(|| {
                value
                    .pointer("/extraUsage/currency")
                    .and_then(Value::as_str)
            })
            .unwrap_or("USD")
            .to_string();

        Ok(Some(CostData {
            provider: "claude".to_string(),
            currency,
            total,
            period_start: String::new(),
            period_end: String::new(),
            status: ProviderStatus::Ok,
        }))
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
            expires_at: Some((chrono::Utc::now().timestamp_millis() + 600000) as f64),
            rate_limit_tier: None,
            scopes: Some(vec!["user:profile".to_string()]),
        };
        assert!(ClaudeProvider::is_valid_oauth(&oauth));
    }

    #[test]
    fn oauth_expiring_soon_is_rejected() {
        let oauth = ClaudeOauth {
            access_token: Some("x".to_string()),
            expires_at: Some((chrono::Utc::now().timestamp_millis() + 60_000) as f64),
            rate_limit_tier: None,
            scopes: Some(vec!["user:profile".to_string()]),
        };
        assert!(!ClaudeProvider::is_valid_oauth(&oauth));
    }
}
