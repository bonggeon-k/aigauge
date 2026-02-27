use crate::credentials::CredentialManager;
use regex::Regex;
use reqwest::Client;
use std::sync::atomic::{AtomicU32, Ordering};
use tokio::process::Command;
use tokio::time::{timeout, Duration};
use tracing::instrument;

use once_cell::sync::Lazy;
use std::sync::Mutex;

use super::{
    not_configured_quota, not_configured_usage, unreachable_quota, unreachable_usage, AuthMethod,
    CostData, Provider, ProviderInfo, ProviderStatus, QuotaLimit, Result, UsageData,
};

static CONSECUTIVE_FAILURES: AtomicU32 = AtomicU32::new(0);
static LAST_PLAN: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new("KIRO".to_string()));
static ANSI_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\x1B\[[0-?]*[ -/]*[@-~]").expect("valid ansi regex"));
static PLAN_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\|\s+(KIRO\s+\w+)").expect("valid plan regex"));
static CREDITS_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\((\d+\.?\d*)\s+of\s+(\d+\.?\d*)").expect("valid credits regex"));
static PERCENT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(\d+)%").expect("valid percent regex"));
static RESET_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"resets on\s+(\d{2}/\d{2})").expect("valid reset regex"));

#[derive(Debug, Clone)]
struct ParsedKiroUsage {
    plan: String,
    used_credits: f64,
    limit_credits: f64,
    percent_used: u64,
    reset_at: String,
}

pub struct KiroProvider {
    #[allow(dead_code)]
    credential_manager: CredentialManager,
    #[allow(dead_code)]
    client: Client,
}

impl KiroProvider {
    #[instrument(skip(credential_manager, client))]
    pub fn new(credential_manager: CredentialManager, client: Client) -> Self {
        Self {
            credential_manager,
            client,
        }
    }

    async fn run_usage_command() -> std::result::Result<String, String> {
        #[cfg(target_os = "windows")]
        let command = "wsl bash -lc \"kiro-cli chat --no-interactive /usage\"";
        #[cfg(not(target_os = "windows"))]
        let command = "kiro-cli chat --no-interactive /usage";

        let mut process = Command::new("bash");
        process.arg("-lc").arg(command);

        let output = timeout(Duration::from_secs(10), process.output())
            .await
            .map_err(|_| "kiro usage command timed out".to_string())?
            .map_err(|error| format!("failed to run kiro usage command: {error}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(stderr);
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    fn strip_ansi(raw: &str) -> String {
        ANSI_RE.replace_all(raw, "").to_string()
    }

    fn parse_output(raw: &str) -> Option<ParsedKiroUsage> {
        let cleaned = Self::strip_ansi(raw);
        let target = cleaned
            .split("Estimated Usage")
            .nth(1)
            .unwrap_or(cleaned.as_str());

        let plan = PLAN_RE
            .captures(target)
            .and_then(|caps| caps.get(1).map(|value| value.as_str().trim().to_string()))
            .unwrap_or_else(|| "KIRO".to_string());

        let credits = CREDITS_RE.captures(target)?;
        let used_credits = credits
            .get(1)
            .and_then(|value| value.as_str().parse::<f64>().ok())
            .unwrap_or(0.0);
        let limit_credits = credits
            .get(2)
            .and_then(|value| value.as_str().parse::<f64>().ok())
            .unwrap_or(0.0);

        let percent_used = PERCENT_RE
            .captures(target)
            .and_then(|caps| {
                caps.get(1)
                    .and_then(|value| value.as_str().parse::<u64>().ok())
            })
            .unwrap_or_else(|| {
                if limit_credits > 0.0 {
                    ((used_credits / limit_credits) * 100.0).round() as u64
                } else {
                    0
                }
            });

        let reset_at = RESET_RE
            .captures(target)
            .and_then(|caps| caps.get(1).map(|value| value.as_str().to_string()))
            .unwrap_or_default();

        Some(ParsedKiroUsage {
            plan,
            used_credits,
            limit_credits,
            percent_used,
            reset_at,
        })
    }

    fn register_failure() {
        let _ = CONSECUTIVE_FAILURES.fetch_add(1, Ordering::Relaxed);
    }

    fn reset_failures() {
        CONSECUTIVE_FAILURES.store(0, Ordering::Relaxed);
    }
}

impl Provider for KiroProvider {
    async fn name(&self) -> &str {
        "kiro"
    }

    async fn provider_info(&self) -> ProviderInfo {
        let plan = LAST_PLAN
            .lock()
            .map(|value| value.clone())
            .unwrap_or_else(|_| "KIRO".to_string());
        ProviderInfo {
            id: "kiro".to_string(),
            name: "Kiro".to_string(),
            icon: "cpu".to_string(),
            auth_method: AuthMethod::None,
            plan_name: plan,
            quota_limit: 100,
            reset_period: "monthly".to_string(),
        }
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        if CONSECUTIVE_FAILURES.load(Ordering::Relaxed) >= 3 {
            return Ok(unreachable_usage("kiro"));
        }

        let output = match Self::run_usage_command().await {
            Ok(output) => output,
            Err(error) => {
                Self::register_failure();
                let lowered = error.to_lowercase();
                if lowered.contains("command not found") || lowered.contains("kiro-cli") {
                    return Ok(not_configured_usage("kiro"));
                }
                return Ok(unreachable_usage("kiro"));
            }
        };

        let Some(parsed) = Self::parse_output(output.as_str()) else {
            Self::register_failure();
            return Ok(unreachable_usage("kiro"));
        };

        Self::reset_failures();
        if let Ok(mut plan) = LAST_PLAN.lock() {
            *plan = parsed.plan.clone();
        }

        Ok(UsageData {
            provider: "kiro".to_string(),
            requests: parsed.percent_used,
            tokens: parsed.used_credits.round() as u64,
            period_start: String::new(),
            period_end: parsed.reset_at,
            status: ProviderStatus::Ok,
        })
    }

    async fn fetch_cost(&self) -> Result<Option<CostData>> {
        Ok(None)
    }

    async fn fetch_quota(&self) -> Result<QuotaLimit> {
        if CONSECUTIVE_FAILURES.load(Ordering::Relaxed) >= 3 {
            return Ok(unreachable_quota("credits"));
        }

        let output = match Self::run_usage_command().await {
            Ok(output) => output,
            Err(error) => {
                Self::register_failure();
                let lowered = error.to_lowercase();
                if lowered.contains("command not found") || lowered.contains("kiro-cli") {
                    return Ok(not_configured_quota());
                }
                return Ok(unreachable_quota("credits"));
            }
        };

        let Some(parsed) = Self::parse_output(output.as_str()) else {
            Self::register_failure();
            return Ok(unreachable_quota("credits"));
        };

        Self::reset_failures();
        if let Ok(mut plan) = LAST_PLAN.lock() {
            *plan = parsed.plan.clone();
        }

        Ok(QuotaLimit {
            used: parsed.used_credits.round() as u64,
            limit: parsed.limit_credits.round() as u64,
            unit: "credits".to_string(),
            reset_at: parsed.reset_at,
            status: ProviderStatus::Ok,
        })
    }

    fn auth_method(&self) -> AuthMethod {
        AuthMethod::None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_usage_block() {
        let sample = r#"
Estimated Usage
| KIRO PRO
Credits (12.5 of 100)
54%
resets on 03/15
"#;
        let parsed = KiroProvider::parse_output(sample).expect("should parse sample");
        assert_eq!(parsed.plan, "KIRO PRO");
        assert_eq!(parsed.percent_used, 54);
        assert_eq!(parsed.limit_credits.round() as u64, 100);
        assert_eq!(parsed.reset_at, "03/15");
    }
}
