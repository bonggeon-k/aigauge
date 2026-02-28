# Windows Native Test Guide

This guide is for running AIGauge as a native Windows desktop app (not WSL UI).

## 1) Prerequisites (PowerShell)

- Windows 11
- Rust stable (`rustup`)
- Node.js 22+
- `pnpm` 10+
- Visual Studio Build Tools with C++ workload
- WebView2 Runtime installed
- Optional: WSL2 enabled for Kiro and WSL-based credential fallback

## 2) Open Project on Windows

Use a PowerShell terminal and run from your Windows checkout path:

```powershell
cd C:\Dev\aigauge
pnpm install
```

One-command smoke run (recommended):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-native-smoke.ps1
```

## 3) Validate Build/Test

```powershell
pnpm doctor:providers
pnpm lint
pnpm build
cd src-tauri
cargo clippy --all-targets -- -D warnings
cargo test
cd ..
```

## 4) Launch Native App

```powershell
pnpm tauri dev
```

Expected:
- Main window opens.
- Tray icon appears.
- Tray left-click opens/closes quick view popup.
- Popup opens near tray area and stays visible while you drag inside the header area.

## 5) Provider Checks

## Codex / Claude / Gemini
- If Windows-local credentials exist, they are used.
- If not, Windows app can fallback to WSL files:
  - `~/.codex/auth.json`
  - `~/.claude/.credentials.json`
  - `~/.gemini/oauth_creds.json`
- `pnpm doctor:providers` now validates both Windows-local and WSL fallback paths.

## Kiro
- Uses `wsl.exe -e bash -lc "kiro-cli chat --no-interactive /usage"` when WSL is available.
- If command fails 3 times consecutively, provider enters unreachable state until next successful run.

## Cost (Codex 30d estimate)
- Reads `.codex/sessions` and `.codex/archived_sessions`.
- On Windows, also attempts WSL-backed paths for these folders.

## 6) Quick Acceptance Checklist

- Dashboard cards are same visual height.
- Codex shows both:
  - 5-hour session window
  - weekly window
- Tray popup does not disappear while dragging in the header.
- Unconfigured providers show setup guidance instead of crashing.
- Manual input can be saved and reflected in UI.

## 7) Troubleshooting

- If tray popup does not open:
  - Ensure app is not blocked by Windows focus assist / security overlays.
  - Left-click tray icon once; avoid rapid double-click.
- If Codex/Claude/Gemini still show not configured:
  - Verify credential files exist in Windows home or WSL home.
  - Confirm file contents are valid JSON and not expired.
- If Kiro is unavailable:
  - Confirm WSL is installed and `kiro-cli` runs inside WSL shell.
