use once_cell::sync::Lazy;
use std::sync::Mutex;
use tauri::image::Image;
use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tracing::instrument;

use crate::commands::DashboardEntry;

pub const TRAY_EVENT_UPDATE: &str = "tray-update";
pub const TRAY_EVENT_REFRESH: &str = "tray-refresh";

static LAST_TRAY_FINGERPRINT: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new(String::new()));

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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
        .text("refresh", "Refresh")
        .separator()
        .text("total", "Total: $0.00/mo")
        .separator()
        .text("open_dashboard", "Open Dashboard")
        .text("open_settings", "Settings")
        .separator()
        .text("quit", "Quit")
        .build()
        .map_err(|error| format!("failed to build tray menu: {error}"))?;

    let mut builder = TrayIconBuilder::<R>::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("AIGauge — OK 0%");

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    let tray = builder
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_tray_popup(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "refresh" => {
                let _ = app.emit(TRAY_EVENT_REFRESH, true);
                let _ = app.emit("force-refresh", true);
            }
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
            "dashboard-codex" => {
                let _ = open::that("https://chatgpt.com/#settings/DataControls");
            }
            "dashboard-claude" => {
                let _ = open::that("https://claude.ai/settings");
            }
            "dashboard-gemini" => {
                let _ = open::that("https://gemini.google.com/app");
            }
            "dashboard-kiro" => {
                let _ = open::that("https://kiro.dev");
            }
            "dashboard-copilot" => {
                let _ = open::that("https://github.com/settings/copilot");
            }
            "dashboard-cursor" => {
                let _ = open::that("https://www.cursor.com/settings");
            }
            "dashboard-jetbrains" => {
                let _ = open::that("https://account.jetbrains.com/licenses");
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)
        .map_err(|error| format!("failed to build tray icon: {error}"))?;

    let _ = tray.set_icon(Some(render_tray_icon(0.0, 0.0, TrayStatus::Ok)));

    Ok(())
}

fn toggle_tray_popup<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("tray-popup") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
        return;
    }

    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn derive_status(entries: &[DashboardEntry]) -> (TrayStatus, f64, f64) {
    let mut status = TrayStatus::Ok;
    let mut top_pct = 0.0_f64;
    let mut bottom_pct = 0.0_f64;

    if let Some(codex) = entries.iter().find(|entry| entry.info.id == "codex") {
        top_pct = codex.usage.requests as f64;
        if codex.quota.limit > 0 {
            bottom_pct = (codex.quota.used as f64 / codex.quota.limit as f64) * 100.0;
        } else {
            bottom_pct = codex.usage.tokens as f64;
        }
    } else if let Some(first) = entries.first() {
        if first.quota.limit > 0 {
            let used = (first.quota.used as f64 / first.quota.limit as f64) * 100.0;
            top_pct = used;
            bottom_pct = used;
        }
    }

    let worst_pct = top_pct.max(bottom_pct);
    if worst_pct >= 95.0 {
        status = TrayStatus::Critical;
    } else if worst_pct >= 80.0 {
        status = TrayStatus::Warning;
    }

    (
        status,
        top_pct.clamp(0.0, 100.0),
        bottom_pct.clamp(0.0, 100.0),
    )
}

fn bar_color(used_pct: f64) -> [u8; 4] {
    let remaining = (100.0 - used_pct).clamp(0.0, 100.0);
    if remaining > 50.0 {
        [46, 204, 113, 255]
    } else if remaining > 20.0 {
        [241, 196, 15, 255]
    } else {
        [231, 76, 60, 255]
    }
}

fn status_badge_color(status: TrayStatus, is_light_windows: bool) -> [u8; 4] {
    let alpha = if is_light_windows { 255 } else { 220 };
    match status {
        TrayStatus::Ok => [46, 204, 113, alpha],
        TrayStatus::Warning => [241, 196, 15, alpha],
        TrayStatus::Critical => [231, 76, 60, alpha],
    }
}

fn render_tray_icon(top_pct: f64, bottom_pct: f64, status: TrayStatus) -> Image<'static> {
    let width = 32_u32;
    let height = 32_u32;
    let mut rgba = vec![0_u8; (width * height * 4) as usize];

    let mut draw_row_bar = |y_start: usize, y_end: usize, pct: f64| {
        let fill_w = ((pct / 100.0) * 28.0).round().clamp(0.0, 28.0) as usize;
        let color = bar_color(pct);
        for y in y_start..=y_end {
            for x in 2..30 {
                let idx = (y * 32 + x) * 4;
                if x <= 2 + fill_w {
                    rgba[idx] = color[0];
                    rgba[idx + 1] = color[1];
                    rgba[idx + 2] = color[2];
                    rgba[idx + 3] = 255;
                } else {
                    rgba[idx] = 80;
                    rgba[idx + 1] = 80;
                    rgba[idx + 2] = 80;
                    rgba[idx + 3] = 140;
                }
            }
        }
    };

    draw_row_bar(4, 12, top_pct);
    draw_row_bar(20, 28, bottom_pct);

    let badge = status_badge_color(status, is_windows_light_theme());
    for y in 1..7 {
        for x in 25..31 {
            let idx = (y * 32 + x) * 4;
            rgba[idx] = badge[0];
            rgba[idx + 1] = badge[1];
            rgba[idx + 2] = badge[2];
            rgba[idx + 3] = badge[3];
        }
    }

    Image::new_owned(rgba, width, height)
}

#[cfg(target_os = "windows")]
fn is_windows_light_theme() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) =
        hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize")
    {
        if let Ok(value) = key.get_value::<u32, _>("AppsUseLightTheme") {
            return value == 1;
        }
    }
    false
}

#[cfg(not(target_os = "windows"))]
fn is_windows_light_theme() -> bool {
    false
}

#[instrument(skip(app, entries))]
pub fn update_tray_menu(app: &AppHandle, entries: &[DashboardEntry]) {
    let total = entries
        .iter()
        .filter_map(|entry| entry.cost.as_ref().map(|cost| cost.total))
        .sum::<f64>();

    let (status, top_pct, bottom_pct) = derive_status(entries);
    let status_label = match status {
        TrayStatus::Ok => "OK",
        TrayStatus::Warning => "Warning",
        TrayStatus::Critical => "Critical",
    };

    let shown_pct = top_pct.max(bottom_pct).round();
    let mut fingerprint = format!("{status_label}|{total:.2}|{top_pct:.0}|{bottom_pct:.0}");
    for entry in entries {
        let pct = if entry.quota.limit > 0 {
            (entry.quota.used as f64 / entry.quota.limit as f64) * 100.0
        } else {
            0.0
        };
        fingerprint.push_str(format!("|{}:{pct:.0}", entry.info.id).as_str());
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
            .text("refresh", "Refresh")
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
                format!("{}: {pct:.0}% used", entry.info.name),
            );
        }

        menu_builder = menu_builder
            .separator()
            .text("dashboard-codex", "Codex Dashboard")
            .text("dashboard-claude", "Claude Dashboard")
            .text("dashboard-gemini", "Gemini Dashboard")
            .text("dashboard-kiro", "Kiro Dashboard")
            .text("dashboard-copilot", "Copilot Dashboard")
            .text("dashboard-cursor", "Cursor Dashboard")
            .text("dashboard-jetbrains", "JetBrains Dashboard")
            .separator()
            .text("open_dashboard", "Open Dashboard")
            .text("open_settings", "Settings")
            .separator()
            .text("quit", "Quit");

        if let Ok(menu) = menu_builder.build() {
            let _ = tray.set_menu(Some(menu));
        }

        let _ = tray.set_tooltip(Some(format!("AIGauge — {status_label} {shown_pct:.0}%")));
        let _ = tray.set_icon(Some(render_tray_icon(top_pct, bottom_pct, status)));
    }

    let _ = app.emit(TRAY_EVENT_UPDATE, total);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_event_constant_is_stable() {
        assert_eq!(TRAY_EVENT_UPDATE, "tray-update");
        assert_eq!(TRAY_EVENT_REFRESH, "tray-refresh");
    }
}
