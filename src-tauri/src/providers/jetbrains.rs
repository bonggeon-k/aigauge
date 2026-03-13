use crate::credentials::CredentialManager;
use once_cell::sync::Lazy;
use regex::Regex;
use reqwest::Client;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::SystemTime;
use tracing::instrument;

use super::{
    home_dir, not_configured_quota, not_configured_usage, unreachable_quota, unreachable_usage,
    AuthMethod, AuthSourceMode, CostData, Provider, ProviderInfo, ProviderStatus, QuotaLimit,
    Result, UsageData,
};

static LAST_PLAN: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new("JetBrains AI".to_string()));
static COMPONENT_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r#"(?s)<component[^>]*name\s*=\s*[\"']AIAssistantQuotaManager2[\"'][^>]*>.*?</component>"#,
    )
    .expect("valid component regex")
});
static OPTION_NAME_FIRST_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"<option[^>]*name\s*=\s*[\"']([\w]+)[\"'][^>]*value\s*=\s*[\"']([^\"']*)[\"']"#)
        .expect("valid option regex")
});
static OPTION_VALUE_FIRST_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"<option[^>]*value\s*=\s*[\"']([^\"']*)[\"'][^>]*name\s*=\s*[\"']([\w]+)[\"']"#)
        .expect("valid option regex")
});

enum UsageFetchResult<T> {
    Ok(T),
    NotConfigured,
    Unreachable,
}

#[derive(Debug, Clone)]
struct JetBrainsSnapshot {
    plan_name: String,
    used: f64,
    limit: f64,
    reset_at: String,
}

pub struct JetBrainsProvider {
    credential_manager: CredentialManager,
    #[allow(dead_code)]
    client: Client,
}

impl JetBrainsProvider {
    #[instrument(skip(credential_manager))]
    pub fn new(credential_manager: CredentialManager, client: Client) -> Self {
        Self {
            credential_manager,
            client,
        }
    }

    fn ide_patterns() -> &'static [(&'static str, &'static str)] {
        &[
            ("IntelliJIdea", "IntelliJ IDEA"),
            ("PyCharm", "PyCharm"),
            ("WebStorm", "WebStorm"),
            ("GoLand", "GoLand"),
            ("CLion", "CLion"),
            ("DataGrip", "DataGrip"),
            ("RubyMine", "RubyMine"),
            ("Rider", "Rider"),
            ("PhpStorm", "PhpStorm"),
            ("AppCode", "AppCode"),
            ("Fleet", "Fleet"),
            ("AndroidStudio", "Android Studio"),
            ("RustRover", "RustRover"),
            ("Aqua", "Aqua"),
            ("DataSpell", "DataSpell"),
        ]
    }

    fn configured_override_path(&self) -> Option<PathBuf> {
        let credential = self
            .credential_manager
            .get_credential("jetbrains")
            .ok()
            .flatten()?;

        let raw = credential.trim();
        if raw.is_empty() {
            return None;
        }

        let path = PathBuf::from(raw);
        if path.extension().and_then(|ext| ext.to_str()) == Some("xml") {
            Some(path)
        } else {
            Some(path.join("options").join("AIAssistantQuotaManager2.xml"))
        }
    }

    fn candidate_base_paths() -> Vec<PathBuf> {
        let mut paths = Vec::new();

        if let Some(home) = home_dir() {
            paths.push(home.join(".config").join("JetBrains"));
            paths.push(home.join(".local").join("share").join("JetBrains"));
            paths.push(home.join(".config").join("Google"));
            paths.push(
                home.join("Library")
                    .join("Application Support")
                    .join("JetBrains"),
            );
            paths.push(
                home.join("Library")
                    .join("Application Support")
                    .join("Google"),
            );
            paths.push(home.join("AppData").join("Roaming").join("JetBrains"));
            paths.push(home.join("AppData").join("Local").join("JetBrains"));
        }

        if let Ok(app_data) = std::env::var("APPDATA") {
            paths.push(PathBuf::from(app_data).join("JetBrains"));
        }
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            paths.push(PathBuf::from(local_app_data).join("JetBrains"));
        }

        paths
    }

    fn detect_latest_quota_path() -> Option<PathBuf> {
        Self::detect_latest_quota_path_in(Self::candidate_base_paths().as_slice())
    }

    fn detect_latest_quota_path_in(base_paths: &[PathBuf]) -> Option<PathBuf> {
        let mut latest: Option<(PathBuf, SystemTime)> = None;

        for base in base_paths {
            let entries = match fs::read_dir(base) {
                Ok(entries) => entries,
                Err(_) => continue,
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }

                let name = path.file_name()?.to_string_lossy();
                if !Self::ide_patterns()
                    .iter()
                    .any(|(prefix, _)| name.starts_with(prefix))
                {
                    continue;
                }

                let quota_path = path.join("options").join("AIAssistantQuotaManager2.xml");
                let metadata = match fs::metadata(&quota_path) {
                    Ok(metadata) => metadata,
                    Err(_) => continue,
                };

                let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
                match &latest {
                    Some((_, previous)) if *previous >= modified => {}
                    _ => latest = Some((quota_path, modified)),
                }
            }
        }

        latest.map(|value| value.0)
    }

    fn decode_html_entities(raw: &str) -> String {
        raw.replace("&#10;", "\n")
            .replace("&quot;", "\"")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&apos;", "'")
    }

    fn extract_component_block(raw: &str) -> Option<String> {
        COMPONENT_RE.find(raw).map(|m| m.as_str().to_string())
    }

    fn extract_option_values(component: &str) -> std::collections::HashMap<String, String> {
        let mut values = std::collections::HashMap::new();

        for captures in OPTION_NAME_FIRST_RE.captures_iter(component) {
            let name = captures.get(1).map(|m| m.as_str()).unwrap_or("");
            let value = captures.get(2).map(|m| m.as_str()).unwrap_or("");
            if !name.is_empty() {
                values.insert(name.to_string(), value.to_string());
            }
        }

        for captures in OPTION_VALUE_FIRST_RE.captures_iter(component) {
            let value = captures.get(1).map(|m| m.as_str()).unwrap_or("");
            let name = captures.get(2).map(|m| m.as_str()).unwrap_or("");
            if !name.is_empty() {
                values.insert(name.to_string(), value.to_string());
            }
        }

        values
    }

    fn parse_f64_field(value: &Value, path: &str) -> Option<f64> {
        value.pointer(path).and_then(|field| {
            field
                .as_f64()
                .or_else(|| field.as_str()?.parse::<f64>().ok())
        })
    }

    fn parse_snapshot_from_xml(raw: &str) -> Option<JetBrainsSnapshot> {
        let component = Self::extract_component_block(raw)?;
        let options = Self::extract_option_values(component.as_str());

        let quota_info_raw = options.get("quotaInfo")?;
        let decoded_quota = Self::decode_html_entities(quota_info_raw);
        let quota_json: Value = serde_json::from_str(decoded_quota.as_str()).ok()?;

        let plan = quota_json
            .pointer("/type")
            .and_then(Value::as_str)
            .map(|value| format!("JetBrains {}", capitalize(value)))
            .unwrap_or_else(|| "JetBrains AI".to_string());

        let used = Self::parse_f64_field(&quota_json, "/current").unwrap_or(0.0);
        let limit = Self::parse_f64_field(&quota_json, "/maximum").unwrap_or(0.0);

        let reset_at = options
            .get("nextRefill")
            .map(|raw| Self::decode_html_entities(raw))
            .and_then(|decoded| {
                let refill_json: Value = serde_json::from_str(decoded.as_str()).ok()?;
                refill_json
                    .pointer("/next")
                    .and_then(Value::as_str)
                    .map(|value| value.to_string())
                    .or_else(|| {
                        refill_json
                            .pointer("/tariff/until")
                            .and_then(Value::as_str)
                            .map(|value| value.to_string())
                    })
            })
            .or_else(|| {
                quota_json
                    .pointer("/until")
                    .and_then(Value::as_str)
                    .map(|value| value.to_string())
            })
            .unwrap_or_default();

        Some(JetBrainsSnapshot {
            plan_name: plan,
            used,
            limit,
            reset_at,
        })
    }

    fn read_snapshot(&self) -> UsageFetchResult<JetBrainsSnapshot> {
        let path = self
            .configured_override_path()
            .or_else(Self::detect_latest_quota_path);

        let Some(path) = path else {
            return UsageFetchResult::NotConfigured;
        };

        let raw = match fs::read_to_string(path) {
            Ok(raw) => raw,
            Err(_) => return UsageFetchResult::Unreachable,
        };

        let Some(snapshot) = Self::parse_snapshot_from_xml(raw.as_str()) else {
            return UsageFetchResult::Unreachable;
        };

        UsageFetchResult::Ok(snapshot)
    }
}

impl Provider for JetBrainsProvider {
    async fn name(&self) -> &str {
        "jetbrains"
    }

    async fn provider_info(&self) -> ProviderInfo {
        let plan = LAST_PLAN
            .lock()
            .map(|value| value.clone())
            .unwrap_or_else(|_| "JetBrains AI".to_string());
        ProviderInfo {
            id: "jetbrains".to_string(),
            name: "JetBrains AI Assistant".to_string(),
            icon: "brain-circuit".to_string(),
            auth_method: AuthMethod::None,
            supported_auth_modes: vec![AuthSourceMode::Auto, AuthSourceMode::Token],
            default_auth_mode: AuthSourceMode::Auto,
            plan_name: plan,
            quota_limit: 100,
            reset_period: "monthly".to_string(),
        }
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        let snapshot = match self.read_snapshot() {
            UsageFetchResult::Ok(snapshot) => snapshot,
            UsageFetchResult::NotConfigured => return Ok(not_configured_usage("jetbrains")),
            UsageFetchResult::Unreachable => return Ok(unreachable_usage("jetbrains")),
        };

        if let Ok(mut guard) = LAST_PLAN.lock() {
            *guard = snapshot.plan_name.clone();
        }

        let used_percent = if snapshot.limit > 0.0 {
            (snapshot.used / snapshot.limit) * 100.0
        } else {
            0.0
        };

        Ok(UsageData {
            provider: "jetbrains".to_string(),
            requests: used_percent.round() as u64,
            tokens: snapshot.used.round() as u64,
            period_start: String::new(),
            period_end: snapshot.reset_at,
            status: ProviderStatus::Ok,
        })
    }

    async fn fetch_cost(&self) -> Result<Option<CostData>> {
        Ok(None)
    }

    async fn fetch_quota(&self) -> Result<QuotaLimit> {
        let snapshot = match self.read_snapshot() {
            UsageFetchResult::Ok(snapshot) => snapshot,
            UsageFetchResult::NotConfigured => return Ok(not_configured_quota()),
            UsageFetchResult::Unreachable => return Ok(unreachable_quota("credits")),
        };

        Ok(QuotaLimit {
            used: snapshot.used.round() as u64,
            limit: snapshot.limit.round() as u64,
            unit: "credits".to_string(),
            reset_at: snapshot.reset_at,
            status: ProviderStatus::Ok,
        })
    }

    fn auth_method(&self) -> AuthMethod {
        AuthMethod::None
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
    fn extracts_quota_info_from_xml() {
        let xml = r#"
<application>
  <component name="AIAssistantQuotaManager2">
    <option name="quotaInfo" value="{&quot;type&quot;:&quot;free&quot;,&quot;current&quot;:&quot;5000&quot;,&quot;maximum&quot;:&quot;100000&quot;,&quot;until&quot;:&quot;2026-03-01T00:00:00Z&quot;}" />
    <option name="nextRefill" value="{&quot;next&quot;:&quot;2026-03-01T00:00:00Z&quot;}" />
  </component>
</application>
"#;

        let snapshot = JetBrainsProvider::parse_snapshot_from_xml(xml).expect("snapshot");
        assert_eq!(snapshot.plan_name, "JetBrains Free");
        assert_eq!(snapshot.used.round() as u64, 5000);
        assert_eq!(snapshot.limit.round() as u64, 100000);
        assert_eq!(snapshot.reset_at, "2026-03-01T00:00:00Z");
    }

    #[test]
    fn decodes_html_entities() {
        assert_eq!(
            JetBrainsProvider::decode_html_entities("{&quot;x&quot;:&quot;y&quot;}&amp;"),
            "{\"x\":\"y\"}&"
        );
    }

    #[test]
    fn finds_latest_quota_even_when_first_base_is_missing() {
        let temp = tempfile::tempdir().expect("tempdir");
        let missing = temp.path().join("missing");
        let base = temp.path().join("base");
        let ide_dir = base.join("IntelliJIdea2025.1");
        let quota = ide_dir.join("options").join("AIAssistantQuotaManager2.xml");
        fs::create_dir_all(quota.parent().expect("parent")).expect("create dirs");
        fs::write(
            &quota,
            r#"<application><component name="AIAssistantQuotaManager2"><option name="quotaInfo" value="{&quot;type&quot;:&quot;free&quot;,&quot;current&quot;:&quot;10&quot;,&quot;maximum&quot;:&quot;100&quot;}" /></component></application>"#,
        )
        .expect("write quota file");

        let bases = vec![missing, base];
        let found = JetBrainsProvider::detect_latest_quota_path_in(bases.as_slice())
            .expect("expected quota path");
        assert_eq!(found, quota);
    }
}
