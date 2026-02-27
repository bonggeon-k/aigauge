use crate::config::ConfigStore;
use crate::cost_engine::CostEngine;
use crate::credentials::CredentialManager;
use crate::providers::claude::ClaudeProvider;
use crate::providers::codex::CodexProvider;
use crate::providers::copilot::CopilotProvider;
use crate::providers::cursor::CursorProvider;
use crate::providers::gemini::GeminiProvider;
use crate::providers::jetbrains::JetBrainsProvider;
use crate::providers::kiro::KiroProvider;
use crate::providers::{
    build_shared_http_client, AuthMethod, CostData, Provider, ProviderError, ProviderInfo,
    ProviderStatus, QuotaLimit, UsageData,
};
use crate::quota_cache::{ProviderSnapshot, QuotaCache};
use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
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
        let http_client = build_shared_http_client().unwrap_or_else(|_| Client::new());
        Self {
            providers: ProviderRegistry::new(credential_manager.clone(), http_client.clone()),
            credential_manager,
            config_store: ConfigStore,
            quota_cache: QuotaCache::default(),
            http_client,
        }
    }
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
    reset_at: String,
    source: DataSource,
) -> UsageTrack {
    UsageTrack {
        id: format!("subscription:{}", label.to_lowercase().replace(' ', "_")),
        kind: TrackKind::Subscription,
        label: label.to_string(),
        used,
        limit,
        unit: "percent".to_string(),
        reset_at,
        status: ProviderStatus::Ok,
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
        return vec![
            UsageTrack {
                id: "subscription:primary".to_string(),
                kind: TrackKind::Subscription,
                label: "Subscription quota".to_string(),
                used: 0,
                limit: 0,
                unit: quota.unit.clone(),
                reset_at: quota.reset_at.clone(),
                status,
                source,
            },
            UsageTrack {
                id: "api:primary".to_string(),
                kind: TrackKind::Api,
                label: "API usage".to_string(),
                used: 0,
                limit: 0,
                unit: "tokens".to_string(),
                reset_at: String::new(),
                status: ProviderStatus::NotConfigured,
                source,
            },
        ];
    }
    if status == ProviderStatus::Unreachable {
        return vec![UsageTrack {
            id: "subscription:primary".to_string(),
            kind: TrackKind::Subscription,
            label: "Subscription quota".to_string(),
            used: quota.used,
            limit: quota.limit,
            unit: quota.unit.clone(),
            reset_at: quota.reset_at.clone(),
            status: ProviderStatus::Unreachable,
            source,
        }];
    }

    match provider {
        "codex" => vec![
            subscription_track(
                "5-hour session",
                usage.requests,
                100,
                usage.period_end.clone(),
                source,
            ),
            subscription_track(
                "Weekly limit",
                quota.used,
                quota.limit.max(100),
                quota.reset_at.clone(),
                source,
            ),
            UsageTrack {
                id: "api:primary".to_string(),
                kind: TrackKind::Api,
                label: "API tokens (30d)".to_string(),
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
            },
        ],
        "claude" => vec![
            subscription_track(
                "5-hour window",
                usage.requests,
                100,
                usage.period_end.clone(),
                source,
            ),
            subscription_track(
                "7-day window",
                usage.tokens,
                100,
                usage.period_end.clone(),
                source,
            ),
            UsageTrack {
                id: "api:primary".to_string(),
                kind: TrackKind::Api,
                label: "API usage".to_string(),
                used: 0,
                limit: 0,
                unit: "tokens".to_string(),
                reset_at: String::new(),
                status: ProviderStatus::NotConfigured,
                source,
            },
        ],
        "gemini" => vec![
            UsageTrack {
                id: "subscription:daily".to_string(),
                kind: TrackKind::Subscription,
                label: "Daily requests".to_string(),
                used: quota.used,
                limit: quota.limit,
                unit: quota.unit.clone(),
                reset_at: quota.reset_at.clone(),
                status: ProviderStatus::Ok,
                source,
            },
            UsageTrack {
                id: "api:primary".to_string(),
                kind: TrackKind::Api,
                label: "API usage".to_string(),
                used: 0,
                limit: 0,
                unit: "tokens".to_string(),
                reset_at: String::new(),
                status: ProviderStatus::NotConfigured,
                source,
            },
        ],
        _ => vec![UsageTrack {
            id: "subscription:primary".to_string(),
            kind: TrackKind::Subscription,
            label: "Subscription quota".to_string(),
            used: quota.used,
            limit: quota.limit,
            unit: quota.unit.clone(),
            reset_at: quota.reset_at.clone(),
            status: ProviderStatus::Ok,
            source,
        }],
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

fn build_cost_view(info: &ProviderInfo, cost: &Option<CostData>) -> CostView {
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
    let cost_view = build_cost_view(&info, &cost);

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
        let cost_view = build_cost_view(&snapshot.info, &snapshot.cost);
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
    let mut entries = Vec::with_capacity(PROVIDER_IDS.len());

    for provider in PROVIDER_IDS {
        let (entry, _) = resolve_dashboard_entry(provider, &state, &app)
            .await
            .map_err(|error| error.to_string())?;
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
pub fn save_credential(
    provider: String,
    credential: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state
        .credential_manager
        .save_credential(provider.as_str(), credential)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_credential(
    provider: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state
        .credential_manager
        .delete_credential(provider.as_str())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn start_copilot_device_flow(
    state: tauri::State<'_, AppState>,
) -> Result<CopilotDeviceFlowStart, String> {
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
) -> Result<CopilotDeviceFlowPoll, String> {
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
        state
            .credential_manager
            .save_credential("copilot", token.to_string())
            .map_err(|error| format!("failed to persist copilot token: {error}"))?;
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
    app: tauri::AppHandle,
) -> Result<(), String> {
    if provider != input.provider {
        return Err("provider mismatch in manual input".to_string());
    }

    let mut manual = load_manual_inputs(&app)?;
    manual.insert(provider, input);
    save_manual_inputs(&app, &manual)
}

#[tauri::command]
pub fn clear_provider_data(
    provider: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    state.quota_cache.clear(Some(provider.as_str()));

    let mut manual = load_manual_inputs(&app)?;
    manual.remove(provider.as_str());
    save_manual_inputs(&app, &manual)
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
    fn cost_view_marks_included_for_subscription_plan() {
        let info = ProviderInfo {
            id: "claude".to_string(),
            name: "Claude".to_string(),
            icon: "brain".to_string(),
            auth_method: AuthMethod::OAuth,
            plan_name: "Claude Pro".to_string(),
            quota_limit: 100,
            reset_period: "rolling".to_string(),
        };

        let view = build_cost_view(&info, &None);
        assert_eq!(view.mode, CostDisplayMode::Included);
        assert!(view.total.is_none());
    }

    #[test]
    fn manual_input_can_target_api_track() {
        let info = ProviderInfo {
            id: "codex".to_string(),
            name: "OpenAI Codex".to_string(),
            icon: "bot".to_string(),
            auth_method: AuthMethod::OAuth,
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
