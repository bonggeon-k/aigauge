use crate::credentials::CredentialManager;
use crate::platform;
use once_cell::sync::Lazy;
use reqwest::header::{ACCEPT, COOKIE};
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use tracing::instrument;

use super::{
    not_configured_quota, not_configured_usage, unreachable_quota, unreachable_usage, AuthMethod,
    AuthSourceMode, CostData, Provider, ProviderInfo, ProviderStatus, QuotaLimit, Result,
    UsageData,
};

enum UsageFetchResult<T> {
    Ok(T),
    NotConfigured,
    Unreachable,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorUsageSummary {
    billing_cycle_start: Option<String>,
    billing_cycle_end: Option<String>,
    membership_type: Option<String>,
    individual_usage: Option<CursorIndividualUsage>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorIndividualUsage {
    plan: Option<CursorPlanUsage>,
    on_demand: Option<CursorOnDemandUsage>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorPlanUsage {
    used: Option<f64>,
    limit: Option<f64>,
    total_percent_used: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorOnDemandUsage {
    used: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
struct CursorUserInfo {
    sub: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorLegacyUsageResponse {
    #[serde(rename = "gpt-4")]
    gpt_4: Option<CursorLegacyModelUsage>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorLegacyModelUsage {
    num_requests: Option<u64>,
    num_requests_total: Option<u64>,
    max_request_usage: Option<u64>,
}

#[derive(Debug, Clone)]
struct CursorSnapshot {
    plan_percent_used: f64,
    on_demand_used_usd: f64,
    billing_cycle_start: String,
    billing_cycle_end: String,
    plan_name: String,
    requests_used: Option<u64>,
    requests_limit: Option<u64>,
}

static LAST_PLAN: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new("Cursor Pro".to_string()));

pub struct CursorProvider {
    credential_manager: CredentialManager,
    client: Client,
}

impl CursorProvider {
    #[instrument(skip(credential_manager))]
    pub fn new(credential_manager: CredentialManager, client: Client) -> Self {
        Self {
            credential_manager,
            client,
        }
    }

    fn codexbar_session_paths() -> Vec<PathBuf> {
        let mut paths = Vec::new();

        if let Some(home) = super::home_dir() {
            paths.push(
                home.join("Library")
                    .join("Application Support")
                    .join("CodexBar")
                    .join("cursor-session.json"),
            );
            paths.push(
                home.join(".local")
                    .join("share")
                    .join("CodexBar")
                    .join("cursor-session.json"),
            );
            paths.push(
                home.join("AppData")
                    .join("Roaming")
                    .join("CodexBar")
                    .join("cursor-session.json"),
            );
        }

        if let Ok(app_data) = std::env::var("APPDATA") {
            paths.push(
                PathBuf::from(app_data)
                    .join("CodexBar")
                    .join("cursor-session.json"),
            );
        }

        if let Ok(custom) = std::env::var("CURSOR_SESSION_FILE") {
            paths.push(PathBuf::from(custom));
        }

        paths
    }

    fn parse_cookie_header_from_session_json(raw: &str) -> Option<String> {
        let value: Value = serde_json::from_str(raw).ok()?;
        let cookies = value.as_array()?;
        let mut pairs = Vec::new();

        for cookie in cookies {
            let object = match cookie.as_object() {
                Some(object) => object,
                None => continue,
            };

            let name = object
                .get("Name")
                .or_else(|| object.get("name"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            let value = object
                .get("Value")
                .or_else(|| object.get("value"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();

            if name.is_empty() || value.is_empty() {
                continue;
            }

            pairs.push(format!("{name}={value}"));
        }

        if pairs.is_empty() {
            None
        } else {
            Some(pairs.join("; "))
        }
    }

    fn read_cookie_header_from_codexbar_session() -> Option<String> {
        for path in Self::codexbar_session_paths() {
            let Ok(raw) = fs::read_to_string(path) else {
                continue;
            };
            if let Some(header) = Self::parse_cookie_header_from_session_json(raw.as_str()) {
                return Some(header);
            }
        }
        None
    }

    fn firefox_profile_roots() -> Vec<PathBuf> {
        let mut roots = Vec::new();

        if let Some(home) = super::home_dir() {
            roots.push(home.join(".mozilla").join("firefox"));
            roots.push(
                home.join("Library")
                    .join("Application Support")
                    .join("Firefox")
                    .join("Profiles"),
            );
            roots.push(
                home.join("AppData")
                    .join("Roaming")
                    .join("Mozilla")
                    .join("Firefox")
                    .join("Profiles"),
            );
        }

        if let Ok(app_data) = std::env::var("APPDATA") {
            roots.push(
                PathBuf::from(app_data)
                    .join("Mozilla")
                    .join("Firefox")
                    .join("Profiles"),
            );
        }

        roots
    }

    fn firefox_cookie_dbs() -> Vec<PathBuf> {
        let mut dbs = Vec::new();
        for root in Self::firefox_profile_roots() {
            let Ok(entries) = fs::read_dir(root) else {
                continue;
            };
            for entry in entries.flatten() {
                let profile = entry.path();
                if !profile.is_dir() {
                    continue;
                }
                let db = profile.join("cookies.sqlite");
                if db.exists() {
                    dbs.push(db);
                }
            }
        }
        dbs
    }

    fn chromium_cookie_dbs() -> Vec<PathBuf> {
        let mut roots = Vec::new();

        if let Some(home) = super::home_dir() {
            roots.push(home.join(".config").join("google-chrome"));
            roots.push(home.join(".config").join("chromium"));
            roots.push(home.join(".config").join("vivaldi"));
            roots.push(home.join(".config").join("opera"));
            roots.push(
                home.join(".config")
                    .join("BraveSoftware")
                    .join("Brave-Browser"),
            );
            roots.push(
                home.join("Library")
                    .join("Application Support")
                    .join("Google")
                    .join("Chrome"),
            );
            roots.push(
                home.join("Library")
                    .join("Application Support")
                    .join("Chromium"),
            );
            roots.push(
                home.join("Library")
                    .join("Application Support")
                    .join("Vivaldi"),
            );
            roots.push(
                home.join("Library")
                    .join("Application Support")
                    .join("com.operasoftware.Opera"),
            );
            roots.push(
                home.join("Library")
                    .join("Application Support")
                    .join("Arc")
                    .join("User Data"),
            );
            roots.push(
                home.join("Library")
                    .join("Application Support")
                    .join("BraveSoftware")
                    .join("Brave-Browser"),
            );
            roots.push(
                home.join("AppData")
                    .join("Local")
                    .join("Google")
                    .join("Chrome")
                    .join("User Data"),
            );
            roots.push(
                home.join("AppData")
                    .join("Local")
                    .join("Vivaldi")
                    .join("User Data"),
            );
            roots.push(
                home.join("AppData")
                    .join("Local")
                    .join("Chromium")
                    .join("User Data"),
            );
            roots.push(
                home.join("AppData")
                    .join("Local")
                    .join("BraveSoftware")
                    .join("Brave-Browser")
                    .join("User Data"),
            );
            roots.push(
                home.join("AppData")
                    .join("Local")
                    .join("Microsoft")
                    .join("Edge")
                    .join("User Data"),
            );
        }

        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            roots.push(
                PathBuf::from(local_app_data.clone())
                    .join("Google")
                    .join("Chrome")
                    .join("User Data"),
            );
            roots.push(
                PathBuf::from(local_app_data.clone())
                    .join("Vivaldi")
                    .join("User Data"),
            );
            roots.push(
                PathBuf::from(local_app_data.clone())
                    .join("Chromium")
                    .join("User Data"),
            );
            roots.push(
                PathBuf::from(local_app_data.clone())
                    .join("BraveSoftware")
                    .join("Brave-Browser")
                    .join("User Data"),
            );
            roots.push(
                PathBuf::from(local_app_data.clone())
                    .join("Microsoft")
                    .join("Edge")
                    .join("User Data"),
            );
            roots.push(
                PathBuf::from(local_app_data.clone())
                    .join("Programs")
                    .join("Opera")
                    .join("User Data"),
            );
        }

        let mut dbs = Vec::new();
        let mut seen = HashSet::new();
        for root in roots {
            for db in Self::chromium_cookie_dbs_from_root(root.as_path()) {
                if seen.insert(db.clone()) {
                    dbs.push(db);
                }
            }
        }

        dbs
    }

    fn chromium_profile_dirs(root: &Path) -> Vec<PathBuf> {
        let mut profiles = Vec::new();

        let default_profile = root.join("Default");
        if default_profile.is_dir() {
            profiles.push(default_profile);
        }

        let Ok(entries) = fs::read_dir(root) else {
            return profiles;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
                continue;
            };
            if name == "Default"
                || name.starts_with("Profile ")
                || name == "Guest Profile"
                || name == "System Profile"
            {
                profiles.push(path);
            }
        }

        profiles
    }

    fn chromium_cookie_dbs_from_root(root: &Path) -> Vec<PathBuf> {
        let mut dbs = Vec::new();
        let mut seen = HashSet::new();

        for direct in [root.join("Network").join("Cookies"), root.join("Cookies")] {
            if direct.exists() && seen.insert(direct.clone()) {
                dbs.push(direct);
            }
        }

        for profile in Self::chromium_profile_dirs(root) {
            for candidate in [
                profile.join("Network").join("Cookies"),
                profile.join("Cookies"),
            ] {
                if candidate.exists() && seen.insert(candidate.clone()) {
                    dbs.push(candidate);
                }
            }
        }

        dbs
    }

    fn parse_sqlite_cookie_rows(raw: &str) -> Option<String> {
        let mut cookies: HashMap<String, String> = HashMap::new();
        for line in raw.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let Some((name, value)) = trimmed.split_once('=') else {
                continue;
            };

            if name.is_empty() || value.is_empty() {
                continue;
            }
            cookies.insert(name.to_string(), value.to_string());
        }

        if cookies.is_empty() {
            return None;
        }

        let mut keys = cookies.keys().cloned().collect::<Vec<_>>();
        keys.sort();
        Some(
            keys.into_iter()
                .filter_map(|key| cookies.get(&key).map(|value| format!("{key}={value}")))
                .collect::<Vec<_>>()
                .join("; "),
        )
    }

    fn read_cookie_header_from_firefox() -> Option<String> {
        let query = "SELECT name || '=' || value FROM moz_cookies WHERE (host LIKE '%cursor.com%' OR host LIKE '%cursor.sh%') AND value != ''";
        for db in Self::firefox_cookie_dbs() {
            let mut process = Command::new("sqlite3");
            platform::configure_hidden_process(&mut process);
            let output = match process.arg(db).arg(query).output() {
                Ok(output) => output,
                Err(_) => continue,
            };
            if !output.status.success() {
                continue;
            }

            let rows = String::from_utf8_lossy(&output.stdout);
            if let Some(header) = Self::parse_sqlite_cookie_rows(rows.as_ref()) {
                return Some(header);
            }
        }
        None
    }

    fn read_cookie_header_from_chromium() -> Option<String> {
        // Chromium cookies are frequently encrypted. We only consume plaintext `value` rows
        // here as a best-effort fallback and keep encrypted-value decryption for phase 5.
        let query = "SELECT name || '=' || value FROM cookies WHERE (host_key LIKE '%cursor.com%' OR host_key LIKE '%cursor.sh%') AND value != ''";
        for db in Self::chromium_cookie_dbs() {
            let mut process = Command::new("sqlite3");
            platform::configure_hidden_process(&mut process);
            let output = match process.arg(db).arg(query).output() {
                Ok(output) => output,
                Err(_) => continue,
            };
            if !output.status.success() {
                continue;
            }

            let rows = String::from_utf8_lossy(&output.stdout);
            if let Some(header) = Self::parse_sqlite_cookie_rows(rows.as_ref()) {
                return Some(header);
            }
        }
        None
    }

    fn normalize_cookie_header(raw: &str) -> Option<String> {
        let mut value = raw.trim().to_string();
        if value.is_empty() {
            return None;
        }

        if let Some(stripped) = value.strip_prefix("Cookie:") {
            value = stripped.trim().to_string();
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

    fn resolve_cookie_header(&self) -> Option<String> {
        self.credential_manager
            .get_credential("cursor")
            .ok()
            .flatten()
            .and_then(|value| Self::normalize_cookie_header(value.as_str()))
            .or_else(|| {
                std::env::var("CURSOR_COOKIE_HEADER")
                    .ok()
                    .and_then(|value| Self::normalize_cookie_header(value.as_str()))
            })
            .or_else(Self::read_cookie_header_from_codexbar_session)
            .or_else(Self::read_cookie_header_from_firefox)
            .or_else(Self::read_cookie_header_from_chromium)
    }

    async fn fetch_usage_summary(
        &self,
        cookie_header: &str,
    ) -> UsageFetchResult<CursorUsageSummary> {
        let response = match self
            .client
            .get("https://cursor.com/api/usage-summary")
            .header(ACCEPT, "application/json")
            .header(COOKIE, cookie_header)
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

        match response.json::<CursorUsageSummary>().await {
            Ok(value) => UsageFetchResult::Ok(value),
            Err(_) => UsageFetchResult::Unreachable,
        }
    }

    async fn fetch_user_info(&self, cookie_header: &str) -> Option<CursorUserInfo> {
        let response = self
            .client
            .get("https://cursor.com/api/auth/me")
            .header(ACCEPT, "application/json")
            .header(COOKIE, cookie_header)
            .send()
            .await
            .ok()?;

        if !response.status().is_success() {
            return None;
        }

        response.json::<CursorUserInfo>().await.ok()
    }

    async fn fetch_legacy_usage(
        &self,
        cookie_header: &str,
        user_id: &str,
    ) -> Option<CursorLegacyUsageResponse> {
        let response = self
            .client
            .get("https://cursor.com/api/usage")
            .query(&[("user", user_id)])
            .header(ACCEPT, "application/json")
            .header(COOKIE, cookie_header)
            .send()
            .await
            .ok()?;

        if !response.status().is_success() {
            return None;
        }

        response.json::<CursorLegacyUsageResponse>().await.ok()
    }

    fn normalize_percent(raw: f64) -> f64 {
        if raw <= 1.0 {
            (raw * 100.0).clamp(0.0, 100.0)
        } else {
            raw.clamp(0.0, 100.0)
        }
    }

    fn map_membership_type(value: Option<&str>) -> String {
        let raw = value.unwrap_or("pro").to_lowercase();
        if raw.contains("enterprise") {
            "Cursor Enterprise".to_string()
        } else if raw.contains("team") {
            "Cursor Team".to_string()
        } else if raw.contains("hobby") || raw.contains("free") {
            "Cursor Hobby".to_string()
        } else {
            "Cursor Pro".to_string()
        }
    }

    fn build_snapshot(
        summary: CursorUsageSummary,
        legacy: Option<CursorLegacyUsageResponse>,
    ) -> CursorSnapshot {
        let plan_used_raw = summary
            .individual_usage
            .as_ref()
            .and_then(|usage| usage.plan.as_ref())
            .and_then(|plan| plan.used)
            .unwrap_or(0.0);

        let plan_limit_raw = summary
            .individual_usage
            .as_ref()
            .and_then(|usage| usage.plan.as_ref())
            .and_then(|plan| plan.limit)
            .unwrap_or(0.0);

        let plan_percent = if plan_limit_raw > 0.0 {
            (plan_used_raw / plan_limit_raw) * 100.0
        } else {
            summary
                .individual_usage
                .as_ref()
                .and_then(|usage| usage.plan.as_ref())
                .and_then(|plan| plan.total_percent_used)
                .map(Self::normalize_percent)
                .unwrap_or(0.0)
        };

        let on_demand_used_usd = summary
            .individual_usage
            .as_ref()
            .and_then(|usage| usage.on_demand.as_ref())
            .and_then(|on_demand| on_demand.used)
            .map(|used| used / 100.0)
            .unwrap_or(0.0);

        let requests_used = legacy
            .as_ref()
            .and_then(|legacy| legacy.gpt_4.as_ref())
            .and_then(|usage| usage.num_requests_total.or(usage.num_requests));

        let requests_limit = legacy
            .as_ref()
            .and_then(|legacy| legacy.gpt_4.as_ref())
            .and_then(|usage| usage.max_request_usage);

        CursorSnapshot {
            plan_percent_used: plan_percent.clamp(0.0, 100.0),
            on_demand_used_usd,
            billing_cycle_start: summary.billing_cycle_start.unwrap_or_default(),
            billing_cycle_end: summary.billing_cycle_end.unwrap_or_default(),
            plan_name: Self::map_membership_type(summary.membership_type.as_deref()),
            requests_used,
            requests_limit,
        }
    }

    async fn fetch_snapshot(&self) -> UsageFetchResult<CursorSnapshot> {
        let Some(cookie_header) = self.resolve_cookie_header() else {
            return UsageFetchResult::NotConfigured;
        };

        let summary = match self.fetch_usage_summary(cookie_header.as_str()).await {
            UsageFetchResult::Ok(summary) => summary,
            UsageFetchResult::NotConfigured => return UsageFetchResult::NotConfigured,
            UsageFetchResult::Unreachable => return UsageFetchResult::Unreachable,
        };

        let user = self.fetch_user_info(cookie_header.as_str()).await;
        let legacy = if let Some(user_id) = user.and_then(|user| user.sub) {
            self.fetch_legacy_usage(cookie_header.as_str(), user_id.as_str())
                .await
        } else {
            None
        };
        let snapshot = Self::build_snapshot(summary, legacy);
        if let Ok(mut guard) = LAST_PLAN.lock() {
            *guard = snapshot.plan_name.clone();
        }
        UsageFetchResult::Ok(snapshot)
    }
}

impl Provider for CursorProvider {
    async fn name(&self) -> &str {
        "cursor"
    }

    async fn provider_info(&self) -> ProviderInfo {
        let plan = LAST_PLAN
            .lock()
            .map(|value| value.clone())
            .unwrap_or_else(|_| "Cursor Pro".to_string());
        ProviderInfo {
            id: "cursor".to_string(),
            name: "Cursor".to_string(),
            icon: "mouse-pointer-click".to_string(),
            auth_method: AuthMethod::Token,
            supported_auth_modes: vec![AuthSourceMode::Token],
            default_auth_mode: AuthSourceMode::Token,
            plan_name: plan,
            quota_limit: 100,
            reset_period: "monthly".to_string(),
        }
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        let snapshot = match self.fetch_snapshot().await {
            UsageFetchResult::Ok(snapshot) => snapshot,
            UsageFetchResult::NotConfigured => return Ok(not_configured_usage("cursor")),
            UsageFetchResult::Unreachable => return Ok(unreachable_usage("cursor")),
        };

        let (requests, tokens) = match (snapshot.requests_used, snapshot.requests_limit) {
            (Some(used), Some(limit)) if limit > 0 => (used, limit),
            _ => (
                snapshot.plan_percent_used.round() as u64,
                (snapshot.on_demand_used_usd * 100.0).round() as u64,
            ),
        };

        Ok(UsageData {
            provider: "cursor".to_string(),
            requests,
            tokens,
            period_start: snapshot.billing_cycle_start,
            period_end: snapshot.billing_cycle_end,
            status: ProviderStatus::Ok,
        })
    }

    async fn fetch_cost(&self) -> Result<Option<CostData>> {
        let snapshot = match self.fetch_snapshot().await {
            UsageFetchResult::Ok(snapshot) => snapshot,
            UsageFetchResult::NotConfigured | UsageFetchResult::Unreachable => return Ok(None),
        };

        Ok(Some(CostData {
            provider: "cursor".to_string(),
            currency: "USD".to_string(),
            total: snapshot.on_demand_used_usd,
            period_start: snapshot.billing_cycle_start,
            period_end: snapshot.billing_cycle_end,
            status: ProviderStatus::Ok,
        }))
    }

    async fn fetch_quota(&self) -> Result<QuotaLimit> {
        let snapshot = match self.fetch_snapshot().await {
            UsageFetchResult::Ok(snapshot) => snapshot,
            UsageFetchResult::NotConfigured => return Ok(not_configured_quota()),
            UsageFetchResult::Unreachable => return Ok(unreachable_quota("percent")),
        };

        if let (Some(used), Some(limit)) = (snapshot.requests_used, snapshot.requests_limit) {
            return Ok(QuotaLimit {
                used,
                limit,
                unit: "requests".to_string(),
                reset_at: snapshot.billing_cycle_end,
                status: ProviderStatus::Ok,
            });
        }

        Ok(QuotaLimit {
            used: snapshot.plan_percent_used.round() as u64,
            limit: 100,
            unit: "percent".to_string(),
            reset_at: snapshot.billing_cycle_end,
            status: ProviderStatus::Ok,
        })
    }

    fn auth_method(&self) -> AuthMethod {
        AuthMethod::Token
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_summary_into_snapshot() {
        let summary = CursorUsageSummary {
            billing_cycle_start: Some("2026-02-01".to_string()),
            billing_cycle_end: Some("2026-03-01".to_string()),
            membership_type: Some("enterprise".to_string()),
            individual_usage: Some(CursorIndividualUsage {
                plan: Some(CursorPlanUsage {
                    used: Some(1200.0),
                    limit: Some(2400.0),
                    total_percent_used: None,
                }),
                on_demand: Some(CursorOnDemandUsage { used: Some(250.0) }),
            }),
        };

        let snapshot = CursorProvider::build_snapshot(summary, None);
        assert!((snapshot.plan_percent_used - 50.0).abs() < 0.001);
        assert!((snapshot.on_demand_used_usd - 2.5).abs() < 0.001);
        assert_eq!(snapshot.plan_name, "Cursor Enterprise");
    }

    #[test]
    fn normalizes_cookie_header_values() {
        assert_eq!(
            CursorProvider::normalize_cookie_header("Cookie: foo=bar; baz=qux"),
            Some("foo=bar; baz=qux".to_string())
        );
    }

    #[test]
    fn parses_codexbar_session_cookie_json() {
        let raw = r#"
[
  {"Name":"WorkosCursorSessionToken","Value":"abc"},
  {"Name":"next-auth.session-token","Value":"xyz"}
]
"#;
        let parsed = CursorProvider::parse_cookie_header_from_session_json(raw).expect("cookie");
        assert!(parsed.contains("WorkosCursorSessionToken=abc"));
        assert!(parsed.contains("next-auth.session-token=xyz"));
    }

    #[test]
    fn parses_sqlite_cookie_rows() {
        let rows = "foo=bar\nbaz=qux\n";
        let parsed = CursorProvider::parse_sqlite_cookie_rows(rows).expect("rows");
        assert!(parsed.contains("foo=bar"));
        assert!(parsed.contains("baz=qux"));
    }

    #[test]
    fn discovers_chromium_cookie_dbs_from_dynamic_profiles() {
        let temp = tempfile::tempdir().expect("temp dir");
        let root = temp.path().join("User Data");

        let default_db = root.join("Default").join("Network").join("Cookies");
        let profile_db = root.join("Profile 7").join("Network").join("Cookies");
        let guest_db = root.join("Guest Profile").join("Network").join("Cookies");

        fs::create_dir_all(default_db.parent().expect("default parent")).expect("default dir");
        fs::create_dir_all(profile_db.parent().expect("profile parent")).expect("profile dir");
        fs::create_dir_all(guest_db.parent().expect("guest parent")).expect("guest dir");

        fs::write(&default_db, "").expect("default cookie");
        fs::write(&profile_db, "").expect("profile cookie");
        fs::write(&guest_db, "").expect("guest cookie");

        let dbs = CursorProvider::chromium_cookie_dbs_from_root(root.as_path());
        assert!(dbs.contains(&default_db));
        assert!(dbs.contains(&profile_db));
        assert!(dbs.contains(&guest_db));
    }
}
