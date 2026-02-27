# AIGauge

AIGauge is a desktop FinOps dashboard for AI coding tools, built with Tauri 2.x, Rust, React 19, TypeScript, shadcn/ui, and Tailwind v4.

## Features

- Multi-provider usage dashboard (Codex, Claude, Gemini, Kiro, GitHub Copilot, Cursor)
- Provider abstraction with Tauri IPC commands (`get_providers`, `get_usage`, `get_cost`)
- Secure credential operations through OS keychain only
- Light/Dark theming with system detection
- React dashboard cards and usage gauges for quick monitoring
- Cross-platform CI and release workflows

## Security Model

- All credential reads/writes route through `CredentialManager`
- Sensitive credential values are zeroized on drop
- Tauri isolation pattern enabled via `dist-isolation/`
- Strict CSP and minimal Tauri capability scope
- No plaintext secret storage in repository files

## Development (WSL2 Ubuntu)

```bash
pnpm install
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm lint
pnpm build
pnpm tauri dev
```

## Build Notes

- Linux development and preview are supported in WSLg
- Windows installers (`.exe/.msi`) are produced in GitHub Actions release pipeline

## Screenshots

- `docs/screenshots/dashboard-light.png` (placeholder)
- `docs/screenshots/dashboard-dark.png` (placeholder)
