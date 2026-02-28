use crate::credentials::CredentialManager;
use crate::platform;
use regex::Regex;
use reqwest::Client;
use std::sync::atomic::{AtomicU32, Ordering};
use tokio::process::Command;
use tokio::time::{timeout, Duration};
use tracing::instrument;

use once_cell::sync::Lazy;
use std::sync::Mutex;
use std::time::{Duration as StdDuration, Instant};

use super::{
    not_configured_quota, not_configured_usage, unreachable_quota, unreachable_usage, AuthMethod,
    CostData, Provider, ProviderInfo, ProviderStatus, QuotaLimit, Result, UsageData,
};

static CONSECUTIVE_FAILURES: AtomicU32 = AtomicU32::new(0);
static LAST_PLAN: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new("KIRO".to_string()));
static LAST_PARSED_USAGE: Lazy<Mutex<Option<ParsedUsageCache>>> = Lazy::new(|| Mutex::new(None));
static CSI_ANSI_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\x1B\[[0-?]*[ -/]*[@-~]").expect("valid ansi regex"));
static OSC_ANSI_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\x1B\][^\x07]*(?:\x07|\x1B\\)").expect("valid osc ansi regex"));
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

#[derive(Debug, Clone)]
struct ParsedUsageCache {
    parsed: ParsedKiroUsage,
    cached_at: Instant,
}

enum ParsedUsageResult {
    Ok(ParsedKiroUsage),
    NotConfigured,
    Unreachable,
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
        let (program, args) = platform::kiro_usage_command();
        let mut process = Command::new(program);
        process.args(args);

        let output = timeout(Duration::from_secs(10), process.output())
            .await
            .map_err(|_| "kiro usage command timed out".to_string())?
            .map_err(|error| format!("failed to run kiro usage command: {error}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(stderr);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let combined = if stdout.trim().is_empty() {
            stderr.to_string()
        } else {
            format!("{stdout}{stderr}")
        };
        if combined.trim().is_empty() {
            return Err("kiro usage command returned no output".to_string());
        }

        Ok(combined)
    }

    fn strip_ansi(raw: &str) -> String {
        let without_osc = OSC_ANSI_RE.replace_all(raw, "");
        CSI_ANSI_RE
            .replace_all(without_osc.as_ref(), "")
            .to_string()
    }

    fn parse_output(raw: &str) -> Option<ParsedKiroUsage> {
        let cleaned = Self::strip_ansi(raw);
        let (_, target) = cleaned.split_once("Estimated Usage")?;

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

    fn cache_is_fresh(cached_at: Instant) -> bool {
        cached_at.elapsed() < StdDuration::from_secs(20)
    }

    fn cached_usage() -> Option<ParsedKiroUsage> {
        let guard = LAST_PARSED_USAGE.lock().ok()?;
        let entry = guard.as_ref()?;
        if Self::cache_is_fresh(entry.cached_at) {
            Some(entry.parsed.clone())
        } else {
            None
        }
    }

    fn set_cached_usage(parsed: &ParsedKiroUsage) {
        if let Ok(mut guard) = LAST_PARSED_USAGE.lock() {
            *guard = Some(ParsedUsageCache {
                parsed: parsed.clone(),
                cached_at: Instant::now(),
            });
        }
    }

    fn classify_command_error(error: &str) -> ParsedUsageResult {
        let lowered = error.to_lowercase();
        if lowered.contains("command not found")
            || lowered.contains("kiro-cli")
            || lowered.contains("wsl:")
            || lowered.contains("wsl.exe")
            || lowered.contains("is not recognized")
        {
            ParsedUsageResult::NotConfigured
        } else {
            ParsedUsageResult::Unreachable
        }
    }

    async fn fetch_parsed_usage() -> ParsedUsageResult {
        if CONSECUTIVE_FAILURES.load(Ordering::Relaxed) >= 3 {
            return ParsedUsageResult::Unreachable;
        }

        if let Some(parsed) = Self::cached_usage() {
            return ParsedUsageResult::Ok(parsed);
        }

        let output = match Self::run_usage_command().await {
            Ok(output) => output,
            Err(error) => {
                Self::register_failure();
                return Self::classify_command_error(error.as_str());
            }
        };

        let Some(parsed) = Self::parse_output(output.as_str()) else {
            Self::register_failure();
            return ParsedUsageResult::Unreachable;
        };

        Self::reset_failures();
        Self::set_cached_usage(&parsed);
        if let Ok(mut plan) = LAST_PLAN.lock() {
            *plan = parsed.plan.clone();
        }
        ParsedUsageResult::Ok(parsed)
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
        let parsed = match Self::fetch_parsed_usage().await {
            ParsedUsageResult::Ok(parsed) => parsed,
            ParsedUsageResult::NotConfigured => return Ok(not_configured_usage("kiro")),
            ParsedUsageResult::Unreachable => return Ok(unreachable_usage("kiro")),
        };

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
        let parsed = match Self::fetch_parsed_usage().await {
            ParsedUsageResult::Ok(parsed) => parsed,
            ParsedUsageResult::NotConfigured => return Ok(not_configured_quota()),
            ParsedUsageResult::Unreachable => return Ok(unreachable_quota("credits")),
        };

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

    #[test]
    fn strips_csi_and_osc_sequences() {
        let sample = "\u{1b}]0;title\u{7}\u{1b}[32mEstimated Usage\u{1b}[0m";
        assert_eq!(KiroProvider::strip_ansi(sample), "Estimated Usage");
    }

    #[test]
    fn parse_output_handles_stderr_style_cli_text() {
        let sample = "\x1b[1mEstimated Usage\x1b[0m | resets on 03/01 | \x1b[0mKIRO PRO\x1b[0m\n\x1b[1mCredits\x1b[0m (275.57 of 1000 covered in plan)\n\x1b[0m█████████████████████\x1b[0m 27%\n";
        let parsed = KiroProvider::parse_output(sample).expect("should parse stderr style output");
        assert_eq!(parsed.plan, "KIRO PRO");
        assert_eq!(parsed.percent_used, 27);
        assert_eq!(parsed.reset_at, "03/01");
        assert_eq!(parsed.limit_credits.round() as u64, 1000);
    }
}
