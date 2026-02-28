use serde::Serialize;
use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tracing::instrument;

#[derive(Debug, Clone, Serialize)]
pub struct ShortcutInfo {
    pub id: String,
    pub accelerator: String,
    pub description: String,
}

pub fn default_shortcuts() -> Vec<ShortcutInfo> {
    vec![
        ShortcutInfo {
            id: "toggle_window".to_string(),
            accelerator: "CommandOrControl+Shift+G".to_string(),
            description: "Toggle main window visibility".to_string(),
        },
        ShortcutInfo {
            id: "refresh_providers".to_string(),
            accelerator: "CommandOrControl+Shift+R".to_string(),
            description: "Force refresh provider data".to_string(),
        },
    ]
}

#[instrument(skip(app))]
pub fn register_shortcuts<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    register_shortcut_if_available(app, "CommandOrControl+Shift+G", "toggle")?;
    register_shortcut_if_available(app, "CommandOrControl+Shift+R", "refresh")?;

    Ok(())
}

fn register_shortcut_if_available<R: Runtime>(
    app: &AppHandle<R>,
    shortcut: &str,
    label: &str,
) -> Result<(), String> {
    match app.global_shortcut().register(shortcut) {
        Ok(()) => Ok(()),
        Err(error) => {
            let detail = error.to_string();
            if detail.to_ascii_lowercase().contains("already registered") {
                tracing::warn!("{label} shortcut already registered by another app instance");
                Ok(())
            } else {
                Err(format!("failed to register {label} shortcut: {detail}"))
            }
        }
    }
}

#[tauri::command]
pub fn get_keyboard_shortcuts() -> Vec<ShortcutInfo> {
    default_shortcuts()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_two_shortcuts() {
        let shortcuts = default_shortcuts();
        assert_eq!(shortcuts.len(), 2);
        assert!(shortcuts
            .iter()
            .any(|item| item.accelerator.contains("Shift+G")));
    }
}
