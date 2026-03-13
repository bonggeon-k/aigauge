use std::path::PathBuf;
#[cfg(target_os = "windows")]
use std::process::Command;
#[cfg(target_os = "windows")]
use std::sync::OnceLock;

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
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
pub fn configure_hidden_process(command: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
pub fn configure_hidden_process(_command: &mut std::process::Command) {}

#[cfg(target_os = "windows")]
fn shell_single_quote(value: &str) -> String {
    value.replace('\'', "'\\''")
}

#[cfg(target_os = "windows")]
pub fn wsl_to_windows_path(unix_path: &str) -> Option<PathBuf> {
    let trimmed = unix_path.trim();
    if trimmed.is_empty() || !has_wsl() {
        return None;
    }

    let quoted = shell_single_quote(trimmed);
    let command = format!("wslpath -w '{quoted}'");
    let mut process = Command::new("wsl.exe");
    configure_hidden_process(&mut process);
    let output = process
        .args(["-e", "bash", "-lc", command.as_str()])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let raw = String::from_utf8(output.stdout).ok()?;
    let path = raw.trim();
    if path.is_empty() {
        None
    } else {
        Some(PathBuf::from(path))
    }
}

#[cfg(not(target_os = "windows"))]
pub fn wsl_to_windows_path(_unix_path: &str) -> Option<PathBuf> {
    None
}

#[cfg(target_os = "windows")]
pub fn read_wsl_text_file(unix_path: &str) -> Option<String> {
    let trimmed = unix_path.trim();
    if trimmed.is_empty() || !has_wsl() {
        return None;
    }

    let quoted = shell_single_quote(trimmed);
    let command = format!("test -f '{quoted}' && cat '{quoted}'");
    let mut process = Command::new("wsl.exe");
    configure_hidden_process(&mut process);
    let output = process
        .args(["-e", "bash", "-lc", command.as_str()])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let raw = String::from_utf8(output.stdout).ok()?;
    if raw.trim().is_empty() {
        None
    } else {
        Some(raw)
    }
}

#[cfg(not(target_os = "windows"))]
pub fn read_wsl_text_file(_unix_path: &str) -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
pub fn has_wsl() -> bool {
    static HAS_WSL: OnceLock<bool> = OnceLock::new();
    *HAS_WSL.get_or_init(|| {
        let mut process = std::process::Command::new("wsl.exe");
        configure_hidden_process(&mut process);
        process
            .arg("--status")
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    })
}

#[cfg(not(target_os = "windows"))]
pub fn has_wsl() -> bool {
    false
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
    fn non_windows_wsl_helpers_return_none() {
        #[cfg(not(target_os = "windows"))]
        {
            assert!(wsl_to_windows_path("~/.codex").is_none());
            assert!(read_wsl_text_file("~/.codex/auth.json").is_none());
        }
    }
}
