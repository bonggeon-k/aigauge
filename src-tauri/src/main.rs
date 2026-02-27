#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod cost_engine;
mod credentials;
mod export;
mod notifications;
mod polling;
mod providers;
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
use polling::PollingManager;
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
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::new())
        .setup(|app| {
            init_tray(app.handle())?;
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
            install_update
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
