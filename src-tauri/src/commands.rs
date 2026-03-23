use crate::config::{AppConfig, ConfigStore};
use crate::cost_engine::CostEngine;
use crate::credentials::CredentialManager;
use crate::platform;
use crate::providers::claude::ClaudeProvider;
use crate::providers::codex::CodexProvider;
use crate::providers::copilot::CopilotProvider;
use crate::providers::cursor::CursorProvider;
use crate::providers::gemini::GeminiProvider;
use crate::providers::jetbrains::JetBrainsProvider;
use crate::providers::kiro::KiroProvider;
use crate::providers::{
    build_shared_http_client, AuthMethod, AuthSourceMode, CostData, Provider, ProviderError,
    ProviderInfo, ProviderStatus, QuotaLimit, UsageData,
};
use crate::quota_cache::{ProviderSnapshot, QuotaCache};
use chrono::Utc;
use futures::future::join_all;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{Emitter, Manager};
use tracing::instrument;

pub const PROVIDER_IDS: &[&str] = &[
    "codex",
    "claude",
    "gemini",
    "kiro",
    "copilot",
    "cursor",
    "jetbrains",
];
pub const TRUSTED_WINDOWS: &[&str] = &["main", "tray-popup"];
pub const MAIN_WINDOW_LABEL: &str = "main";
const MANUAL_INPUT_MAX: u64 = 1_000_000_000_000;

#[derive(Debug, Clone, Serialize)]
pub struct ProviderDescriptor {
    pub id: String,
    pub name: String,
    pub auth_method: AuthMethod,
}

#[derive(Debug, Clone, Serialize)]
pub struct HealthStatus {
    pub configured: bool,
    pub reachable: bool,
    pub last_checked: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DashboardEntry {
    pub info: ProviderInfo,
    pub usage: UsageData,
    pub quota: QuotaLimit,
    pub cost: Option<CostData>,
    pub tracks: Vec<UsageTrack>,
    pub preferred_track: TrackKind,
    pub cost_view: CostView,
    pub stale: bool,
    pub health: HealthStatus,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TrackKind {
    Subscription,
    Api,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CostDisplayMode {
    Included,
    Metered,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostView {
    pub mode: CostDisplayMode,
    pub currency: String,
    pub total: Option<f64>,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageTrack {
    pub id: String,
    pub kind: TrackKind,
    pub label: String,
    pub used: u64,
    pub limit: u64,
    pub unit: String,
    pub reset_at: String,
    pub status: ProviderStatus,
    pub source: DataSource,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotDeviceFlowStart {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: Option<String>,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotDeviceFlowPoll {
    pub status: String,
    pub message: Option<String>,
    pub interval: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManualProviderInput {
    pub provider: String,
    pub requests: u64,
    pub tokens: u64,
    pub used: u64,
    pub limit: u64,
    pub unit: String,
    pub reset_at: String,
    pub cost_total: Option<f64>,
    pub plan_name: Option<String>,
    #[serde(default)]
    pub track_kind: Option<TrackKind>,
}

const GITHUB_DEVICE_CLIENT_ID: &str = "Iv1.b507a08c87ecfe98";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DataSource {
    OAuth,
    Cli,
    Cache,
    Manual,
    Snapshot,
}

fn provider_default_auth_mode(provider: &str) -> AuthSourceMode {
    match provider {
        "codex" => AuthSourceMode::Auto,
        "claude" => AuthSourceMode::Auto,
        "gemini" => AuthSourceMode::ApiKey,
        "kiro" => AuthSourceMode::Cli,
        "copilot" => AuthSourceMode::OAuthToken,
        "cursor" => AuthSourceMode::Token,
        "jetbrains" => AuthSourceMode::Auto,
        _ => AuthSourceMode::Auto,
    }
}

fn provider_supports_mode(provider: &str, mode: AuthSourceMode) -> bool {
    let supported = match provider {
        "codex" => &[
            AuthSourceMode::Auto,
            AuthSourceMode::ApiKey,
            AuthSourceMode::OAuthToken,
        ][..],
        "claude" => &[AuthSourceMode::Auto, AuthSourceMode::OAuthToken][..],
        "gemini" => &[AuthSourceMode::ApiKey][..],
        "kiro" => &[AuthSourceMode::Cli][..],
        "copilot" => &[AuthSourceMode::OAuthToken, AuthSourceMode::Token][..],
        "cursor" => &[AuthSourceMode::Token][..],
        "jetbrains" => &[AuthSourceMode::Auto, AuthSourceMode::Token][..],
        _ => &[][..],
    };
    supported.contains(&mode)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ManualInputDocument {
    schema_version: u32,
    providers: HashMap<String, ManualProviderInput>,
}

pub struct ProviderRegistry {
    codex: CodexProvider,
    claude: ClaudeProvider,
    gemini: GeminiProvider,
    kiro: KiroProvider,
    copilot: CopilotProvider,
    cursor: CursorProvider,
    jetbrains: JetBrainsProvider,
}

pub struct AppState {
    pub providers: ProviderRegistry,
    pub credential_manager: CredentialManager,
    pub config_store: ConfigStore,
    pub quota_cache: QuotaCache,
    #[allow(dead_code)]
    pub http_client: Client,
}

impl AppState {
    #[instrument]
    pub fn new() -> Self {
        let credential_manager = CredentialManager::new();
        let http_client = build_shared_http_client().unwrap_or_else(|_| {
            Client::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .expect("failed to build fallback http client")
        });
        Self {
            providers: ProviderRegistry::new(credential_manager.clone(), http_client.clone()),
            credential_manager,
            config_store: ConfigStore,
            quota_cache: QuotaCache::default(),
            http_client,
        }
    }
}

pub fn ensure_trusted_window(window: &tauri::Window) -> Result<(), String> {
    if TRUSTED_WINDOWS
        .iter()
        .any(|candidate| *candidate == window.label())
    {
        return Ok(());
    }
    Err("unauthorized window context".to_string())
}

pub fn ensure_main_window(window: &tauri::Window) -> Result<(), String> {
    if window.label() == MAIN_WINDOW_LABEL {
        return Ok(());
    }
    Err("this command is restricted to the main window".to_string())
}

pub fn ensure_known_provider(provider: &str) -> Result<(), String> {
    if PROVIDER_IDS.contains(&provider) {
        return Ok(());
    }
    Err(format!("unsupported provider: {provider}"))
}

fn validate_manual_input(input: &ManualProviderInput) -> Result<(), String> {
    if input.provider.trim().is_empty() {
        return Err("manual input provider cannot be empty".to_string());
    }
    if input.used > MANUAL_INPUT_MAX
        || input.limit > MANUAL_INPUT_MAX
        || input.requests > MANUAL_INPUT_MAX
        || input.tokens > MANUAL_INPUT_MAX
    {
        return Err("manual input values exceed safe limits".to_string());
    }
    if let Some(cost) = input.cost_total {
        if !cost.is_finite() || !(0.0..=1_000_000_000.0).contains(&cost) {
            return Err("manual input cost_total is out of range".to_string());
        }
    }
    Ok(())
}

fn path_exists(path: &Path) -> bool {
    std::fs::metadata(path).is_ok()
}

fn provider_enabled_in_config(config: &AppConfig, provider: &str) -> bool {
    config
        .enabled_providers
        .iter()
        .any(|configured| configured == provider)
}

fn load_config_or_default(state: &AppState, app: &tauri::AppHandle) -> AppConfig {
    let mut config = state
        .config_store
        .load(app)
        .unwrap_or_else(|_| AppConfig::default());
    normalize_provider_auth_modes(&mut config);
    config
}

fn provider_selected_auth_mode(
    state: &AppState,
    app: &tauri::AppHandle,
    provider: &str,
) -> AuthSourceMode {
    let config = load_config_or_default(state, app);
    config
        .provider_auth_modes
        .get(provider)
        .copied()
        .unwrap_or_else(|| provider_default_auth_mode(provider))
}

fn normalize_provider_auth_modes(config: &mut AppConfig) {
    for provider in PROVIDER_IDS {
        config
            .provider_auth_modes
            .entry((*provider).to_string())
            .or_insert_with(|| provider_default_auth_mode(provider));
    }
}

fn sync_primary_credential_with_mode(
    state: &AppState,
    provider: &str,
    mode: AuthSourceMode,
) -> Result<(), String> {
    match mode {
        AuthSourceMode::ApiKey | AuthSourceMode::OAuthToken | AuthSourceMode::Token => {
            let slot = mode.slot_key();
            match state
                .credential_manager
                .get_credential_for_slot(provider, slot)
                .map_err(|error| error.to_string())?
            {
                Some(value) => state
                    .credential_manager
                    .save_credential(provider, value.to_string())
                    .map_err(|error| error.to_string())?,
                None => state
                    .credential_manager
                    .delete_credential(provider)
                    .map_err(|error| error.to_string())?,
            }
        }
        AuthSourceMode::Auto | AuthSourceMode::Cli | AuthSourceMode::None => {
            state
                .credential_manager
                .delete_credential(provider)
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn provider_has_manual_input(app: &tauri::AppHandle, provider: &str) -> bool {
    load_manual_inputs(app)
        .map(|entries| entries.contains_key(provider))
        .unwrap_or(false)
}

fn provider_has_local_auth_artifact(provider: &str) -> bool {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if provider == "kiro" {
        let has_local = {
            #[cfg(target_os = "windows")]
            {
                let mut command = std::process::Command::new("cmd.exe");
                platform::configure_hidden_process(&mut command);
                command
                    .args(["/C", "where kiro-cli >NUL 2>&1 || where kiro >NUL 2>&1"])
                    .status()
                    .map(|status| status.success())
                    .unwrap_or(false)
            }
            #[cfg(not(target_os = "windows"))]
            {
                let mut command = std::process::Command::new("bash");
                platform::configure_hidden_process(&mut command);
                command
                    .args([
                        "-lc",
                        "command -v kiro-cli >/dev/null 2>&1 || command -v kiro >/dev/null 2>&1",
                    ])
                    .status()
                    .map(|status| status.success())
                    .unwrap_or(false)
            }
        };

        let has_wsl = if platform::has_wsl() {
            let mut command = std::process::Command::new("wsl.exe");
            platform::configure_hidden_process(&mut command);
            command
                .args([
                    "-e",
                    "bash",
                    "-lc",
                    "command -v kiro-cli >/dev/null 2>&1 || command -v kiro >/dev/null 2>&1",
                ])
                .status()
                .map(|status| status.success())
                .unwrap_or(false)
        } else {
            false
        };

        return has_local || has_wsl;
    }

    match provider {
        "codex" => {
            if let Ok(codex_home) = std::env::var("CODEX_HOME") {
                let trimmed = codex_home.trim();
                if !trimmed.is_empty() {
                    candidates.push(PathBuf::from(trimmed).join("auth.json"));
                }
            }
            if let Some(home) = platform::home_dir() {
                candidates.push(home.join(".codex").join("auth.json"));
            }
            if let Some(path) = platform::wsl_to_windows_path("~/.codex/auth.json") {
                candidates.push(path);
            }
        }
        "claude" => {
            if let Some(home) = platform::home_dir() {
                candidates.push(home.join(".claude").join(".credentials.json"));
            }
            if let Some(path) = platform::wsl_to_windows_path("~/.claude/.credentials.json") {
                candidates.push(path);
            }
        }
        "gemini" => {
            if let Some(home) = platform::home_dir() {
                candidates.push(home.join(".gemini").join("oauth_creds.json"));
            }
            if let Some(path) = platform::wsl_to_windows_path("~/.gemini/oauth_creds.json") {
                candidates.push(path);
            }
        }
        "copilot" => {
            if let Some(home) = platform::home_dir() {
                candidates.push(home.join(".config").join("gh").join("hosts.yml"));
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
            }
            if let Ok(app_data) = std::env::var("APPDATA") {
                candidates.push(
                    PathBuf::from(&app_data)
                        .join("GitHub CLI")
                        .join("hosts.yml"),
                );
                candidates.push(
                    PathBuf::from(&app_data)
                        .join("GitHub Copilot")
                        .join("apps.json"),
                );
                candidates.push(
                    PathBuf::from(app_data)
                        .join("GitHub Copilot")
                        .join("token.json"),
                );
            }
        }
        "cursor" => {
            if let Ok(custom) = std::env::var("CURSOR_SESSION_FILE") {
                let trimmed = custom.trim();
                if !trimmed.is_empty() {
                    candidates.push(PathBuf::from(trimmed));
                }
            }
            if let Some(home) = platform::home_dir() {
                candidates.push(
                    home.join(".config")
                        .join("CodexBar")
                        .join("cursor-session.json"),
                );
                candidates.push(
                    home.join(".local")
                        .join("share")
                        .join("CodexBar")
                        .join("cursor-session.json"),
                );
                candidates.push(
                    home.join("AppData")
                        .join("Roaming")
                        .join("CodexBar")
                        .join("cursor-session.json"),
                );
            }
            if let Ok(app_data) = std::env::var("APPDATA") {
                candidates.push(
                    PathBuf::from(app_data)
                        .join("CodexBar")
                        .join("cursor-session.json"),
                );
            }
        }
        "jetbrains" => {
            if let Some(home) = platform::home_dir() {
                candidates.push(home.join(".config").join("JetBrains"));
                candidates.push(home.join(".local").join("share").join("JetBrains"));
                candidates.push(
                    home.join("Library")
                        .join("Application Support")
                        .join("JetBrains"),
                );
                candidates.push(home.join("AppData").join("Roaming").join("JetBrains"));
                candidates.push(home.join("AppData").join("Local").join("JetBrains"));
            }
            if let Ok(app_data) = std::env::var("APPDATA") {
                candidates.push(PathBuf::from(app_data).join("JetBrains"));
            }
            if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
                candidates.push(PathBuf::from(local_app_data).join("JetBrains"));
            }
        }
        _ => {}
    }

    candidates.iter().any(|path| path_exists(path.as_path()))
}

pub(crate) fn provider_has_runtime_configuration(
    provider: &str,
    state: &AppState,
    app: &tauri::AppHandle,
) -> bool {
    if provider_has_manual_input(app, provider) {
        return true;
    }

    let mode = provider_selected_auth_mode(state, app, provider);
    match mode {
        AuthSourceMode::ApiKey => state
            .credential_manager
            .has_credential(provider)
            .unwrap_or(false),
        AuthSourceMode::OAuthToken | AuthSourceMode::Token => {
            state
                .credential_manager
                .has_credential(provider)
                .unwrap_or(false)
                || provider_has_local_auth_artifact(provider)
        }
        AuthSourceMode::Auto | AuthSourceMode::Cli | AuthSourceMode::None => {
            provider_has_local_auth_artifact(provider)
        }
    }
}

pub(crate) fn active_provider_ids(state: &AppState, app: &tauri::AppHandle) -> Vec<String> {
    let config = load_config_or_default(state, app);
    PROVIDER_IDS
        .iter()
        .copied()
        .filter(|provider| provider_enabled_in_config(&config, provider))
        .filter(|provider| provider_has_runtime_configuration(provider, state, app))
        .map(str::to_string)
        .collect()
}

fn set_provider_enabled(
    state: &AppState,
    app: &tauri::AppHandle,
    provider: &str,
    enabled: bool,
) -> Result<(), String> {
    let mut config = load_config_or_default(state, app);
    if enabled {
        if !provider_enabled_in_config(&config, provider) {
            config.enabled_providers.push(provider.to_string());
        }
    } else {
        config.enabled_providers.retain(|value| value != provider);
    }
    state.config_store.save(app, &config).map(|_| ())
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderRegistry {
    pub fn new(credential_manager: CredentialManager, http_client: Client) -> Self {
        Self {
            codex: CodexProvider::new(credential_manager.clone(), http_client.clone()),
            claude: ClaudeProvider::new(credential_manager.clone(), http_client.clone()),
            gemini: GeminiProvider::new(credential_manager.clone(), http_client.clone()),
            kiro: KiroProvider::new(credential_manager.clone(), http_client.clone()),
            copilot: CopilotProvider::new(credential_manager.clone(), http_client.clone()),
            cursor: CursorProvider::new(credential_manager.clone(), http_client.clone()),
            jetbrains: JetBrainsProvider::new(credential_manager, http_client),
        }
    }

    pub async fn descriptors(&self) -> Vec<ProviderDescriptor> {
        vec![
            ProviderDescriptor {
                id: "codex".to_string(),
                name: self.codex.name().await.to_string(),
                auth_method: self.codex.auth_method(),
            },
            ProviderDescriptor {
                id: "claude".to_string(),
                name: self.claude.name().await.to_string(),
                auth_method: self.claude.auth_method(),
            },
            ProviderDescriptor {
                id: "gemini".to_string(),
                name: self.gemini.name().await.to_string(),
                auth_method: self.gemini.auth_method(),
            },
            ProviderDescriptor {
                id: "kiro".to_string(),
                name: self.kiro.name().await.to_string(),
                auth_method: self.kiro.auth_method(),
            },
            ProviderDescriptor {
                id: "copilot".to_string(),
                name: self.copilot.name().await.to_string(),
                auth_method: self.copilot.auth_method(),
            },
            ProviderDescriptor {
                id: "cursor".to_string(),
                name: self.cursor.name().await.to_string(),
                auth_method: self.cursor.auth_method(),
            },
            ProviderDescriptor {
                id: "jetbrains".to_string(),
                name: self.jetbrains.name().await.to_string(),
                auth_method: self.jetbrains.auth_method(),
            },
        ]
    }

    pub async fn info_for(&self, provider: &str) -> Result<ProviderInfo, ProviderError> {
        match provider {
            "codex" => Ok(self.codex.provider_info().await),
            "claude" => Ok(self.claude.provider_info().await),
            "gemini" => Ok(self.gemini.provider_info().await),
            "kiro" => Ok(self.kiro.provider_info().await),
            "copilot" => Ok(self.copilot.provider_info().await),
            "cursor" => Ok(self.cursor.provider_info().await),
            "jetbrains" => Ok(self.jetbrains.provider_info().await),
            _ => Err(ProviderError::Operation(format!(
                "unsupported provider: {provider}"
            ))),
        }
    }

    pub async fn usage_for(&self, provider: &str) -> Result<UsageData, ProviderError> {
        match provider {
            "codex" => self.codex.fetch_usage().await,
            "claude" => self.claude.fetch_usage().await,
            "gemini" => self.gemini.fetch_usage().await,
            "kiro" => self.kiro.fetch_usage().await,
            "copilot" => self.copilot.fetch_usage().await,
            "cursor" => self.cursor.fetch_usage().await,
            "jetbrains" => self.jetbrains.fetch_usage().await,
            _ => Err(ProviderError::Operation(format!(
                "unsupported provider: {provider}"
            ))),
        }
    }

    pub async fn cost_for(&self, provider: &str) -> Result<Option<CostData>, ProviderError> {
        match provider {
            "codex" => self.codex.fetch_cost().await,
            "claude" => self.claude.fetch_cost().await,
            "gemini" => self.gemini.fetch_cost().await,
            "kiro" => self.kiro.fetch_cost().await,
            "copilot" => self.copilot.fetch_cost().await,
            "cursor" => self.cursor.fetch_cost().await,
            "jetbrains" => self.jetbrains.fetch_cost().await,
            _ => Err(ProviderError::Operation(format!(
                "unsupported provider: {provider}"
            ))),
        }
    }

    pub async fn quota_for(&self, provider: &str) -> Result<QuotaLimit, ProviderError> {
        match provider {
            "codex" => self.codex.fetch_quota().await,
            "claude" => self.claude.fetch_quota().await,
            "gemini" => self.gemini.fetch_quota().await,
            "kiro" => self.kiro.fetch_quota().await,
            "copilot" => self.copilot.fetch_quota().await,
            "cursor" => self.cursor.fetch_quota().await,
            "jetbrains" => self.jetbrains.fetch_quota().await,
            _ => Err(ProviderError::Operation(format!(
                "unsupported provider: {provider}"
            ))),
        }
    }
}

fn manual_data_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))?;
    Ok(dir.join("manual-provider-inputs.json"))
}

fn load_manual_inputs(
    app: &tauri::AppHandle,
) -> Result<HashMap<String, ManualProviderInput>, String> {
    let path = manual_data_path(app)?;
    if !path.exists() {
        return Ok(HashMap::new());
    }

    let raw = fs::read_to_string(path.as_path())
        .map_err(|error| format!("failed to read manual inputs: {error}"))?;
    if let Ok(document) = serde_json::from_str::<ManualInputDocument>(&raw) {
        if document.schema_version >= 2 {
            return Ok(document.providers);
        }
    }

    let legacy = serde_json::from_str::<HashMap<String, ManualProviderInput>>(&raw)
        .map_err(|error| format!("failed to parse manual inputs: {error}"))?;
    backup_legacy_manual_inputs(path.as_path())?;
    Ok(legacy)
}

fn save_manual_inputs(
    app: &tauri::AppHandle,
    entries: &HashMap<String, ManualProviderInput>,
) -> Result<(), String> {
    let path = manual_data_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create manual input dir: {error}"))?;
    }

    let payload = serde_json::to_string_pretty(&ManualInputDocument {
        schema_version: 2,
        providers: entries.clone(),
    })
    .map_err(|error| format!("failed to serialize manual inputs: {error}"))?;
    fs::write(path, payload).map_err(|error| format!("failed to save manual inputs: {error}"))
}

fn backup_legacy_manual_inputs(path: &std::path::Path) -> Result<(), String> {
    let backup_path = path.with_extension("v1.bak");
    if backup_path.exists() {
        return Ok(());
    }

    fs::copy(path, backup_path)
        .map(|_| ())
        .map_err(|error| format!("failed to backup legacy manual inputs: {error}"))
}

fn infer_data_source(provider: &str) -> DataSource {
    if provider == "kiro" {
        DataSource::Cli
    } else if matches!(provider, "codex" | "claude" | "gemini") {
        DataSource::OAuth
    } else {
        DataSource::Snapshot
    }
}

fn subscription_track(
    label: &str,
    used: u64,
    limit: u64,
    unit: &str,
    reset_at: String,
    source: DataSource,
    status: ProviderStatus,
) -> UsageTrack {
    UsageTrack {
        id: format!("subscription:{}", label.to_lowercase().replace(' ', "_")),
        kind: TrackKind::Subscription,
        label: label.to_string(),
        used,
        limit,
        unit: unit.to_string(),
        reset_at,
        status,
        source,
    }
}

fn default_subscription_tracks(
    provider: &str,
    usage: &UsageData,
    quota: &QuotaLimit,
    source: DataSource,
    status: ProviderStatus,
    zero_usage: bool,
) -> Vec<UsageTrack> {
    let pick_used = |value: u64| if zero_usage { 0 } else { value };
    let quota_unit = if quota.unit.trim().is_empty() {
        "percent"
    } else {
        quota.unit.as_str()
    };

    match provider {
        "codex" => vec![
            subscription_track(
                "5-hour session",
                pick_used(usage.requests),
                100,
                "percent",
                usage.period_end.clone(),
                source,
                status.clone(),
            ),
            subscription_track(
                "Weekly limit",
                pick_used(quota.used),
                quota.limit.max(100),
                quota_unit,
                quota.reset_at.clone(),
                source,
                status.clone(),
            ),
        ],
        "claude" => vec![
            subscription_track(
                "5-hour window",
                pick_used(usage.requests),
                100,
                "percent",
                usage.period_end.clone(),
                source,
                status.clone(),
            ),
            subscription_track(
                "7-day window",
                pick_used(usage.tokens),
                100,
                "percent",
                quota.reset_at.clone(),
                source,
                status.clone(),
            ),
        ],
        "gemini" => vec![subscription_track(
            "Daily requests",
            pick_used(quota.used),
            quota.limit,
            if quota_unit == "percent" {
                "requests"
            } else {
                quota_unit
            },
            quota.reset_at.clone(),
            source,
            status,
        )],
        "kiro" => vec![subscription_track(
            "Monthly credits",
            pick_used(quota.used),
            quota.limit,
            if quota_unit == "percent" {
                "credits"
            } else {
                quota_unit
            },
            quota.reset_at.clone(),
            source,
            status,
        )],
        "copilot" | "cursor" | "jetbrains" => vec![subscription_track(
            "Monthly quota",
            pick_used(quota.used),
            quota.limit,
            quota_unit,
            quota.reset_at.clone(),
            source,
            status,
        )],
        _ => vec![subscription_track(
            "Subscription quota",
            pick_used(quota.used),
            quota.limit,
            quota_unit,
            quota.reset_at.clone(),
            source,
            status,
        )],
    }
}

fn default_api_track(status: ProviderStatus, source: DataSource) -> UsageTrack {
    UsageTrack {
        id: "api:primary".to_string(),
        kind: TrackKind::Api,
        label: "API usage".to_string(),
        used: 0,
        limit: 0,
        unit: "tokens".to_string(),
        reset_at: String::new(),
        status,
        source,
    }
}

fn build_tracks_for_entry(
    provider: &str,
    usage: &UsageData,
    quota: &QuotaLimit,
    source: DataSource,
    codex_api_tokens_30d: Option<u64>,
) -> Vec<UsageTrack> {
    let status = usage.status.clone();
    if status == ProviderStatus::NotConfigured {
        let mut tracks = default_subscription_tracks(
            provider,
            usage,
            quota,
            source,
            ProviderStatus::NotConfigured,
            true,
        );
        if matches!(provider, "codex" | "claude" | "gemini") {
            tracks.push(default_api_track(ProviderStatus::NotConfigured, source));
        }
        return tracks;
    }
    if status == ProviderStatus::Unreachable {
        return default_subscription_tracks(
            provider,
            usage,
            quota,
            source,
            ProviderStatus::Unreachable,
            false,
        );
    }

    match provider {
        "codex" => {
            let mut tracks = default_subscription_tracks(
                provider,
                usage,
                quota,
                source,
                ProviderStatus::Ok,
                false,
            );
            tracks.push(UsageTrack {
                id: "api:primary".to_string(),
                kind: TrackKind::Api,
                label: "Local tokens (30d)".to_string(),
                used: codex_api_tokens_30d.unwrap_or(0),
                limit: 0,
                unit: "tokens".to_string(),
                reset_at: String::new(),
                status: if codex_api_tokens_30d.unwrap_or(0) > 0 {
                    ProviderStatus::Ok
                } else {
                    ProviderStatus::NotConfigured
                },
                source: DataSource::Snapshot,
            });
            tracks
        }
        "claude" | "gemini" => {
            let mut tracks = default_subscription_tracks(
                provider,
                usage,
                quota,
                source,
                ProviderStatus::Ok,
                false,
            );
            tracks.push(default_api_track(ProviderStatus::NotConfigured, source));
            tracks
        }
        _ => default_subscription_tracks(provider, usage, quota, source, ProviderStatus::Ok, false),
    }
}

pub(crate) fn track_usage_pct(track: &UsageTrack) -> Option<f64> {
    if track.limit == 0 {
        return None;
    }
    Some((track.used as f64 / track.limit as f64).clamp(0.0, 1.5))
}

fn is_included_plan(plan_name: &str) -> bool {
    let lowered = plan_name.to_lowercase();
    let markers = [
        "plus",
        "pro",
        "team",
        "enterprise",
        "max",
        "advanced",
        "copilot",
        "cursor",
        "kiro",
        "jetbrains",
        "free",
    ];
    markers.iter().any(|value| lowered.contains(value))
}

fn build_cost_view(
    info: &ProviderInfo,
    cost: &Option<CostData>,
    codex_local_monthly_estimate: Option<f64>,
) -> CostView {
    if let Some(cost_data) = cost.as_ref() {
        if cost_data.total > 0.0 {
            return CostView {
                mode: CostDisplayMode::Metered,
                currency: cost_data.currency.clone(),
                total: Some(cost_data.total),
                note: "Usage-based charges".to_string(),
            };
        }
    }

    if info.id == "codex" {
        if let Some(estimate) = codex_local_monthly_estimate {
            return CostView {
                mode: CostDisplayMode::Metered,
                currency: "USD".to_string(),
                total: Some(estimate.max(0.0)),
                note: "Estimated from local Codex session logs for the current month."
                    .to_string(),
            };
        }
    }

    if is_included_plan(info.plan_name.as_str()) {
        return CostView {
            mode: CostDisplayMode::Included,
            currency: "USD".to_string(),
            total: None,
            note: "No additional charge within plan quota".to_string(),
        };
    }

    CostView {
        mode: CostDisplayMode::Unavailable,
        currency: "USD".to_string(),
        total: None,
        note: "Cost data unavailable".to_string(),
    }
}

fn build_health_from_usage(usage: &UsageData, reachable: bool) -> HealthStatus {
    HealthStatus {
        configured: usage.status != ProviderStatus::NotConfigured,
        reachable,
        last_checked: Utc::now().to_rfc3339(),
    }
}

fn manual_to_entry(info: ProviderInfo, manual: &ManualProviderInput) -> DashboardEntry {
    let usage = UsageData {
        provider: manual.provider.clone(),
        requests: manual.requests,
        tokens: manual.tokens,
        period_start: String::new(),
        period_end: manual.reset_at.clone(),
        status: ProviderStatus::Ok,
    };

    let quota = QuotaLimit {
        used: manual.used,
        limit: manual.limit,
        unit: manual.unit.clone(),
        reset_at: manual.reset_at.clone(),
        status: ProviderStatus::Ok,
    };

    let existing_plan = info.plan_name.clone();
    let info = ProviderInfo {
        plan_name: manual.plan_name.clone().unwrap_or(existing_plan),
        ..info
    };

    let cost = manual.cost_total.map(|total| CostData {
        provider: manual.provider.clone(),
        currency: "USD".to_string(),
        total,
        period_start: String::new(),
        period_end: manual.reset_at.clone(),
        status: ProviderStatus::Ok,
    });

    let manual_kind = manual.track_kind.unwrap_or(TrackKind::Manual);
    let tracks = vec![UsageTrack {
        id: format!(
            "manual:{}",
            match manual_kind {
                TrackKind::Subscription => "subscription",
                TrackKind::Api => "api",
                TrackKind::Manual => "manual",
            }
        ),
        kind: manual_kind,
        label: match manual_kind {
            TrackKind::Subscription => "Manual subscription quota".to_string(),
            TrackKind::Api => "Manual API usage".to_string(),
            TrackKind::Manual => "Manual quota".to_string(),
        },
        used: manual.used,
        limit: manual.limit,
        unit: manual.unit.clone(),
        reset_at: manual.reset_at.clone(),
        status: ProviderStatus::Ok,
        source: DataSource::Manual,
    }];
    let cost_view = CostView {
        mode: if cost.is_some() {
            CostDisplayMode::Metered
        } else {
            CostDisplayMode::Included
        },
        currency: "USD".to_string(),
        total: manual.cost_total,
        note: "Manual data".to_string(),
    };

    DashboardEntry {
        info,
        usage,
        quota,
        cost,
        tracks,
        preferred_track: manual_kind,
        cost_view,
        stale: false,
        health: HealthStatus {
            configured: true,
            reachable: true,
            last_checked: Utc::now().to_rfc3339(),
        },
    }
}

async fn fetch_live_entry(
    provider: &str,
    state: &AppState,
) -> Result<DashboardEntry, ProviderError> {
    let info = state.providers.info_for(provider).await?;
    let usage = state.providers.usage_for(provider).await?;
    let quota = state.providers.quota_for(provider).await?;
    let cost = state.providers.cost_for(provider).await?;
    let source = infer_data_source(provider);
    let codex_api_tokens_30d = if provider == "codex" {
        CostEngine
            .codex_token_snapshot()
            .map(|snapshot| snapshot.total_tokens)
    } else {
        None
    };
    let tracks = build_tracks_for_entry(provider, &usage, &quota, source, codex_api_tokens_30d);
    let preferred_track = tracks
        .iter()
        .find(|track| track.kind == TrackKind::Subscription)
        .map(|track| track.kind)
        .unwrap_or(TrackKind::Subscription);
    let codex_local_monthly_estimate = if provider == "codex" {
        CostEngine.codex_current_month_cost()
    } else {
        None
    };
    let cost_view = build_cost_view(&info, &cost, codex_local_monthly_estimate);

    Ok(DashboardEntry {
        info,
        usage: usage.clone(),
        quota,
        cost,
        tracks,
        preferred_track,
        cost_view,
        stale: false,
        health: build_health_from_usage(&usage, usage.status == ProviderStatus::Ok),
    })
}

pub(crate) async fn resolve_dashboard_entry(
    provider: &str,
    state: &AppState,
    app: &tauri::AppHandle,
) -> Result<(DashboardEntry, DataSource), ProviderError> {
    let live = fetch_live_entry(provider, state).await;

    if let Ok(entry) = live.as_ref() {
        if entry.usage.status == ProviderStatus::Ok {
            let snapshot = ProviderSnapshot {
                info: entry.info.clone(),
                usage: entry.usage.clone(),
                quota: entry.quota.clone(),
                cost: entry.cost.clone(),
            };
            state.quota_cache.set(provider, snapshot);
            return Ok((entry.clone(), infer_data_source(provider)));
        }
    }

    if let Some(cached) = state.quota_cache.get(provider) {
        let snapshot = cached.snapshot;
        let cached_usage = snapshot.usage.clone();
        let codex_api_tokens_30d = if provider == "codex" {
            CostEngine
                .codex_token_snapshot()
                .map(|tokens| tokens.total_tokens)
        } else {
            None
        };
        let tracks = build_tracks_for_entry(
            provider,
            &snapshot.usage,
            &snapshot.quota,
            DataSource::Cache,
            codex_api_tokens_30d,
        );
        let preferred_track = tracks
            .iter()
            .find(|track| track.kind == TrackKind::Subscription)
            .map(|track| track.kind)
            .unwrap_or(TrackKind::Subscription);
        let codex_local_monthly_estimate = if provider == "codex" {
            CostEngine.codex_current_month_cost()
        } else {
            None
        };
        let cost_view = build_cost_view(
            &snapshot.info,
            &snapshot.cost,
            codex_local_monthly_estimate,
        );
        let entry = DashboardEntry {
            info: snapshot.info,
            usage: cached_usage.clone(),
            quota: snapshot.quota,
            cost: snapshot.cost,
            tracks,
            preferred_track,
            cost_view,
            stale: cached.stale || cached.age_seconds > 300,
            health: build_health_from_usage(&cached_usage, false),
        };
        return Ok((entry, DataSource::Cache));
    }

    let manual_map = load_manual_inputs(app).unwrap_or_default();
    if let Some(manual) = manual_map.get(provider) {
        let info = state
            .providers
            .info_for(provider)
            .await
            .unwrap_or(ProviderInfo {
                id: provider.to_string(),
                name: provider.to_string(),
                icon: "circle".to_string(),
                auth_method: AuthMethod::None,
                supported_auth_modes: vec![AuthSourceMode::None],
                default_auth_mode: AuthSourceMode::None,
                plan_name: "Manual".to_string(),
                quota_limit: manual.limit,
                reset_period: "manual".to_string(),
            });
        return Ok((manual_to_entry(info, manual), DataSource::Manual));
    }

    match live {
        Ok(mut entry) => {
            entry.health = build_health_from_usage(&entry.usage, false);
            entry.stale = true;
            Ok((entry, DataSource::Snapshot))
        }
        Err(error) => Err(error),
    }
}

#[instrument(skip(state), fields(provider = provider))]
pub async fn provider_health(
    provider: &str,
    state: &AppState,
    app: &tauri::AppHandle,
) -> std::result::Result<HealthStatus, ProviderError> {
    let (entry, source) = resolve_dashboard_entry(provider, state, app).await?;
    let reachable = matches!(
        source,
        DataSource::OAuth | DataSource::Cli | DataSource::Snapshot
    ) && entry.usage.status == ProviderStatus::Ok;
    let has_credential = state
        .credential_manager
        .has_credential(provider)
        .unwrap_or(false);

    Ok(HealthStatus {
        configured: has_credential || entry.usage.status != ProviderStatus::NotConfigured,
        reachable,
        last_checked: Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub async fn get_providers(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ProviderDescriptor>, String> {
    Ok(state.providers.descriptors().await)
}

#[tauri::command]
pub async fn get_usage(
    provider: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<UsageData, String> {
    resolve_dashboard_entry(provider.as_str(), &state, &app)
        .await
        .map(|value| value.0.usage)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_cost(
    provider: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Option<CostData>, String> {
    resolve_dashboard_entry(provider.as_str(), &state, &app)
        .await
        .map(|value| value.0.cost)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_provider_info(
    provider: String,
    state: tauri::State<'_, AppState>,
) -> Result<ProviderInfo, String> {
    state
        .providers
        .info_for(provider.as_str())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_quota(
    provider: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<QuotaLimit, String> {
    resolve_dashboard_entry(provider.as_str(), &state, &app)
        .await
        .map(|value| value.0.quota)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_all_dashboard_data(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<DashboardEntry>, String> {
    let providers = active_provider_ids(&state, &app);
    let tasks = providers
        .iter()
        .map(|provider| resolve_dashboard_entry(provider.as_str(), &state, &app));
    let resolved = join_all(tasks).await;
    let mut entries = Vec::with_capacity(resolved.len());

    for result in resolved {
        let (entry, _) = result.map_err(|error| error.to_string())?;
        entries.push(entry);
    }

    Ok(entries)
}

#[tauri::command]
pub async fn check_provider_health(
    provider: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<HealthStatus, String> {
    provider_health(provider.as_str(), &state, &app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_provider_auth_modes(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<HashMap<String, AuthSourceMode>, String> {
    let config = load_config_or_default(&state, &app);
    Ok(config.provider_auth_modes)
}

#[tauri::command]
pub fn set_provider_auth_mode(
    provider: String,
    mode: AuthSourceMode,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<AuthSourceMode, String> {
    ensure_trusted_window(&window)?;
    ensure_known_provider(provider.as_str())?;
    if !provider_supports_mode(provider.as_str(), mode) {
        return Err(format!(
            "unsupported auth mode '{}' for provider '{}'",
            mode.slot_key(),
            provider
        ));
    }

    let mut config = load_config_or_default(&state, &app);
    config.provider_auth_modes.insert(provider.clone(), mode);
    normalize_provider_auth_modes(&mut config);
    state.config_store.save(&app, &config)?;
    sync_primary_credential_with_mode(&state, provider.as_str(), mode)?;

    if !provider_has_runtime_configuration(provider.as_str(), &state, &app) {
        set_provider_enabled(&state, &app, provider.as_str(), false)?;
    } else {
        set_provider_enabled(&state, &app, provider.as_str(), true)?;
    }
    Ok(mode)
}

#[tauri::command]
pub fn save_credential(
    provider: String,
    credential: String,
    mode: Option<AuthSourceMode>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<(), String> {
    ensure_main_window(&window)?;
    ensure_known_provider(provider.as_str())?;
    let selected_mode =
        mode.unwrap_or_else(|| provider_selected_auth_mode(&state, &app, provider.as_str()));
    if !provider_supports_mode(provider.as_str(), selected_mode) {
        return Err(format!(
            "unsupported auth mode '{}' for provider '{}'",
            selected_mode.slot_key(),
            provider
        ));
    }

    let slot = selected_mode.slot_key();
    if matches!(
        selected_mode,
        AuthSourceMode::ApiKey | AuthSourceMode::OAuthToken | AuthSourceMode::Token
    ) {
        if credential.trim().is_empty() {
            return Err("credential cannot be empty for selected auth mode".to_string());
        }
        state
            .credential_manager
            .save_credential_for_slot(provider.as_str(), slot, credential.clone())
            .map_err(|error| error.to_string())?;
        state
            .credential_manager
            .save_credential(provider.as_str(), credential)
            .map_err(|error| error.to_string())?;
    } else {
        state
            .credential_manager
            .delete_credential(provider.as_str())
            .map_err(|error| error.to_string())?;
    }

    let mut config = load_config_or_default(&state, &app);
    config
        .provider_auth_modes
        .insert(provider.clone(), selected_mode);
    normalize_provider_auth_modes(&mut config);
    state.config_store.save(&app, &config)?;
    set_provider_enabled(&state, &app, provider.as_str(), true)
}

#[tauri::command]
pub fn delete_credential(
    provider: String,
    mode: Option<AuthSourceMode>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<(), String> {
    ensure_main_window(&window)?;
    ensure_known_provider(provider.as_str())?;
    if let Some(mode) = mode {
        let slot = mode.slot_key();
        state
            .credential_manager
            .delete_credential_for_slot(provider.as_str(), slot)
            .map_err(|error| error.to_string())?;
        let selected_mode = provider_selected_auth_mode(&state, &app, provider.as_str());
        if selected_mode == mode {
            sync_primary_credential_with_mode(&state, provider.as_str(), selected_mode)?;
        }
    } else {
        state
            .credential_manager
            .delete_credential(provider.as_str())
            .map_err(|error| error.to_string())?;
        let selected_mode = provider_selected_auth_mode(&state, &app, provider.as_str());
        if matches!(
            selected_mode,
            AuthSourceMode::ApiKey | AuthSourceMode::OAuthToken | AuthSourceMode::Token
        ) {
            state
                .credential_manager
                .delete_credential_for_slot(provider.as_str(), selected_mode.slot_key())
                .map_err(|error| error.to_string())?;
        }
    }
    state.quota_cache.clear(Some(provider.as_str()));
    if !provider_has_runtime_configuration(provider.as_str(), &state, &app) {
        set_provider_enabled(&state, &app, provider.as_str(), false)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn start_copilot_device_flow(
    state: tauri::State<'_, AppState>,
    window: tauri::Window,
) -> Result<CopilotDeviceFlowStart, String> {
    ensure_main_window(&window)?;
    let response = state
        .http_client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[
            ("client_id", GITHUB_DEVICE_CLIENT_ID),
            ("scope", "read:user"),
        ])
        .send()
        .await
        .map_err(|error| format!("failed to start device login: {error}"))?;

    let payload = response
        .json::<Value>()
        .await
        .map_err(|error| format!("failed to parse device login response: {error}"))?;

    if let Some(error) = payload.get("error").and_then(Value::as_str) {
        let description = payload
            .get("error_description")
            .and_then(Value::as_str)
            .unwrap_or(error);
        return Err(format!("github device login error: {description}"));
    }

    let device_code = payload
        .get("device_code")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing device_code from GitHub response".to_string())?;
    let user_code = payload
        .get("user_code")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing user_code from GitHub response".to_string())?;
    let verification_uri = payload
        .get("verification_uri")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing verification_uri from GitHub response".to_string())?;
    let expires_in = payload
        .get("expires_in")
        .and_then(Value::as_u64)
        .unwrap_or(900);
    let interval = payload.get("interval").and_then(Value::as_u64).unwrap_or(5);

    Ok(CopilotDeviceFlowStart {
        device_code: device_code.to_string(),
        user_code: user_code.to_string(),
        verification_uri: verification_uri.to_string(),
        verification_uri_complete: payload
            .get("verification_uri_complete")
            .and_then(Value::as_str)
            .map(|value| value.to_string()),
        expires_in,
        interval,
    })
}

#[tauri::command]
pub async fn poll_copilot_device_flow(
    device_code: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<CopilotDeviceFlowPoll, String> {
    ensure_main_window(&window)?;
    let response = state
        .http_client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("client_id", GITHUB_DEVICE_CLIENT_ID),
            ("device_code", device_code.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|error| format!("failed to poll device login: {error}"))?;

    let payload = response
        .json::<Value>()
        .await
        .map_err(|error| format!("failed to parse poll response: {error}"))?;

    if let Some(token) = payload.get("access_token").and_then(Value::as_str) {
        let _ = state.credential_manager.save_credential_for_slot(
            "copilot",
            AuthSourceMode::OAuthToken.slot_key(),
            token.to_string(),
        );
        state
            .credential_manager
            .save_credential("copilot", token.to_string())
            .map_err(|error| format!("failed to persist copilot token: {error}"))?;
        let _ = set_provider_enabled(&state, &app, "copilot", true);
        return Ok(CopilotDeviceFlowPoll {
            status: "authorized".to_string(),
            message: Some("GitHub authorization complete".to_string()),
            interval: None,
        });
    }

    let error = payload
        .get("error")
        .and_then(Value::as_str)
        .unwrap_or("unknown_error");
    let description = payload
        .get("error_description")
        .and_then(Value::as_str)
        .unwrap_or(error)
        .to_string();
    let interval = payload.get("interval").and_then(Value::as_u64);

    if matches!(
        error,
        "authorization_pending" | "slow_down" | "expired_token"
    ) {
        return Ok(CopilotDeviceFlowPoll {
            status: error.to_string(),
            message: Some(description),
            interval,
        });
    }

    Ok(CopilotDeviceFlowPoll {
        status: "error".to_string(),
        message: Some(description),
        interval,
    })
}

#[tauri::command]
pub fn save_manual_input(
    provider: String,
    input: ManualProviderInput,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<(), String> {
    ensure_trusted_window(&window)?;
    ensure_known_provider(provider.as_str())?;
    if provider != input.provider {
        return Err("provider mismatch in manual input".to_string());
    }
    validate_manual_input(&input)?;

    let provider_id = provider.clone();
    let mut manual = load_manual_inputs(&app)?;
    manual.insert(provider, input);
    save_manual_inputs(&app, &manual)?;
    state.quota_cache.clear(Some(provider_id.as_str()));
    set_provider_enabled(&state, &app, provider_id.as_str(), true)
}

#[tauri::command]
pub fn clear_provider_data(
    provider: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<(), String> {
    ensure_trusted_window(&window)?;
    ensure_known_provider(provider.as_str())?;
    state.quota_cache.clear(Some(provider.as_str()));

    let mut manual = load_manual_inputs(&app)?;
    manual.remove(provider.as_str());
    save_manual_inputs(&app, &manual)?;
    if !provider_has_runtime_configuration(provider.as_str(), &state, &app) {
        set_provider_enabled(&state, &app, provider.as_str(), false)?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_main_dashboard(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main dashboard window not found".to_string())?;

    window
        .show()
        .map_err(|error| format!("failed to show main dashboard: {error}"))?;
    let _ = window.unminimize();
    let _ = app.emit("open-dashboard", true);
    window
        .set_focus()
        .map_err(|error| format!("failed to focus main dashboard: {error}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::ProviderStatus;

    #[test]
    fn manual_input_roundtrip_shape() {
        let manual = ManualProviderInput {
            provider: "codex".to_string(),
            requests: 10,
            tokens: 11,
            used: 12,
            limit: 100,
            unit: "percent".to_string(),
            reset_at: "2026-03-01".to_string(),
            cost_total: Some(12.5),
            plan_name: Some("Manual".to_string()),
            track_kind: None,
        };
        assert_eq!(manual.provider, "codex");
    }

    #[test]
    fn data_source_enum_shape_is_stable() {
        let source = DataSource::Cache;
        assert!(matches!(source, DataSource::Cache));
    }

    #[test]
    fn codex_builds_subscription_and_api_tracks() {
        let usage = UsageData {
            provider: "codex".to_string(),
            requests: 42,
            tokens: 84,
            period_start: String::new(),
            period_end: "2026-03-01T00:00:00Z".to_string(),
            status: ProviderStatus::Ok,
        };
        let quota = QuotaLimit {
            used: 84,
            limit: 100,
            unit: "percent".to_string(),
            reset_at: "2026-03-01T00:00:00Z".to_string(),
            status: ProviderStatus::Ok,
        };

        let tracks = build_tracks_for_entry("codex", &usage, &quota, DataSource::OAuth, Some(1234));
        assert!(tracks
            .iter()
            .any(|track| track.kind == TrackKind::Subscription));
        assert!(tracks.iter().any(|track| track.kind == TrackKind::Api));
    }

    #[test]
    fn claude_tracks_use_distinct_session_and_weekly_resets() {
        let usage = UsageData {
            provider: "claude".to_string(),
            requests: 21,
            tokens: 64,
            period_start: String::new(),
            period_end: "2026-03-01T12:00:00Z".to_string(),
            status: ProviderStatus::Ok,
        };
        let quota = QuotaLimit {
            used: 64,
            limit: 100,
            unit: "percent".to_string(),
            reset_at: "2026-03-07T00:00:00Z".to_string(),
            status: ProviderStatus::Ok,
        };

        let tracks = build_tracks_for_entry("claude", &usage, &quota, DataSource::OAuth, None);
        let session = tracks
            .iter()
            .find(|track| track.id == "subscription:5-hour_window");
        let weekly = tracks
            .iter()
            .find(|track| track.id == "subscription:7-day_window");
        assert_eq!(
            session.map(|track| track.reset_at.as_str()),
            Some("2026-03-01T12:00:00Z")
        );
        assert_eq!(
            weekly.map(|track| track.reset_at.as_str()),
            Some("2026-03-07T00:00:00Z")
        );
    }

    #[test]
    fn cost_view_marks_included_for_subscription_plan() {
        let info = ProviderInfo {
            id: "claude".to_string(),
            name: "Claude".to_string(),
            icon: "brain".to_string(),
            auth_method: AuthMethod::OAuth,
            supported_auth_modes: vec![AuthSourceMode::Auto, AuthSourceMode::OAuthToken],
            default_auth_mode: AuthSourceMode::Auto,
            plan_name: "Claude Pro".to_string(),
            quota_limit: 100,
            reset_period: "rolling".to_string(),
        };

        let view = build_cost_view(&info, &None, None);
        assert_eq!(view.mode, CostDisplayMode::Included);
        assert!(view.total.is_none());
    }

    #[test]
    fn cost_view_uses_codex_local_estimate_when_remote_cost_is_unavailable() {
        let info = ProviderInfo {
            id: "codex".to_string(),
            name: "OpenAI Codex".to_string(),
            icon: "bot".to_string(),
            auth_method: AuthMethod::OAuth,
            supported_auth_modes: vec![AuthSourceMode::Auto, AuthSourceMode::OAuthToken],
            default_auth_mode: AuthSourceMode::Auto,
            plan_name: "Codex Pro".to_string(),
            quota_limit: 100,
            reset_period: "monthly".to_string(),
        };

        let view = build_cost_view(&info, &None, Some(12.5));
        assert_eq!(view.mode, CostDisplayMode::Metered);
        assert_eq!(view.total, Some(12.5));
        assert!(view.note.contains("local Codex session logs"));
    }

    #[test]
    fn manual_input_can_target_api_track() {
        let info = ProviderInfo {
            id: "codex".to_string(),
            name: "OpenAI Codex".to_string(),
            icon: "bot".to_string(),
            auth_method: AuthMethod::OAuth,
            supported_auth_modes: vec![AuthSourceMode::Auto, AuthSourceMode::ApiKey],
            default_auth_mode: AuthSourceMode::Auto,
            plan_name: "Pro".to_string(),
            quota_limit: 100,
            reset_period: "rolling".to_string(),
        };
        let manual = ManualProviderInput {
            provider: "codex".to_string(),
            requests: 123,
            tokens: 456,
            used: 789,
            limit: 0,
            unit: "tokens".to_string(),
            reset_at: "manual".to_string(),
            cost_total: Some(42.0),
            plan_name: Some("Manual".to_string()),
            track_kind: Some(TrackKind::Api),
        };

        let entry = manual_to_entry(info, &manual);
        assert_eq!(entry.preferred_track, TrackKind::Api);
        assert_eq!(entry.tracks[0].kind, TrackKind::Api);
    }
}
