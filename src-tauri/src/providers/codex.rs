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
struct CodexAuth {
    #[serde(rename = "OPENAI_API_KEY")]
    openai_api_key: Option<String>,
    tokens: Option<CodexTokens>,
}

#[derive(Debug, Deserialize)]
struct CodexTokens {
    access_token: Option<String>,
}

#[derive(Debug, Clone)]
struct CodexQuotaState {
    five_hour_session_pct: f64,
    weekly_limit_pct: f64,
    reset_at: String,
}

pub struct CodexProvider {
    credential_manager: CredentialManager,
    client: Client,
}

impl CodexProvider {
    #[instrument(skip(credential_manager))]
    pub fn new(credential_manager: CredentialManager, client: Client) -> Self {
        Self {
            credential_manager,
            client,
        }
    }

    fn auth_path() -> Option<PathBuf> {
        std::env::var("HOME")
            .ok()
            .map(|home| PathBuf::from(home).join(".codex").join("auth.json"))
    }

    fn read_token_from_auth_file() -> Option<String> {
        let path = Self::auth_path()?;
        let raw = fs::read_to_string(path).ok()?;
        let auth: CodexAuth = serde_json::from_str(raw.as_str()).ok()?;
        auth.openai_api_key
            .or_else(|| auth.tokens.and_then(|tokens| tokens.access_token))
    }

    fn parse_plan(value: &Value) -> String {
        let raw = value
            .pointer("/rate_limit/plan")
            .and_then(Value::as_str)
            .or_else(|| value.pointer("/plan").and_then(Value::as_str))
            .or_else(|| value.pointer("/subscription/plan").and_then(Value::as_str))
            .unwrap_or("unknown")
            .to_lowercase();

        if raw.contains("enterprise") {
            "Enterprise".to_string()
        } else if raw.contains("team") {
            "Team".to_string()
        } else if raw.contains("pro") {
            "Pro".to_string()
        } else if raw.contains("plus") {
            "Plus".to_string()
        } else {
            "Free".to_string()
        }
    }

    fn window_percent(window: &Value) -> Option<f64> {
        window
            .get("used_percent")
            .and_then(Value::as_f64)
            .or_else(|| {
                window
                    .get("remaining_percent")
                    .and_then(Value::as_f64)
                    .map(|remaining| 100.0 - remaining)
            })
            .map(|pct| pct.clamp(0.0, 100.0))
    }

    fn first_limit_match(value: &Value, names: &[&str]) -> Option<f64> {
        value
            .get("rate_limits")
            .and_then(Value::as_array)
            .and_then(|items| {
                items.iter().find_map(|item| {
                    let item_name = item
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_lowercase();
                    if names.iter().any(|name| item_name.contains(name)) {
                        Self::window_percent(item)
                    } else {
                        None
                    }
                })
            })
    }

    fn parse_quota_state(value: &Value) -> CodexQuotaState {
        let five_hour_session_pct = value
            .pointer("/rate_limit/primary_window")
            .and_then(Self::window_percent)
            .or_else(|| Self::first_limit_match(value, &["primary", "five", "session"]))
            .or_else(|| value.get("used_percent").and_then(Value::as_f64))
            .unwrap_or(0.0)
            .clamp(0.0, 100.0);

        let weekly_limit_pct = value
            .pointer("/rate_limit/secondary_window")
            .and_then(Self::window_percent)
            .or_else(|| Self::first_limit_match(value, &["secondary", "week", "weekly"]))
            .unwrap_or(five_hour_session_pct)
            .clamp(0.0, 100.0);

        let reset_at = value
            .pointer("/rate_limit/secondary_window/reset_at")
            .and_then(Value::as_str)
            .or_else(|| {
                value
                    .pointer("/rate_limit/primary_window/reset_at")
                    .and_then(Value::as_str)
            })
            .unwrap_or("")
            .to_string();

        CodexQuotaState {
            five_hour_session_pct,
            weekly_limit_pct,
            reset_at,
        }
    }
}

impl Provider for CodexProvider {
    async fn name(&self) -> &str {
        "codex"
    }

    async fn provider_info(&self) -> ProviderInfo {
        let plan = LAST_PLAN
            .lock()
            .map(|value| value.clone())
            .unwrap_or_else(|_| "Unknown".to_string());
        ProviderInfo {
            id: "codex".to_string(),
            name: "OpenAI Codex".to_string(),
            icon: "bot".to_string(),
            auth_method: AuthMethod::OAuth,
            plan_name: plan,
            quota_limit: 100,
            reset_period: "rolling".to_string(),
        }
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        let token = Self::read_token_from_auth_file().or_else(|| {
            self.credential_manager
                .get_credential("codex")
                .ok()
                .flatten()
                .map(|value| value.to_string())
        });

        let Some(token) = token else {
            return Ok(not_configured_usage("codex"));
        };

        let response = self
            .client
            .get("https://chatgpt.com/backend-api/wham/usage")
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .send()
            .await;

        let value = match response {
            Ok(response) => match response.json::<Value>().await {
                Ok(value) => value,
                Err(_) => return Ok(unreachable_usage("codex")),
            },
            Err(_) => return Ok(unreachable_usage("codex")),
        };

        let plan = Self::parse_plan(&value);
        if let Ok(mut guard) = LAST_PLAN.lock() {
            *guard = plan;
        }

        let quota_state = Self::parse_quota_state(&value);

        Ok(UsageData {
            provider: "codex".to_string(),
            requests: quota_state.five_hour_session_pct.round() as u64,
            tokens: quota_state.weekly_limit_pct.round() as u64,
            period_start: String::new(),
            period_end: quota_state.reset_at,
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
            used: usage.tokens,
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
    fn parses_codex_windows() {
        let value = serde_json::json!({
            "rate_limit": {
                "primary_window": {"used_percent": 45.0},
                "secondary_window": {"remaining_percent": 70.0, "reset_at": "2026-03-01"},
                "plan": "team"
            }
        });
        let state = CodexProvider::parse_quota_state(&value);
        assert_eq!(state.five_hour_session_pct, 45.0);
        assert_eq!(state.weekly_limit_pct, 30.0);
        assert_eq!(state.reset_at, "2026-03-01");
        assert_eq!(CodexProvider::parse_plan(&value), "Team");
    }

    #[test]
    fn falls_back_to_rate_limits_array() {
        let value = serde_json::json!({
            "rate_limits": [
                {"name": "five_hour_session", "used_percent": 55.0},
                {"name": "weekly_limit", "used_percent": 80.0}
            ]
        });
        let state = CodexProvider::parse_quota_state(&value);
        assert_eq!(state.five_hour_session_pct, 55.0);
        assert_eq!(state.weekly_limit_pct, 80.0);
    }
}
