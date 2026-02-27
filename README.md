# AIGauge

AIGauge is a desktop FinOps dashboard for AI coding assistants. It tracks provider usage, quota pressure, spend, and cost efficiency in one Tauri + React application.

## Features

- Multi-provider dashboard with polling and health checks
- Cost Analytics page (monthly trend, provider breakdown, ROI, pace vs budget)
- Export pipeline (CSV/JSON, PDF placeholder)
- System tray summary with quick actions (open dashboard/settings, quit)
- Auto-update plumbing via signed updater metadata (`latest.json`)
- Native quota notifications for warning/critical thresholds

## Supported Providers

| Provider | Auth Method | Tracks |
| --- | --- | --- |
| OpenAI Codex | API key / session token | Usage, quota, monthly cost |
| Anthropic Claude | API key / org cookie | Usage, quota, estimated cost |
| Google Gemini | API key | Usage, quota, estimated cost |
| GitHub Copilot | OAuth token | Usage, quota, plan-level cost |
| Cursor | Access token | Usage, quota, estimated cost |
| Kiro | Access token | Usage, quota, estimated cost |
| JetBrains AI Assistant | API key | Usage, quota, monthly cost |

## Security Model

- All credentials are read/written only via `CredentialManager`
- Sensitive strings use zeroization on drop
- Tauri isolation pattern enabled (`dist-isolation/`)
- CSP limits network targets to required provider domains
- Capability scope is explicit in `src-tauri/capabilities/default.json`

## Cost Analytics

- `get_cost_summary`: total monthly cost + provider percentages
- `get_cost_history`: rolling 12-month persisted history
- `get_roi_analysis`: cost/request, cost/1K tokens, efficiency score
- `get_pace_analysis`: projected month-end spend vs budget

## Configuration

App config is persisted in the Tauri app data directory (`config.json`):

- Provider polling intervals
- Enabled providers
- Theme/language preferences
- Notification toggles

Cost history is stored in the same app data directory (`cost-history.json`) and capped to 12 months.

## Auto-Update

Updater endpoints are configured in `src-tauri/tauri.conf.json` and expected to serve signed `latest.json` metadata from GitHub Releases.

## Export

- Backend commands: `export_data`, `export_to_file`
- Formats: CSV and JSON (`PDF` currently returns JSON placeholder payload)
- Frontend Export panel supports provider filtering and cost field toggle

## Keyboard Shortcuts

- No global shortcuts are currently bound.
- Tray icon click toggles main window visibility.

## Development (WSL2 Ubuntu)

```bash
pnpm install
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm lint
pnpm build
pnpm tauri dev
```

## Screenshots

- `docs/screenshots/dashboard-light.png` (dashboard placeholder)
- `docs/screenshots/dashboard-dark.png` (dashboard placeholder)
- `docs/screenshots/analytics.png` (analytics placeholder)
