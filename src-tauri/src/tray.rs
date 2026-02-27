use once_cell::sync::Lazy;
use std::sync::Mutex;
use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tracing::instrument;

use crate::commands::DashboardEntry;

pub const TRAY_EVENT_UPDATE: &str = "tray-update";

static LAST_TRAY_FINGERPRINT: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new(String::new()));

#[derive(Debug, Clone, PartialEq)]
enum TrayStatus {
    Ok,
    Warning,
    Critical,
}

#[instrument(skip(app))]
pub fn init_tray<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    let menu = MenuBuilder::new(app)
        .text("title", "AIGauge")
        .separator()
        .text("total", "Total: $0.00/mo")
        .separator()
        .text("open_dashboard", "Open Dashboard")
        .text("open_settings", "Settings")
        .separator()
        .text("quit", "Quit")
        .build()
        .map_err(|error| format!("failed to build tray menu: {error}"))?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .tooltip("AIGauge — Total: $0.00/mo");

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open_dashboard" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "open_settings" => {
                let _ = app.emit("open-settings", true);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)
        .map_err(|error| format!("failed to build tray icon: {error}"))?;

    Ok(())
}

fn derive_status(entries: &[DashboardEntry]) -> TrayStatus {
    let mut status = TrayStatus::Ok;
    for entry in entries {
        let pct = if entry.quota.limit > 0 {
            entry.quota.used as f64 / entry.quota.limit as f64
        } else {
            0.0
        };
        if pct >= 0.95 {
            return TrayStatus::Critical;
        }
        if pct >= 0.8 {
            status = TrayStatus::Warning;
        }
    }
    status
}

#[instrument(skip(app, entries))]
pub fn update_tray_menu(app: &AppHandle, entries: &[DashboardEntry]) {
    let total = entries
        .iter()
        .filter_map(|entry| entry.cost.as_ref().map(|cost| cost.total))
        .sum::<f64>();

    let status = derive_status(entries);
    let status_emoji = match status {
        TrayStatus::Ok => "🟢",
        TrayStatus::Warning => "🟡",
        TrayStatus::Critical => "🔴",
    };

    let mut fingerprint = format!("{status_emoji}|{total:.2}");
    for entry in entries {
        let pct = if entry.quota.limit > 0 {
            (entry.quota.used as f64 / entry.quota.limit as f64) * 100.0
        } else {
            0.0
        };
        fingerprint.push_str(format!("|{}:{:.0}", entry.info.id, pct).as_str());
    }

    if let Ok(mut guard) = LAST_TRAY_FINGERPRINT.lock() {
        if *guard == fingerprint {
            return;
        }
        *guard = fingerprint;
    }

    if let Some(tray) = app.tray_by_id("main-tray") {
        let mut menu_builder = MenuBuilder::new(app)
            .text("title", "AIGauge")
            .separator()
            .text("total", format!("Total: ${total:.2}/mo"))
            .separator();

        for entry in entries {
            let pct = if entry.quota.limit > 0 {
                (entry.quota.used as f64 / entry.quota.limit as f64) * 100.0
            } else {
                0.0
            };
            menu_builder = menu_builder.text(
                format!("provider-{}", entry.info.id),
                format!("{}: {:.0}% used", entry.info.name, pct),
            );
        }

        if let Ok(menu) = menu_builder
            .separator()
            .text("open_dashboard", "Open Dashboard")
            .text("open_settings", "Settings")
            .separator()
            .text("quit", "Quit")
            .build()
        {
            let _ = tray.set_menu(Some(menu));
        }

        let _ = tray.set_tooltip(Some(format!("AIGauge — Total: ${total:.2}/mo")));
        let _ = tray.set_title(Some(status_emoji));
    }

    let _ = app.emit(TRAY_EVENT_UPDATE, total);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_event_constant_is_stable() {
        assert_eq!(TRAY_EVENT_UPDATE, "tray-update");
    }
}
