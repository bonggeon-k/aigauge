use tracing::instrument;

use crate::commands::DashboardEntry;
use crate::config::AppConfig;

#[instrument(skip(app, _config, entry))]
pub fn notify_quota_warning(app: &tauri::AppHandle, _config: &AppConfig, entry: &DashboardEntry) {
    #[allow(unused_must_use)]
    {
        let _ = tauri_plugin_notification::NotificationExt::notification(app)
            .builder()
            .title("AIGauge quota warning")
            .body(format!("{} usage is above 80%", entry.info.name))
            .show();
    }
}

#[instrument(skip(app, _config, entry))]
pub fn notify_quota_critical(app: &tauri::AppHandle, _config: &AppConfig, entry: &DashboardEntry) {
    #[allow(unused_must_use)]
    {
        let _ = tauri_plugin_notification::NotificationExt::notification(app)
            .builder()
            .title("AIGauge quota critical")
            .body(format!("{} usage is above 95%", entry.info.name))
            .show();
    }
}
