use once_cell::sync::Lazy;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::image::Image;
use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Runtime, WindowEvent};
use tracing::instrument;

use crate::commands::{track_usage_pct, DashboardEntry, TrackKind};

pub const TRAY_EVENT_UPDATE: &str = "tray-update";
pub const TRAY_EVENT_REFRESH: &str = "tray-refresh";

static LAST_TRAY_FINGERPRINT: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new(String::new()));
static LAST_TOGGLE_AT: Lazy<Mutex<Option<Instant>>> = Lazy::new(|| Mutex::new(None));
static LAST_POPUP_POSITION: Lazy<Mutex<Option<(i32, i32)>>> = Lazy::new(|| Mutex::new(None));
static POPUP_SHOWN_ONCE: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TrayStatus {
    Ok,
    Warning,
    Critical,
}

#[derive(Debug, Clone, Copy)]
struct TrayDerivedStatus {
    status: TrayStatus,
    top_pct: f64,
    bottom_pct: f64,
    worst_pct: Option<f64>,
    codex_session_pct: Option<f64>,
    codex_weekly_pct: Option<f64>,
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
        .tooltip("AIGauge — No active quota data");

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    let tray = builder
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                position,
                ..
            } = event
            {
                toggle_tray_popup(tray.app_handle(), Some((position.x, position.y)));
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "refresh" => {
                let _ = app.emit(TRAY_EVENT_REFRESH, true);
                let _ = app.emit("force-refresh", true);
            }
            "open_dashboard" => {
                let _ = app.emit("open-dashboard", true);
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

    if let Some(window) = app.get_webview_window("tray-popup") {
        window.on_window_event(|event| {
            if let WindowEvent::Moved(position) = event {
                if let Ok(mut guard) = LAST_POPUP_POSITION.lock() {
                    *guard = Some((position.x, position.y));
                }
            }
        });
    }

    let _ = tray.set_icon(Some(render_tray_icon(0.0, 0.0, TrayStatus::Ok)));

    Ok(())
}

fn should_skip_toggle() -> bool {
    if let Ok(mut guard) = LAST_TOGGLE_AT.lock() {
        if let Some(last) = guard.as_ref() {
            if last.elapsed() < Duration::from_millis(220) {
                return true;
            }
        }
        *guard = Some(Instant::now());
    }
    false
}

fn remember_popup_position<R: Runtime>(window: &tauri::WebviewWindow<R>) {
    if let Ok(position) = window.outer_position() {
        if let Ok(mut guard) = LAST_POPUP_POSITION.lock() {
            *guard = Some((position.x, position.y));
        }
    }
}

fn restore_popup_position<R: Runtime>(window: &tauri::WebviewWindow<R>) -> bool {
    let Some((x, y)) = LAST_POPUP_POSITION.lock().ok().and_then(|guard| *guard) else {
        return false;
    };
    window.set_position(PhysicalPosition::new(x, y)).is_ok()
}

fn position_popup_window<R: Runtime>(window: &tauri::WebviewWindow<R>, click: Option<(f64, f64)>) {
    let Some((x, y)) = click else {
        return;
    };

    let size = window
        .outer_size()
        .ok()
        .map(|value| (value.width as f64, value.height as f64))
        .unwrap_or((420.0, 540.0));

    let mut target_x = (x - (size.0 / 2.0)).round();
    let mut target_y = (y - size.1 - 12.0).round();
    if target_y < 12.0 {
        target_y = (y + 12.0).round();
    }
    if target_x < 8.0 {
        target_x = 8.0;
    }

    let _ = window.set_position(PhysicalPosition::new(target_x as i32, target_y as i32));
}

fn toggle_tray_popup<R: Runtime>(app: &AppHandle<R>, click: Option<(f64, f64)>) {
    if should_skip_toggle() {
        return;
    }

    if let Some(window) = app.get_webview_window("tray-popup") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            remember_popup_position(&window);
            let _ = window.hide();
        } else {
            let should_position = POPUP_SHOWN_ONCE
                .lock()
                .map(|shown| !*shown)
                .unwrap_or(false);
            if should_position && !restore_popup_position(&window) {
                position_popup_window(&window, click);
            }
            let _ = window.show();
            let _ = window.set_focus();
            if let Ok(mut shown) = POPUP_SHOWN_ONCE.lock() {
                *shown = true;
            }
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

fn entry_subscription_used_pct(entry: &DashboardEntry) -> Option<f64> {
    entry
        .tracks
        .iter()
        .filter(|track| track.kind == TrackKind::Subscription)
        .filter_map(track_usage_pct)
        .map(|value| value * 100.0)
        .reduce(f64::max)
        .or_else(|| {
            if entry.quota.limit > 0 {
                Some((entry.quota.used as f64 / entry.quota.limit as f64) * 100.0)
            } else {
                None
            }
        })
}

fn codex_subscription_track_pct(entry: &DashboardEntry, marker: &str) -> Option<f64> {
    entry
        .tracks
        .iter()
        .find(|track| track.kind == TrackKind::Subscription && track.id.contains(marker))
        .and_then(track_usage_pct)
        .map(|value| value * 100.0)
}

fn derive_status(entries: &[DashboardEntry]) -> TrayDerivedStatus {
    let mut status = TrayStatus::Ok;
    let mut top_pct = 0.0_f64;
    let mut bottom_pct = 0.0_f64;
    let mut codex_session_pct = None;
    let mut codex_weekly_pct = None;

    if let Some(codex) = entries
        .iter()
        .find(|entry| entry.info.id == "codex" && !entry.tracks.is_empty())
    {
        codex_session_pct = codex_subscription_track_pct(codex, "5-hour");
        codex_weekly_pct = codex_subscription_track_pct(codex, "weekly");
        let codex_used_pct = entry_subscription_used_pct(codex);
        top_pct = codex_session_pct.or(codex_used_pct).unwrap_or(0.0);
        bottom_pct = codex_weekly_pct.or(codex_used_pct).unwrap_or(top_pct);
    } else if let Some(first_active_pct) = entries.iter().find_map(entry_subscription_used_pct) {
        top_pct = first_active_pct;
        bottom_pct = first_active_pct;
    }

    let worst_pct = entries
        .iter()
        .filter_map(entry_subscription_used_pct)
        .reduce(f64::max);
    if let Some(value) = worst_pct {
        if value >= 95.0 {
            status = TrayStatus::Critical;
        } else if value >= 80.0 {
            status = TrayStatus::Warning;
        }
    }
    if status == TrayStatus::Ok && entries.iter().any(|entry| entry.stale) {
        status = TrayStatus::Warning;
    }

    TrayDerivedStatus {
        status,
        top_pct: top_pct.clamp(0.0, 100.0),
        bottom_pct: bottom_pct.clamp(0.0, 100.0),
        worst_pct: worst_pct.map(|value| value.clamp(0.0, 100.0)),
        codex_session_pct: codex_session_pct.map(|value| value.clamp(0.0, 100.0)),
        codex_weekly_pct: codex_weekly_pct.map(|value| value.clamp(0.0, 100.0)),
    }
}

fn build_tray_tooltip(derived: TrayDerivedStatus, stale_count: usize) -> String {
    let mut tooltip = if let Some(worst_pct) = derived.worst_pct {
        format!("AIGauge — Risk {worst_pct:.0}% (max subscription used across active providers)")
    } else {
        "AIGauge — No active quota data".to_string()
    };

    let mut codex_parts = Vec::new();
    if let Some(session_pct) = derived.codex_session_pct {
        codex_parts.push(format!("session {session_pct:.0}%"));
    }
    if let Some(weekly_pct) = derived.codex_weekly_pct {
        codex_parts.push(format!("weekly {weekly_pct:.0}%"));
    }
    if !codex_parts.is_empty() {
        tooltip.push_str(" · Codex ");
        tooltip.push_str(codex_parts.join(", ").as_str());
    }

    if stale_count > 0 {
        tooltip.push_str(format!(" · stale {stale_count}").as_str());
    }

    tooltip
}

fn provider_menu_label(entry: &DashboardEntry) -> String {
    let stale_suffix = if entry.stale { " (stale)" } else { "" };
    match entry_subscription_used_pct(entry) {
        Some(pct) => format!(
            "{}: {pct:.0}% subscription used{stale_suffix}",
            entry.info.name
        ),
        None => format!("{}: No active quota data{stale_suffix}", entry.info.name),
    }
}

fn provider_fingerprint(entry: &DashboardEntry) -> String {
    match entry_subscription_used_pct(entry) {
        Some(pct) => format!("{}:{pct:.0}:{}", entry.info.id, entry.stale),
        None => format!("{}:none:{}", entry.info.id, entry.stale),
    }
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

    let derived = derive_status(entries);
    let status_label = match derived.status {
        TrayStatus::Ok => "OK",
        TrayStatus::Warning => "Warning",
        TrayStatus::Critical => "Critical",
    };

    let stale_count = entries.iter().filter(|entry| entry.stale).count();
    let tooltip = build_tray_tooltip(derived, stale_count);
    let mut fingerprint = format!(
        "{status_label}|{total:.2}|{:.0}|{:.0}|{tooltip}",
        derived.top_pct, derived.bottom_pct
    );
    for entry in entries {
        let component = provider_fingerprint(entry);
        fingerprint.push('|');
        fingerprint.push_str(component.as_str());
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
            menu_builder = menu_builder.text(
                format!("provider-{}", entry.info.id),
                provider_menu_label(entry),
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

        let _ = tray.set_tooltip(Some(tooltip));
        let _ = tray.set_icon(Some(render_tray_icon(
            derived.top_pct,
            derived.bottom_pct,
            derived.status,
        )));
    }

    let _ = app.emit(TRAY_EVENT_UPDATE, total);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{CostDisplayMode, CostView, DataSource, HealthStatus, UsageTrack};
    use crate::providers::{
        AuthMethod, AuthSourceMode, ProviderInfo, ProviderStatus, QuotaLimit, UsageData,
    };

    #[test]
    fn tray_event_constant_is_stable() {
        assert_eq!(TRAY_EVENT_UPDATE, "tray-update");
        assert_eq!(TRAY_EVENT_REFRESH, "tray-refresh");
    }

    #[test]
    fn tooltip_explains_subscription_risk_and_codex_breakdown() {
        let entries = vec![
            dashboard_entry(
                "codex",
                "Codex",
                vec![
                    subscription_track("subscription:5-hour_session", 40, 100),
                    subscription_track("subscription:weekly_limit", 70, 100),
                ],
                70,
                100,
                false,
            ),
            dashboard_entry(
                "claude",
                "Claude",
                vec![subscription_track("subscription:7-day_window", 60, 100)],
                60,
                100,
                false,
            ),
        ];

        let derived = derive_status(&entries);
        let tooltip = build_tray_tooltip(derived, 0);

        assert_eq!(
            derived.worst_pct.map(|value| value.round() as u64),
            Some(70)
        );
        assert!(tooltip.contains("Risk 70%"));
        assert!(tooltip.contains("max subscription used across active providers"));
        assert!(tooltip.contains("Codex session 40%, weekly 70%"));
    }

    #[test]
    fn tooltip_falls_back_when_no_active_subscription_data_exists() {
        let entries = vec![dashboard_entry("copilot", "Copilot", vec![], 0, 0, false)];
        let derived = derive_status(&entries);
        let tooltip = build_tray_tooltip(derived, 0);

        assert!(derived.worst_pct.is_none());
        assert_eq!(tooltip, "AIGauge — No active quota data");
    }

    #[test]
    fn provider_menu_label_uses_subscription_basis_with_fallback() {
        let with_data = dashboard_entry(
            "claude",
            "Claude",
            vec![subscription_track("subscription:7-day_window", 55, 100)],
            55,
            100,
            false,
        );
        let without_data = dashboard_entry("cursor", "Cursor", vec![], 0, 0, true);

        assert_eq!(
            provider_menu_label(&with_data),
            "Claude: 55% subscription used"
        );
        assert_eq!(
            provider_menu_label(&without_data),
            "Cursor: No active quota data (stale)"
        );
    }

    fn subscription_track(id: &str, used: u64, limit: u64) -> UsageTrack {
        UsageTrack {
            id: id.to_string(),
            kind: TrackKind::Subscription,
            label: id.to_string(),
            used,
            limit,
            unit: "percent".to_string(),
            reset_at: String::new(),
            status: ProviderStatus::Ok,
            source: DataSource::Snapshot,
        }
    }

    fn dashboard_entry(
        id: &str,
        name: &str,
        tracks: Vec<UsageTrack>,
        quota_used: u64,
        quota_limit: u64,
        stale: bool,
    ) -> DashboardEntry {
        DashboardEntry {
            info: ProviderInfo {
                id: id.to_string(),
                name: name.to_string(),
                icon: String::new(),
                auth_method: AuthMethod::OAuth,
                supported_auth_modes: vec![AuthSourceMode::Auto],
                default_auth_mode: AuthSourceMode::Auto,
                plan_name: "test".to_string(),
                quota_limit: quota_limit.max(100),
                reset_period: "monthly".to_string(),
            },
            usage: UsageData {
                provider: id.to_string(),
                requests: 0,
                tokens: 0,
                period_start: String::new(),
                period_end: String::new(),
                status: ProviderStatus::Ok,
            },
            quota: QuotaLimit {
                used: quota_used,
                limit: quota_limit,
                unit: "percent".to_string(),
                reset_at: String::new(),
                status: ProviderStatus::Ok,
            },
            cost: None,
            tracks,
            preferred_track: TrackKind::Subscription,
            cost_view: CostView {
                mode: CostDisplayMode::Unavailable,
                currency: "USD".to_string(),
                total: None,
                note: String::new(),
            },
            stale,
            health: HealthStatus {
                configured: true,
                reachable: true,
                last_checked: String::new(),
            },
        }
    }
}
