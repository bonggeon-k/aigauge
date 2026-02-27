use crate::credentials::CredentialManager;
use once_cell::sync::Lazy;
use reqwest::header::{ACCEPT, AUTHORIZATION};
use reqwest::Client;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use tracing::instrument;

use super::{
    home_dir, not_configured_quota, not_configured_usage, unreachable_quota, unreachable_usage,
    AuthMethod, CostData, Provider, ProviderInfo, ProviderStatus, QuotaLimit, Result, UsageData,
};

enum UsageFetchResult {
    Ok(Value),
    NotConfigured,
    Unreachable,
}

static LAST_PLAN: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new("GitHub Copilot".to_string()));

pub struct CopilotProvider {
    credential_manager: CredentialManager,
    client: Client,
}

impl CopilotProvider {
    #[instrument(skip(credential_manager))]
    pub fn new(credential_manager: CredentialManager, client: Client) -> Self {
        Self {
            credential_manager,
            client,
        }
    }

    fn sanitize_token(raw: &str) -> Option<String> {
        let mut value = raw.trim().to_string();
        if value.is_empty() {
            return None;
        }

        if (value.starts_with('"') && value.ends_with('"'))
            || (value.starts_with('\'') && value.ends_with('\''))
        {
            value.remove(0);
            let _ = value.pop();
        }

        let cleaned = value.trim().to_string();
        if cleaned.is_empty() {
            None
        } else {
            Some(cleaned)
        }
    }

    fn gh_hosts_paths() -> Vec<PathBuf> {
        let mut candidates = Vec::new();

        if let Some(home) = home_dir() {
            candidates.push(home.join(".config").join("gh").join("hosts.yml"));
        }

        if let Ok(app_data) = std::env::var("APPDATA") {
            candidates.push(PathBuf::from(app_data).join("GitHub CLI").join("hosts.yml"));
        }

        if let Ok(xdg_home) = std::env::var("XDG_CONFIG_HOME") {
            candidates.push(PathBuf::from(xdg_home).join("gh").join("hosts.yml"));
        }

        candidates
    }

    fn parse_gh_hosts_token(raw: &str) -> Option<String> {
        for line in raw.lines() {
            let trimmed = line.trim();
            if let Some(value) = trimmed.strip_prefix("oauth_token:") {
                if let Some(token) = Self::sanitize_token(value) {
                    return Some(token);
                }
            }
        }
        None
    }

    fn read_token_from_gh_hosts() -> Option<String> {
        for path in Self::gh_hosts_paths() {
            let Ok(raw) = fs::read_to_string(path) else {
                continue;
            };
            if let Some(token) = Self::parse_gh_hosts_token(raw.as_str()) {
                return Some(token);
            }
        }
        None
    }

    fn copilot_cache_paths() -> Vec<PathBuf> {
        let mut candidates = Vec::new();

        if let Some(home) = home_dir() {
            candidates.push(
                home.join(".config")
                    .join("github-copilot")
                    .join("apps.json"),
            );
            candidates.push(
                home.join(".config")
                    .join("github-copilot")
                    .join("token.json"),
            );
            candidates.push(
                home.join(".config")
                    .join("Code")
                    .join("User")
                    .join("globalStorage")
                    .join("github.copilot-chat")
                    .join("apps.json"),
            );

            candidates.push(
                home.join("Library")
                    .join("Application Support")
                    .join("GitHub Copilot")
                    .join("apps.json"),
            );
            candidates.push(
                home.join("Library")
                    .join("Application Support")
                    .join("GitHub Copilot")
                    .join("token.json"),
            );
            candidates.push(
                home.join("Library")
                    .join("Application Support")
                    .join("Code")
                    .join("User")
                    .join("globalStorage")
                    .join("github.copilot-chat")
                    .join("apps.json"),
            );

            candidates.push(
                home.join("AppData")
                    .join("Roaming")
                    .join("GitHub Copilot")
                    .join("apps.json"),
            );
            candidates.push(
                home.join("AppData")
                    .join("Roaming")
                    .join("GitHub Copilot")
                    .join("token.json"),
            );
            candidates.push(
                home.join("AppData")
                    .join("Roaming")
                    .join("Code")
                    .join("User")
                    .join("globalStorage")
                    .join("github.copilot-chat")
                    .join("apps.json"),
            );
        }

        if let Ok(app_data) = std::env::var("APPDATA") {
            candidates.push(
                PathBuf::from(app_data.clone())
                    .join("GitHub Copilot")
                    .join("apps.json"),
            );
            candidates.push(
                PathBuf::from(app_data.clone())
                    .join("GitHub Copilot")
                    .join("token.json"),
            );
            candidates.push(
                PathBuf::from(app_data)
                    .join("Code")
                    .join("User")
                    .join("globalStorage")
                    .join("github.copilot-chat")
                    .join("apps.json"),
            );
        }

        candidates
    }

    fn looks_like_github_token(value: &str) -> bool {
        let token = value.trim();
        if token.len() < 20 || token.chars().any(char::is_whitespace) {
            return false;
        }

        token.starts_with("ghp_")
            || token.starts_with("gho_")
            || token.starts_with("ghu_")
            || token.starts_with("ghs_")
            || token.starts_with("ghr_")
            || token.starts_with("github_pat_")
    }

    fn parse_token_from_json_value(value: &Value) -> Option<String> {
        match value {
            Value::Object(map) => {
                for key in [
                    "access_token",
                    "oauth_token",
                    "token",
                    "github_token",
                    "refresh_token",
                ] {
                    if let Some(token) = map
                        .get(key)
                        .and_then(Value::as_str)
                        .and_then(Self::sanitize_token)
                        .filter(|token| Self::looks_like_github_token(token))
                    {
                        return Some(token);
                    }
                }

                for nested in map.values() {
                    if let Some(token) = Self::parse_token_from_json_value(nested) {
                        return Some(token);
                    }
                }
                None
            }
            Value::Array(values) => values.iter().find_map(Self::parse_token_from_json_value),
            Value::String(text) => {
                Self::sanitize_token(text).filter(|token| Self::looks_like_github_token(token))
            }
            _ => None,
        }
    }

    fn parse_token_from_cache_file(raw: &str) -> Option<String> {
        if let Ok(value) = serde_json::from_str::<Value>(raw) {
            if let Some(token) = Self::parse_token_from_json_value(&value) {
                return Some(token);
            }
        }

        for line in raw.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if let Some((_, candidate)) =
                trimmed.split_once(':').or_else(|| trimmed.split_once('='))
            {
                if let Some(token) = Self::sanitize_token(candidate)
                    .filter(|token| Self::looks_like_github_token(token))
                {
                    return Some(token);
                }
            }

            if let Some(token) =
                Self::sanitize_token(trimmed).filter(|token| Self::looks_like_github_token(token))
            {
                return Some(token);
            }
        }

        None
    }

    fn read_token_from_copilot_cache() -> Option<String> {
        for path in Self::copilot_cache_paths() {
            let Ok(raw) = fs::read_to_string(path) else {
                continue;
            };
            if let Some(token) = Self::parse_token_from_cache_file(raw.as_str()) {
                return Some(token);
            }
        }
        None
    }

    fn parse_token_from_gh_cli_output(raw: &str) -> Option<String> {
        raw.lines()
            .find_map(Self::sanitize_token)
            .filter(|token| Self::looks_like_github_token(token))
    }

    fn read_token_from_gh_cli() -> Option<String> {
        let commands: [&[&str]; 2] = [
            &["auth", "token", "--hostname", "github.com"],
            &["auth", "token"],
        ];

        for args in commands {
            let Ok(output) = Command::new("gh").args(args).output() else {
                continue;
            };
            if !output.status.success() {
                continue;
            }

            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(token) = Self::parse_token_from_gh_cli_output(stdout.as_ref()) {
                return Some(token);
            }
        }

        None
    }

    fn resolve_token(&self) -> Option<String> {
        self.credential_manager
            .get_credential("copilot")
            .ok()
            .flatten()
            .and_then(|value| Self::sanitize_token(value.as_str()))
            .or_else(|| {
                std::env::var("COPILOT_API_TOKEN")
                    .ok()
                    .and_then(|value| Self::sanitize_token(value.as_str()))
            })
            .or_else(|| {
                std::env::var("GH_TOKEN")
                    .ok()
                    .and_then(|value| Self::sanitize_token(value.as_str()))
            })
            .or_else(|| {
                std::env::var("GITHUB_TOKEN")
                    .ok()
                    .and_then(|value| Self::sanitize_token(value.as_str()))
            })
            .or_else(Self::read_token_from_gh_hosts)
            .or_else(Self::read_token_from_copilot_cache)
            .or_else(Self::read_token_from_gh_cli)
    }

    async fn fetch_usage_json(&self, token: &str) -> UsageFetchResult {
        let response = match self
            .client
            .get("https://api.github.com/copilot_internal/user")
            .header(AUTHORIZATION, format!("token {token}"))
            .header(ACCEPT, "application/json")
            .header("Editor-Version", "vscode/1.96.2")
            .header("Editor-Plugin-Version", "copilot-chat/0.26.7")
            .header("User-Agent", "GitHubCopilotChat/0.26.7")
            .header("X-Github-Api-Version", "2025-04-01")
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

    fn parse_number(value: &Value) -> Option<f64> {
        value
            .as_f64()
            .or_else(|| value.as_u64().map(|number| number as f64))
            .or_else(|| value.as_i64().map(|number| number as f64))
            .or_else(|| value.as_str().and_then(|text| text.parse::<f64>().ok()))
    }

    fn derive_used_percent(snapshot: Option<&Value>) -> Option<f64> {
        let snapshot = snapshot?;

        if let Some(percent_remaining) = snapshot
            .get("percent_remaining")
            .and_then(Self::parse_number)
            .or_else(|| {
                snapshot
                    .get("percentRemaining")
                    .and_then(Self::parse_number)
            })
        {
            return Some((100.0 - percent_remaining).clamp(0.0, 100.0));
        }

        let entitlement = snapshot.get("entitlement").and_then(Self::parse_number);
        let remaining = snapshot.get("remaining").and_then(Self::parse_number);

        match (entitlement, remaining) {
            (Some(entitlement), Some(remaining)) if entitlement > 0.0 => {
                Some((100.0 - (remaining / entitlement) * 100.0).clamp(0.0, 100.0))
            }
            _ => None,
        }
    }

    fn derive_from_monthly(value: &Value, key: &str) -> Option<f64> {
        let monthly = value
            .pointer(format!("/monthly_quotas/{key}").as_str())
            .and_then(Self::parse_number)?;
        if monthly <= 0.0 {
            return None;
        }

        let limited = value
            .pointer(format!("/limited_user_quotas/{key}").as_str())
            .and_then(Self::parse_number)?;

        Some((100.0 - (limited / monthly) * 100.0).clamp(0.0, 100.0))
    }

    fn parse_usage_window(value: &Value) -> (f64, f64, String, String) {
        let quota_snapshots = value.get("quota_snapshots").unwrap_or(value);
        let premium = Self::derive_used_percent(quota_snapshots.get("premium_interactions"))
            .or_else(|| Self::derive_from_monthly(value, "completions"));
        let chat = Self::derive_used_percent(quota_snapshots.get("chat"))
            .or_else(|| Self::derive_from_monthly(value, "chat"));

        let used_premium = premium.unwrap_or(0.0);
        let used_chat = chat.unwrap_or(used_premium);

        let reset = value
            .get("quota_reset_date")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();

        let plan = value
            .get("copilot_plan")
            .and_then(Value::as_str)
            .map(|plan| {
                if plan.is_empty() {
                    "GitHub Copilot".to_string()
                } else {
                    format!("GitHub Copilot {}", capitalize(plan))
                }
            })
            .unwrap_or_else(|| "GitHub Copilot".to_string());

        (used_premium, used_chat, reset, plan)
    }
}

impl Provider for CopilotProvider {
    async fn name(&self) -> &str {
        "copilot"
    }

    async fn provider_info(&self) -> ProviderInfo {
        let plan = LAST_PLAN
            .lock()
            .map(|value| value.clone())
            .unwrap_or_else(|_| "GitHub Copilot".to_string());
        ProviderInfo {
            id: "copilot".to_string(),
            name: "GitHub Copilot".to_string(),
            icon: "github".to_string(),
            auth_method: AuthMethod::OAuth,
            plan_name: plan,
            quota_limit: 100,
            reset_period: "monthly".to_string(),
        }
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        let Some(token) = self.resolve_token() else {
            return Ok(not_configured_usage("copilot"));
        };

        let value = match self.fetch_usage_json(token.as_str()).await {
            UsageFetchResult::Ok(value) => value,
            UsageFetchResult::NotConfigured => return Ok(not_configured_usage("copilot")),
            UsageFetchResult::Unreachable => return Ok(unreachable_usage("copilot")),
        };

        let (premium_used, chat_used, reset_at, plan) = Self::parse_usage_window(&value);
        if let Ok(mut guard) = LAST_PLAN.lock() {
            *guard = plan;
        }

        Ok(UsageData {
            provider: "copilot".to_string(),
            requests: premium_used.round() as u64,
            tokens: chat_used.round() as u64,
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

fn capitalize(value: &str) -> String {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    first.to_uppercase().collect::<String>() + chars.as_str()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_percent_from_snapshot() {
        let snapshot = serde_json::json!({
            "entitlement": 300,
            "remaining": 210,
            "quota_id": "completions"
        });
        let used = CopilotProvider::derive_used_percent(Some(&snapshot)).expect("percent");
        assert!((used - 30.0).abs() < 0.001);
    }

    #[test]
    fn parses_monthly_fallback_shape() {
        let payload = serde_json::json!({
            "monthly_quotas": {"completions": 300, "chat": 300},
            "limited_user_quotas": {"completions": 240, "chat": 180},
            "copilot_plan": "business",
            "quota_reset_date": "2026-03-01"
        });

        let (premium, chat, reset, plan) = CopilotProvider::parse_usage_window(&payload);
        assert!((premium - 20.0).abs() < 0.001);
        assert!((chat - 40.0).abs() < 0.001);
        assert_eq!(reset, "2026-03-01");
        assert!(plan.contains("Business"));
    }

    #[test]
    fn sanitize_token_handles_wrapped_values() {
        assert_eq!(
            CopilotProvider::sanitize_token(" 'abc' "),
            Some("abc".to_string())
        );
    }

    #[test]
    fn parses_gh_hosts_oauth_token() {
        let raw = r#"
github.com:
    oauth_token: "gho_sample_token"
    user: test
"#;
        assert_eq!(
            CopilotProvider::parse_gh_hosts_token(raw),
            Some("gho_sample_token".to_string())
        );
    }

    #[test]
    fn parses_token_from_nested_cache_json() {
        let raw = r#"
{
  "accounts": {
    "github.com": {
      "access_token": "gho_nested_cache_token_1234567890"
    }
  }
}
"#;
        assert_eq!(
            CopilotProvider::parse_token_from_cache_file(raw),
            Some("gho_nested_cache_token_1234567890".to_string())
        );
    }

    #[test]
    fn parses_token_from_gh_cli_output() {
        let raw = "ghu_cli_token_abcdefghijklmnopqrstuvwxyz\n";
        assert_eq!(
            CopilotProvider::parse_token_from_gh_cli_output(raw),
            Some("ghu_cli_token_abcdefghijklmnopqrstuvwxyz".to_string())
        );
    }
}
