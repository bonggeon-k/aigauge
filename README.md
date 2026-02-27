# AIGauge

AIGauge is a desktop FinOps dashboard for AI coding tools, built with Tauri 2.x, Rust, React 19, TypeScript, shadcn/ui, and Tailwind v4.

## Features

- Multi-provider usage dashboard (Codex, Claude, Gemini, Kiro, GitHub Copilot, Cursor)
- Provider abstraction with Tauri IPC commands (`get_providers`, `get_usage`, `get_cost`)
- Secure credential operations through OS keychain only
- Light/Dark theming with system detection
- React dashboard cards and usage gauges for quick monitoring
- Cross-platform CI and release workflows

## Supported Providers

| Provider | Auth Method | Tracks |
| --- | --- | --- |
| OpenAI Codex | API key / session token | Usage, quota, monthly cost |
| Anthropic Claude | API key / org cookie | Usage, quota, estimated cost |
| Google Gemini | API key | Usage, quota, estimated cost |
| GitHub Copilot | OAuth token | Usage, quota, plan-level cost |
| Cursor | Access token | Usage, quota, estimated cost |
| Kiro | Access token | Usage, quota, estimated cost |

## Security Model

- All credential reads/writes route through `CredentialManager`
- Sensitive credential values are zeroized on drop
- Tauri isolation pattern enabled via `dist-isolation/`
- Strict CSP and minimal Tauri capability scope
- No plaintext secret storage in repository files

## Configuration

- Provider credentials are stored in OS keychain via `CredentialManager`
- App config is stored as JSON in Tauri app data directory:
  - polling intervals
  - enabled providers
  - language and theme preferences
  - notification toggles for quota warnings/critical events
- Runtime events emitted by backend polling:
  - `usage-updated`
  - `quota-warning` (>= 80%)
  - `quota-critical` (>= 95%)

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

- `docs/screenshots/dashboard-light.png` (Phase 1 dashboard placeholder)
- `docs/screenshots/dashboard-dark.png` (Phase 1 dashboard placeholder)
