use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

use tauri::Emitter;
use tauri::Manager;
use tracing::instrument;

use crate::commands::{
    active_provider_ids, resolve_dashboard_entry, track_usage_pct, AppState, DashboardEntry,
    TrackKind, PROVIDER_IDS,
};
use crate::config::AppConfig;
use crate::notifications::{notify_quota_critical, notify_quota_warning};
use crate::providers::ProviderStatus;
use crate::tray::update_tray_menu;

#[derive(Debug, Clone)]
pub struct ProviderPollState {
    pub base_interval: Duration,
    pub current_interval: Duration,
    pub max_interval: Duration,
    pub next_poll_at: Instant,
}

impl ProviderPollState {
    pub fn new(provider_id: &str, base_interval: Duration) -> Self {
        let _ = provider_id;
        Self {
            base_interval,
            current_interval: base_interval,
            max_interval: Duration::from_secs(30 * 60),
            next_poll_at: Instant::now(),
        }
    }

    #[instrument(skip(self))]
    pub fn on_success(&mut self) {
        self.current_interval = self.base_interval;
        self.next_poll_at = Instant::now() + self.current_interval;
    }

    #[instrument(skip(self))]
    pub fn on_error(&mut self) {
        let doubled = self.current_interval.saturating_mul(2);
        self.current_interval = doubled.min(self.max_interval);
        self.next_poll_at = Instant::now() + self.current_interval;
    }

    pub fn should_poll(&self) -> bool {
        Instant::now() >= self.next_poll_at
    }
}

#[derive(Clone, Default)]
pub struct PollingManager;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AlertLevel {
    Warning,
    Critical,
}

fn classify_alert_level(usage_pct: f64) -> Option<AlertLevel> {
    if usage_pct >= 0.95 {
        Some(AlertLevel::Critical)
    } else if usage_pct >= 0.8 {
        Some(AlertLevel::Warning)
    } else {
        None
    }
}

impl PollingManager {
    #[instrument(skip(app))]
    pub fn start(app: tauri::AppHandle) {
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let mut states: HashMap<String, ProviderPollState> = HashMap::new();
            let mut previous_active: HashSet<String> = HashSet::new();
            let mut latest_entries: HashMap<String, DashboardEntry> = HashMap::new();
            let mut provider_alert_levels: HashMap<String, AlertLevel> = HashMap::new();
            let mut track_alert_levels: HashMap<String, AlertLevel> = HashMap::new();

            loop {
                let app_state = app_handle.state::<AppState>();
                let config = app_state
                    .config_store
                    .load(&app_handle)
                    .unwrap_or_else(|_| AppConfig::default());
                let active_providers = active_provider_ids(&app_state, &app_handle);
                let active_set: HashSet<String> = active_providers.iter().cloned().collect();
                latest_entries.retain(|provider, _| active_set.contains(provider));
                provider_alert_levels.retain(|provider, _| active_set.contains(provider));
                track_alert_levels.retain(|key, _| {
                    key.split_once(':')
                        .map(|(provider, _)| active_set.contains(provider))
                        .unwrap_or(false)
                });

                for provider in PROVIDER_IDS {
                    let base_interval = Duration::from_secs(
                        config
                            .polling_intervals
                            .get(*provider)
                            .copied()
                            .unwrap_or(5 * 60)
                            .max(30),
                    );
                    let state = states
                        .entry((*provider).to_string())
                        .or_insert_with(|| ProviderPollState::new(provider, base_interval));

                    if state.base_interval != base_interval {
                        state.base_interval = base_interval;
                    }

                    if active_set.contains(*provider) && !previous_active.contains(*provider) {
                        state.current_interval = base_interval;
                        state.next_poll_at = Instant::now();
                    }
                }

                for provider in &active_providers {
                    let Some(state) = states.get_mut(provider.as_str()) else {
                        continue;
                    };

                    if !state.should_poll() {
                        continue;
                    }

                    match resolve_dashboard_entry(provider.as_str(), &app_state, &app_handle).await
                    {
                        Ok((dashboard, _source)) => {
                            let _ = app_handle.emit("usage-updated", &dashboard);

                            if dashboard.stale {
                                let _ = app_handle.emit("data-stale", &dashboard);
                            }

                            let mut subscription_usage_pct = None;
                            for track in &dashboard.tracks {
                                if track.kind == TrackKind::Subscription
                                    && subscription_usage_pct.is_none()
                                {
                                    subscription_usage_pct = track_usage_pct(track);
                                }
                                let track_key = format!("{}:{}", dashboard.info.id, track.id);
                                if track.status != ProviderStatus::Ok {
                                    track_alert_levels.remove(track_key.as_str());
                                    continue;
                                }
                                let Some(usage_pct) = track_usage_pct(track) else {
                                    track_alert_levels.remove(track_key.as_str());
                                    continue;
                                };

                                if let Some(level) = classify_alert_level(usage_pct) {
                                    let previous_level =
                                        track_alert_levels.insert(track_key.clone(), level);
                                    if previous_level != Some(level) {
                                        match level {
                                            AlertLevel::Critical => {
                                                let _ = app_handle.emit(
                                                    "quota-critical-track",
                                                    serde_json::json!({
                                                        "provider_id": dashboard.info.id,
                                                        "track_id": track.id,
                                                        "usage_pct": usage_pct,
                                                        "track_kind": track.kind,
                                                    }),
                                                );
                                            }
                                            AlertLevel::Warning => {
                                                let _ = app_handle.emit(
                                                    "quota-warning-track",
                                                    serde_json::json!({
                                                        "provider_id": dashboard.info.id,
                                                        "track_id": track.id,
                                                        "usage_pct": usage_pct,
                                                        "track_kind": track.kind,
                                                    }),
                                                );
                                            }
                                        }
                                    }
                                } else {
                                    track_alert_levels.remove(track_key.as_str());
                                }
                            }

                            let usage_pct = subscription_usage_pct.or_else(|| {
                                if dashboard.quota.limit > 0 {
                                    Some(dashboard.quota.used as f64 / dashboard.quota.limit as f64)
                                } else {
                                    None
                                }
                            });

                            let next_provider_alert =
                                if dashboard.quota.status == ProviderStatus::Ok {
                                    usage_pct.and_then(classify_alert_level)
                                } else {
                                    None
                                };
                            let provider_key = dashboard.info.id.clone();
                            if let Some(level) = next_provider_alert {
                                let previous_level =
                                    provider_alert_levels.insert(provider_key.clone(), level);
                                if previous_level != Some(level) {
                                    match level {
                                        AlertLevel::Critical => {
                                            let _ = app_handle.emit("quota-critical", &dashboard);
                                            if config.notifications.quota_critical {
                                                notify_quota_critical(
                                                    &app_handle,
                                                    &config,
                                                    &dashboard,
                                                );
                                            }
                                        }
                                        AlertLevel::Warning => {
                                            let _ = app_handle.emit("quota-warning", &dashboard);
                                            if config.notifications.quota_warning {
                                                notify_quota_warning(
                                                    &app_handle,
                                                    &config,
                                                    &dashboard,
                                                );
                                            }
                                        }
                                    }
                                }
                            } else {
                                provider_alert_levels.remove(provider_key.as_str());
                            }

                            latest_entries.insert(dashboard.info.id.clone(), dashboard);
                            state.on_success();
                        }
                        Err(_) => {
                            state.on_error();
                        }
                    }
                }

                let tray_entries = active_providers
                    .iter()
                    .filter_map(|provider| latest_entries.get(provider).cloned())
                    .collect::<Vec<_>>();
                update_tray_menu(&app_handle, &tray_entries);

                previous_active = active_set;
                tokio::time::sleep(Duration::from_secs(10)).await;
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_doubles_until_max() {
        let mut state = ProviderPollState::new("codex", Duration::from_secs(60));
        state.on_error();
        assert_eq!(state.current_interval, Duration::from_secs(120));

        for _ in 0..10 {
            state.on_error();
        }

        assert_eq!(state.current_interval, Duration::from_secs(30 * 60));
    }

    #[test]
    fn success_resets_to_base_interval() {
        let mut state = ProviderPollState::new("claude", Duration::from_secs(60));
        state.on_error();
        state.on_error();
        assert!(state.current_interval > state.base_interval);

        state.on_success();
        assert_eq!(state.current_interval, Duration::from_secs(60));
    }

    #[test]
    fn dashboard_entry_placeholder_compiles() {
        let _entries: Vec<crate::commands::DashboardEntry> = Vec::new();
    }
}
