#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod credentials;
mod providers;

use anyhow::{anyhow, Result};
use commands::{delete_credential, get_cost, get_providers, get_usage, save_credential, AppState};

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
        .invoke_handler(tauri::generate_handler![
            get_providers,
            get_usage,
            get_cost,
            save_credential,
            delete_credential
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
