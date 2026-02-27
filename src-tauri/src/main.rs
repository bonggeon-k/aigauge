#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod credentials;
mod polling;
mod providers;

use anyhow::{anyhow, Result};
use commands::{
    check_provider_health, delete_credential, get_all_dashboard_data, get_cost, get_provider_info,
    get_providers, get_quota, get_usage, save_credential, AppState,
};
use config::{get_config, update_config};
use polling::PollingManager;

fn init_tracing() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter("info")
        .without_time()
        .try_init();
}

fn run() -> Result<()> {
    init_tracing();

    tauri::Builder::default()
        .manage(AppState::new())
        .setup(|app| {
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
            update_config
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
