use std::collections::HashMap;
use std::time::{Duration, Instant};

use tauri::Emitter;
use tauri::Manager;
use tracing::instrument;

use crate::commands::{provider_health, AppState, DashboardEntry, PROVIDER_IDS};
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
            next_poll_at: Instant::now() + base_interval,
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

impl PollingManager {
    #[instrument(skip(app))]
    pub fn start(app: tauri::AppHandle) {
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let mut states: HashMap<String, ProviderPollState> = PROVIDER_IDS
                .iter()
                .map(|id| {
                    (
                        id.to_string(),
                        ProviderPollState::new(id, Duration::from_secs(5 * 60)),
                    )
                })
                .collect();

            loop {
                let mut cycle_entries = Vec::new();
                for provider in PROVIDER_IDS {
                    let Some(state) = states.get_mut(*provider) else {
                        continue;
                    };

                    if !state.should_poll() {
                        continue;
                    }

                    let app_state = app_handle.state::<AppState>();

                    let info = app_state.providers.info_for(provider).await;
                    let usage = app_state.providers.usage_for(provider).await;
                    let quota = app_state.providers.quota_for(provider).await;
                    let cost = app_state.providers.cost_for(provider).await;
                    let health = provider_health(provider, &app_state).await;

                    match (info, usage, quota, cost, health) {
                        (Ok(info), Ok(usage), Ok(quota), Ok(cost), Ok(health)) => {
                            let dashboard = DashboardEntry {
                                info,
                                usage,
                                quota,
                                cost,
                                health,
                            };

                            let emit_result = app_handle.emit("usage-updated", &dashboard);
                            if emit_result.is_ok() {
                                let usage_pct = if dashboard.quota.limit > 0 {
                                    dashboard.quota.used as f64 / dashboard.quota.limit as f64
                                } else {
                                    0.0
                                };

                                let config = app_state
                                    .config_store
                                    .load(&app_handle)
                                    .unwrap_or_else(|_| AppConfig::default());

                                if dashboard.quota.status == ProviderStatus::Ok && usage_pct >= 0.95
                                {
                                    let _ = app_handle.emit("quota-critical", &dashboard);
                                    if config.notifications.quota_critical {
                                        notify_quota_critical(&app_handle, &config, &dashboard);
                                    }
                                } else if dashboard.quota.status == ProviderStatus::Ok
                                    && usage_pct >= 0.8
                                {
                                    let _ = app_handle.emit("quota-warning", &dashboard);
                                    if config.notifications.quota_warning {
                                        notify_quota_warning(&app_handle, &config, &dashboard);
                                    }
                                }
                            }

                            cycle_entries.push(dashboard);
                            state.on_success();
                        }
                        _ => {
                            state.on_error();
                        }
                    }
                }

                if !cycle_entries.is_empty() {
                    update_tray_menu(&app_handle, &cycle_entries);
                }

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
}
