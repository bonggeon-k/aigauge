use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostPlatform {
    Windows,
    MacOs,
    Linux,
    Unknown,
}

pub fn detect_host_platform() -> HostPlatform {
    if cfg!(target_os = "windows") {
        HostPlatform::Windows
    } else if cfg!(target_os = "macos") {
        HostPlatform::MacOs
    } else if cfg!(target_os = "linux") {
        HostPlatform::Linux
    } else {
        HostPlatform::Unknown
    }
}

fn env_non_empty(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn env_path(key: &str) -> Option<PathBuf> {
    env_non_empty(key).map(PathBuf::from)
}

fn build_windows_home(homedrive: &str, homepath: &str) -> Option<PathBuf> {
    let drive = homedrive.trim();
    let path = homepath.trim();
    if drive.is_empty() || path.is_empty() {
        return None;
    }

    Some(PathBuf::from(format!("{drive}{path}")))
}

fn windows_home_from_drive_path() -> Option<PathBuf> {
    let drive = env_non_empty("HOMEDRIVE")?;
    let path = env_non_empty("HOMEPATH")?;
    build_windows_home(drive.as_str(), path.as_str())
}

pub fn home_dir() -> Option<PathBuf> {
    match detect_host_platform() {
        HostPlatform::Windows => env_path("USERPROFILE")
            .or_else(|| env_path("HOME"))
            .or_else(windows_home_from_drive_path),
        _ => env_path("HOME").or_else(|| env_path("USERPROFILE")),
    }
}

#[cfg(target_os = "windows")]
pub fn has_wsl() -> bool {
    std::process::Command::new("wsl.exe")
        .arg("--status")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
pub fn has_wsl() -> bool {
    false
}

pub fn kiro_usage_command() -> (String, Vec<String>) {
    if detect_host_platform() == HostPlatform::Windows && has_wsl() {
        return (
            "wsl.exe".to_string(),
            vec![
                "-e".to_string(),
                "kiro-cli".to_string(),
                "chat".to_string(),
                "--no-interactive".to_string(),
                "/usage".to_string(),
            ],
        );
    }

    (
        "kiro-cli".to_string(),
        vec![
            "chat".to_string(),
            "--no-interactive".to_string(),
            "/usage".to_string(),
        ],
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_has_stable_string() {
        assert!(matches!(
            detect_host_platform(),
            HostPlatform::Windows
                | HostPlatform::MacOs
                | HostPlatform::Linux
                | HostPlatform::Unknown
        ));
    }

    #[test]
    fn windows_home_builder_handles_empty_values() {
        assert!(build_windows_home("", "\\Users\\bk86").is_none());
        assert!(build_windows_home("C:", "").is_none());
    }

    #[test]
    fn windows_home_builder_creates_path() {
        let path = build_windows_home("C:", "\\Users\\bk86")
            .expect("expected path for valid home drive/path");
        let rendered = path.to_string_lossy();
        assert!(rendered.contains("Users"));
    }

    #[test]
    fn kiro_command_is_never_empty() {
        let (program, args) = kiro_usage_command();
        assert!(!program.trim().is_empty());
        assert!(!args.is_empty());
    }
}
