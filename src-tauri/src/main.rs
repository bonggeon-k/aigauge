#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod cost_engine;
mod credentials;
mod export;
mod keyboard;
mod notifications;
mod plugin_registry;
mod polling;
mod providers;
mod telemetry;
mod tray;
mod updater;

use anyhow::{anyhow, Result};
use commands::{
    check_provider_health, delete_credential, get_all_dashboard_data, get_cost, get_provider_info,
    get_providers, get_quota, get_usage, save_credential, AppState,
};
use config::{get_config, update_config};
use cost_engine::{get_cost_history, get_cost_summary, get_pace_analysis, get_roi_analysis};
use export::{export_data, export_to_file};
use keyboard::{get_keyboard_shortcuts, register_shortcuts};
use plugin_registry::{get_plugins, register_plugin};
use polling::PollingManager;
use tauri::{Emitter, Manager};
use telemetry::{get_telemetry_status, set_telemetry_enabled};
use tray::init_tray;
use updater::{check_for_update, install_update};

fn init_tracing() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter("info")
        .without_time()
        .try_init();
}

fn run() -> Result<()> {
    init_tracing();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, _event| {
                    match shortcut.to_string().as_str() {
                        "CommandOrControl+Shift+G" => {
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        "CommandOrControl+Shift+R" => {
                            let _ = app.emit("force-refresh", true);
                        }
                        _ => {}
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::new())
        .setup(|app| {
            init_tray(app.handle())?;
            register_shortcuts(app.handle())?;
            PollingManager::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_providers,
            get_usage,
            get_cost,
            get_provider_info,
            get_quota,
            get_all_dashboard_data,
            check_provider_health,
            save_credential,
            delete_credential,
            get_config,
            update_config,
            get_cost_summary,
            get_cost_history,
            get_roi_analysis,
            get_pace_analysis,
            export_data,
            export_to_file,
            check_for_update,
            install_update,
            get_keyboard_shortcuts,
            get_plugins,
            register_plugin,
            get_telemetry_status,
            set_telemetry_enabled
        ])
        .run(tauri::generate_context!())
        .map_err(|error| anyhow!("failed to run tauri app: {error}"))?;

    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
    }
}
