use aigauge::commands::AppState;
use aigauge::config::{AppConfig, ConfigStore};
use aigauge::polling::ProviderPollState;
use std::time::Duration;

#[test]
fn config_persistence_roundtrip() {
    let temp = tempfile::tempdir().expect("tempdir should be created");
    let path = temp.path().join("config.json");

    let config = AppConfig {
        language: "ko".to_string(),
        ..AppConfig::default()
    };

    ConfigStore::save_to_path(path.as_path(), &config).expect("config save should succeed");
    let loaded = ConfigStore::load_from_path(path.as_path()).expect("config load should succeed");

    assert_eq!(loaded.language, "ko");
}

#[test]
fn polling_state_backoff_lifecycle() {
    let mut poll_state = ProviderPollState::new("codex", Duration::from_secs(300));
    poll_state.on_error();
    assert_eq!(poll_state.current_interval, Duration::from_secs(600));

    poll_state.on_success();
    assert_eq!(poll_state.current_interval, Duration::from_secs(300));
}

#[tokio::test]
#[ignore = "requires local keyring backend"]
async fn ipc_roundtrip_save_usage_delete() {
    let state = AppState::new();
    state
        .credential_manager
        .save_credential("codex", "test-token".to_string())
        .expect("save credential should succeed");

    let usage = state
        .providers
        .usage_for("codex")
        .await
        .expect("usage call should return data");
    assert_eq!(usage.provider, "codex");

    state
        .credential_manager
        .delete_credential("codex")
        .expect("delete credential should succeed");
}
