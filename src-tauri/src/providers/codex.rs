use crate::credentials::CredentialManager;
use crate::platform;
use reqwest::header::AUTHORIZATION;
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tracing::instrument;

use once_cell::sync::Lazy;

use super::{
    home_dir, not_configured_quota, not_configured_usage, unreachable_quota, unreachable_usage,
    AuthMethod, AuthSourceMode, CostData, Provider, ProviderInfo, ProviderStatus, QuotaLimit,
    Result, UsageData,
};

static LAST_PLAN: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new("Unknown".to_string()));
static LAST_QUOTA_STATE: Lazy<Mutex<Option<CodexQuotaState>>> = Lazy::new(|| Mutex::new(None));

#[derive(Debug, Clone, Deserialize, Serialize)]
struct CodexAuth {
    #[serde(rename = "OPENAI_API_KEY")]
    openai_api_key: Option<String>,
    tokens: Option<CodexTokens>,
    last_refresh: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct CodexTokens {
    access_token: Option<String>,
    refresh_token: Option<String>,
    id_token: Option<String>,
    account_id: Option<String>,
}

#[derive(Debug, Clone)]
struct CodexQuotaState {
    five_hour_session_pct: f64,
    weekly_limit_pct: f64,
    session_reset_at: String,
    weekly_reset_at: String,
}

#[derive(Debug, Deserialize)]
struct CodexTokenRefreshResponse {
    access_token: Option<String>,
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

    fn codex_root() -> Option<PathBuf> {
        std::env::var("CODEX_HOME")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .map(PathBuf::from)
            .or_else(|| home_dir().map(|home| home.join(".codex")))
            .or_else(|| platform::wsl_to_windows_path("~/.codex"))
    }

    fn auth_path() -> Option<PathBuf> {
        Self::codex_root().map(|root| root.join("auth.json"))
    }

    fn config_path() -> Option<PathBuf> {
        Self::codex_root().map(|root| root.join("config.toml"))
    }

    fn read_auth_from_file() -> Option<CodexAuth> {
        let raw = if let Some(path) = Self::auth_path() {
            fs::read_to_string(path).ok()
        } else {
            None
        }
        .or_else(|| platform::read_wsl_text_file("~/.codex/auth.json"))?;
        serde_json::from_str(raw.as_str()).ok()
    }

    fn parse_config_base_url() -> Option<String> {
        let raw = if let Some(path) = Self::config_path() {
            fs::read_to_string(path).ok()
        } else {
            None
        }
        .or_else(|| platform::read_wsl_text_file("~/.codex/config.toml"))?;

        for line in raw.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix("chatgpt_base_url") {
                let (_, value) = rest.split_once('=')?;
                let normalized = value
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'')
                    .trim_end_matches('/')
                    .to_string();
                if !normalized.is_empty() {
                    return Some(normalized);
                }
            }
        }
        None
    }

    fn resolve_usage_url() -> String {
        let base = Self::parse_config_base_url();
        let validated = base.and_then(|candidate| {
            let parsed = Url::parse(candidate.as_str()).ok()?;
            let host = parsed.host_str()?.to_ascii_lowercase();
            if parsed.scheme() != "https" {
                return None;
            }
            if host != "chatgpt.com" && host != "chat.openai.com" {
                return None;
            }

            let mut url = parsed;
            if !url.path().contains("/backend-api") {
                let normalized_path = format!("{}/backend-api", url.path().trim_end_matches('/'));
                url.set_path(normalized_path.as_str());
            }
            Some(url.to_string().trim_end_matches('/').to_string())
        });
        let normalized = validated.unwrap_or_else(|| "https://chatgpt.com/backend-api".to_string());
        if normalized.is_empty() {
            return "https://chatgpt.com/backend-api/wham/usage".to_string();
        }
        format!("{normalized}/wham/usage")
    }

    fn parse_last_refresh(last_refresh: Option<&str>) -> Option<chrono::DateTime<chrono::Utc>> {
        let value = last_refresh?.trim();
        if value.is_empty() {
            return None;
        }
        chrono::DateTime::parse_from_rfc3339(value)
            .ok()
            .map(|dt| dt.with_timezone(&chrono::Utc))
    }

    fn needs_refresh(last_refresh: Option<&str>) -> bool {
        let Some(last) = Self::parse_last_refresh(last_refresh) else {
            return true;
        };
        chrono::Utc::now().signed_duration_since(last).num_days() >= 8
    }

    async fn refresh_access_token(
        &self,
        refresh_token: &str,
    ) -> std::result::Result<CodexTokenRefreshResponse, ()> {
        let response = self
            .client
            .post("https://auth.openai.com/oauth/token")
            .json(&serde_json::json!({
                "client_id": "app_EMoamEEZ73f0CkXaXp7hrann",
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "scope": "openid profile email",
            }))
            .send()
            .await
            .map_err(|_| ())?;

        if !response.status().is_success() {
            return Err(());
        }

        response
            .json::<CodexTokenRefreshResponse>()
            .await
            .map_err(|_| ())
    }

    async fn auth_header_value(&self) -> Option<(String, Option<String>)> {
        if let Some(auth) = Self::read_auth_from_file() {
            if let Some(api_key) = auth
                .openai_api_key
                .as_ref()
                .filter(|value| !value.is_empty())
            {
                let _ = self
                    .credential_manager
                    .save_credential("codex", api_key.to_string());
                return Some((api_key.to_string(), None));
            }

            if let Some(tokens) = auth.tokens.as_ref() {
                let mut access = tokens.access_token.clone();
                if let (Some(refresh), true) = (
                    tokens
                        .refresh_token
                        .as_ref()
                        .filter(|value| !value.is_empty()),
                    Self::needs_refresh(auth.last_refresh.as_deref()),
                ) {
                    if let Ok(refreshed) = self.refresh_access_token(refresh).await {
                        if let Some(new_access) = refreshed.access_token.as_ref() {
                            access = Some(new_access.to_string());
                            let _ = self
                                .credential_manager
                                .save_credential("codex", new_access.to_string());
                        }
                    }
                }

                if let Some(access_token) = access.filter(|value| !value.is_empty()) {
                    let _ = self
                        .credential_manager
                        .save_credential("codex", access_token.clone());
                    return Some((access_token, tokens.account_id.clone()));
                }
            }
        }

        if let Some(saved) = self
            .credential_manager
            .get_credential("codex")
            .ok()
            .flatten()
            .filter(|value| !value.trim().is_empty())
        {
            return Some((saved.to_string(), None));
        }
        None
    }

    fn parse_plan(value: &Value) -> String {
        let raw = value
            .pointer("/rate_limit/plan")
            .and_then(Value::as_str)
            .or_else(|| {
                value
                    .pointer("/rate_limit/plan_type")
                    .and_then(Value::as_str)
            })
            .or_else(|| value.pointer("/plan_type").and_then(Value::as_str))
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

    fn normalize_percent(value: f64) -> f64 {
        if value <= 1.0 {
            (value * 100.0).clamp(0.0, 100.0)
        } else {
            value.clamp(0.0, 100.0)
        }
    }

    fn parse_number(raw: &Value) -> Option<f64> {
        raw.as_f64()
            .or_else(|| raw.as_i64().map(|value| value as f64))
            .or_else(|| raw.as_u64().map(|value| value as f64))
            .or_else(|| raw.as_str().and_then(|value| value.parse::<f64>().ok()))
    }

    fn percent_from_ratio(window: &Value, used_key: &str, limit_key: &str) -> Option<f64> {
        let used = window.get(used_key).and_then(Self::parse_number)?;
        let limit = window.get(limit_key).and_then(Self::parse_number)?;
        if limit <= 0.0 {
            return None;
        }
        Some(Self::normalize_percent((used / limit) * 100.0))
    }

    fn window_percent(window: &Value) -> Option<f64> {
        window
            .get("used_percent")
            .and_then(Self::parse_number)
            .or_else(|| {
                window
                    .get("remaining_percent")
                    .and_then(Self::parse_number)
                    .map(|remaining| 100.0 - remaining)
            })
            .or_else(|| Self::percent_from_ratio(window, "used", "limit"))
            .or_else(|| Self::percent_from_ratio(window, "consumed", "limit"))
            .or_else(|| Self::percent_from_ratio(window, "count", "max_count"))
            .or_else(|| Self::percent_from_ratio(window, "requests_used", "requests_limit"))
            .map(Self::normalize_percent)
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

    fn limit_by_index(value: &Value, index: usize) -> Option<f64> {
        value
            .get("rate_limits")
            .and_then(Value::as_array)
            .and_then(|items| items.get(index))
            .and_then(Self::window_percent)
    }

    fn first_limit_reset_match(value: &Value, names: &[&str]) -> Option<String> {
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
                        item.get("reset_at").and_then(Self::format_reset_at)
                    } else {
                        None
                    }
                })
            })
    }

    fn limit_reset_by_index(value: &Value, index: usize) -> Option<String> {
        value
            .get("rate_limits")
            .and_then(Value::as_array)
            .and_then(|items| items.get(index))
            .and_then(|item| item.get("reset_at"))
            .and_then(Self::format_reset_at)
    }

    fn parse_quota_state(value: &Value) -> CodexQuotaState {
        let five_hour_session_pct = value
            .pointer("/rate_limit/primary_window")
            .and_then(Self::window_percent)
            .or_else(|| Self::first_limit_match(value, &["primary", "five", "session"]))
            .or_else(|| Self::limit_by_index(value, 0))
            .or_else(|| value.get("used_percent").and_then(Value::as_f64))
            .map(Self::normalize_percent)
            .unwrap_or(0.0);

        let weekly_limit_pct = value
            .pointer("/rate_limit/secondary_window")
            .and_then(Self::window_percent)
            .or_else(|| Self::first_limit_match(value, &["secondary", "week", "weekly"]))
            .or_else(|| Self::limit_by_index(value, 1))
            .map(Self::normalize_percent)
            .unwrap_or(five_hour_session_pct);

        let session_reset_at = value
            .pointer("/rate_limit/primary_window/reset_at")
            .and_then(Self::format_reset_at)
            .or_else(|| Self::first_limit_reset_match(value, &["primary", "five", "session"]))
            .or_else(|| Self::limit_reset_by_index(value, 0))
            .unwrap_or_default();

        let weekly_reset_at = value
            .pointer("/rate_limit/secondary_window/reset_at")
            .and_then(Self::format_reset_at)
            .or_else(|| Self::first_limit_reset_match(value, &["secondary", "week", "weekly"]))
            .or_else(|| Self::limit_reset_by_index(value, 1))
            .or_else(|| {
                value
                    .pointer("/rate_limit/primary_window/reset_at")
                    .and_then(Self::format_reset_at)
            })
            .unwrap_or_else(|| session_reset_at.clone());

        CodexQuotaState {
            five_hour_session_pct,
            weekly_limit_pct,
            session_reset_at,
            weekly_reset_at,
        }
    }

    fn format_reset_at(raw: &Value) -> Option<String> {
        raw.as_str().map(|value| value.to_string()).or_else(|| {
            raw.as_i64().and_then(|timestamp| {
                chrono::DateTime::from_timestamp(timestamp, 0).map(|value| value.to_rfc3339())
            })
        })
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
            supported_auth_modes: vec![
                AuthSourceMode::Auto,
                AuthSourceMode::ApiKey,
                AuthSourceMode::OAuthToken,
            ],
            default_auth_mode: AuthSourceMode::Auto,
            plan_name: plan,
            quota_limit: 100,
            reset_period: "rolling".to_string(),
        }
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        let Some((token, account_id)) = self.auth_header_value().await else {
            if let Ok(mut guard) = LAST_QUOTA_STATE.lock() {
                *guard = None;
            }
            return Ok(not_configured_usage("codex"));
        };

        let mut request = self
            .client
            .get(Self::resolve_usage_url())
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header("Accept", "application/json");

        if let Some(account_id) = account_id.as_ref().filter(|value| !value.is_empty()) {
            request = request.header("ChatGPT-Account-Id", account_id);
        }

        let response = match request.send().await {
            Ok(response) => response,
            Err(_) => {
                if let Ok(mut guard) = LAST_QUOTA_STATE.lock() {
                    *guard = None;
                }
                return Ok(unreachable_usage("codex"));
            }
        };

        if response.status().as_u16() == 401 || response.status().as_u16() == 403 {
            if let Ok(mut guard) = LAST_QUOTA_STATE.lock() {
                *guard = None;
            }
            return Ok(not_configured_usage("codex"));
        }
        if !response.status().is_success() {
            if let Ok(mut guard) = LAST_QUOTA_STATE.lock() {
                *guard = None;
            }
            return Ok(unreachable_usage("codex"));
        }

        let value = match response.json::<Value>().await {
            Ok(value) => value,
            Err(_) => {
                if let Ok(mut guard) = LAST_QUOTA_STATE.lock() {
                    *guard = None;
                }
                return Ok(unreachable_usage("codex"));
            }
        };

        let plan = Self::parse_plan(&value);
        if let Ok(mut guard) = LAST_PLAN.lock() {
            *guard = plan;
        }

        let quota_state = Self::parse_quota_state(&value);
        if let Ok(mut guard) = LAST_QUOTA_STATE.lock() {
            *guard = Some(quota_state.clone());
        }

        Ok(UsageData {
            provider: "codex".to_string(),
            requests: quota_state.five_hour_session_pct.round() as u64,
            tokens: quota_state.weekly_limit_pct.round() as u64,
            period_start: String::new(),
            period_end: quota_state.session_reset_at,
            status: ProviderStatus::Ok,
        })
    }

    async fn fetch_cost(&self) -> Result<Option<CostData>> {
        Ok(None)
    }

    async fn fetch_quota(&self) -> Result<QuotaLimit> {
        if let Ok(guard) = LAST_QUOTA_STATE.lock() {
            if let Some(state) = guard.as_ref() {
                return Ok(QuotaLimit {
                    used: state.weekly_limit_pct.round() as u64,
                    limit: 100,
                    unit: "percent".to_string(),
                    reset_at: state.weekly_reset_at.clone(),
                    status: ProviderStatus::Ok,
                });
            }
        }

        let usage = self.fetch_usage().await?;
        if usage.status == ProviderStatus::NotConfigured {
            return Ok(not_configured_quota());
        }
        if usage.status == ProviderStatus::Unreachable {
            return Ok(unreachable_quota("percent"));
        }

        if let Ok(guard) = LAST_QUOTA_STATE.lock() {
            if let Some(state) = guard.as_ref() {
                return Ok(QuotaLimit {
                    used: state.weekly_limit_pct.round() as u64,
                    limit: 100,
                    unit: "percent".to_string(),
                    reset_at: state.weekly_reset_at.clone(),
                    status: ProviderStatus::Ok,
                });
            }
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
        assert_eq!(state.session_reset_at, "");
        assert_eq!(state.weekly_reset_at, "2026-03-01");
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

    #[test]
    fn falls_back_to_rate_limits_by_index_without_names() {
        let value = serde_json::json!({
            "rate_limits": [
                {"used_percent": 42.0},
                {"used_percent": 77.0}
            ]
        });
        let state = CodexProvider::parse_quota_state(&value);
        assert_eq!(state.five_hour_session_pct, 42.0);
        assert_eq!(state.weekly_limit_pct, 77.0);
    }

    #[test]
    fn converts_fractional_percent_and_timestamp_reset() {
        let value = serde_json::json!({
            "rate_limit": {
                "primary_window": {"used_percent": 0.25},
                "secondary_window": {"used_percent": 0.5, "reset_at": 1_767_308_800}
            }
        });
        let state = CodexProvider::parse_quota_state(&value);
        assert_eq!(state.five_hour_session_pct, 25.0);
        assert_eq!(state.weekly_limit_pct, 50.0);
        assert!(!state.weekly_reset_at.is_empty());
    }

    #[test]
    fn splits_primary_and_secondary_resets() {
        let value = serde_json::json!({
            "rate_limit": {
                "primary_window": {"used_percent": 12.0, "reset_at": "2026-03-01T12:00:00Z"},
                "secondary_window": {"used_percent": 55.0, "reset_at": "2026-03-07T00:00:00Z"}
            }
        });
        let state = CodexProvider::parse_quota_state(&value);
        assert_eq!(state.session_reset_at, "2026-03-01T12:00:00Z");
        assert_eq!(state.weekly_reset_at, "2026-03-07T00:00:00Z");
    }
}
