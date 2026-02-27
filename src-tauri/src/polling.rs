use std::collections::HashMap;
use std::time::{Duration, Instant};

use tauri::Emitter;
use tauri::Manager;
use tracing::instrument;

use crate::commands::{provider_health, AppState, DashboardEntry};
use crate::providers::ProviderStatus;

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
            let provider_ids = ["codex", "claude", "gemini", "kiro", "copilot", "cursor"];
            let mut states: HashMap<String, ProviderPollState> = provider_ids
                .into_iter()
                .map(|id| {
                    (
                        id.to_string(),
                        ProviderPollState::new(id, Duration::from_secs(5 * 60)),
                    )
                })
                .collect();

            loop {
                for provider in provider_ids {
                    let Some(state) = states.get_mut(provider) else {
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

                                if dashboard.quota.status == ProviderStatus::Ok && usage_pct >= 0.95
                                {
                                    let _ = app_handle.emit("quota-critical", &dashboard);
                                } else if dashboard.quota.status == ProviderStatus::Ok
                                    && usage_pct >= 0.8
                                {
                                    let _ = app_handle.emit("quota-warning", &dashboard);
                                }
                            }

                            state.on_success();
                        }
                        _ => {
                            state.on_error();
                        }
                    }
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
