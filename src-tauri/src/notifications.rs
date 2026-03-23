use tracing::instrument;

use crate::commands::DashboardEntry;
use crate::config::AppConfig;

fn is_korean(config: &AppConfig) -> bool {
    config.language.to_ascii_lowercase().starts_with("ko")
}

#[instrument(skip(app, config, entry))]
pub fn notify_quota_warning(app: &tauri::AppHandle, config: &AppConfig, entry: &DashboardEntry) {
    let (title, body) = if is_korean(config) {
        (
            "AIGauge 사용량 경고".to_string(),
            format!("{} 사용량이 80%를 초과했습니다.", entry.info.name),
        )
    } else {
        (
            "AIGauge quota warning".to_string(),
            format!("{} usage is above 80%", entry.info.name),
        )
    };
    #[allow(unused_must_use)]
    {
        let _ = tauri_plugin_notification::NotificationExt::notification(app)
            .builder()
            .title(title)
            .body(body)
            .show();
    }
}

#[instrument(skip(app, config, entry))]
pub fn notify_quota_critical(app: &tauri::AppHandle, config: &AppConfig, entry: &DashboardEntry) {
    let (title, body) = if is_korean(config) {
        (
            "AIGauge 사용량 위험".to_string(),
            format!("{} 사용량이 95%를 초과했습니다.", entry.info.name),
        )
    } else {
        (
            "AIGauge quota critical".to_string(),
            format!("{} usage is above 95%", entry.info.name),
        )
    };
    #[allow(unused_must_use)]
    {
        let _ = tauri_plugin_notification::NotificationExt::notification(app)
            .builder()
            .title(title)
            .body(body)
            .show();
    }
}
