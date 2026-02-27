# AIGauge

> FinOps dashboard for AI coding assistants.

![Version](https://img.shields.io/badge/version-1.0.0-0f766e)
![License](https://img.shields.io/badge/license-MIT-blue)
![CI](https://img.shields.io/github/actions/workflow/status/everygoodnews-ship-it/aigauge/ci.yml?branch=main)

## Highlights

- Usage/quota/cost dashboard for major AI coding providers
- Dual-mode UI: full dashboard window + tray widget popup (`/tray`)
- Cost analytics (trend, breakdown, ROI, pace)
- System tray quick status + alerts
- Auto-update support with signed metadata
- Export (CSV/JSON)
- Onboarding flow and accessibility polish
- Community plugin manifest foundation

## Screenshot Placeholders

- Dashboard Light: `1280x820`
- Dashboard Dark: `1280x820`
- Tray Popover: `600x500`
- Analytics: `1280x820`

## Quick Start

1. Download release artifact for your OS.
2. Install and launch AIGauge.
3. Run onboarding and configure provider credentials.
4. Monitor usage and cost in dashboard + analytics.
5. Use tray icon click to open the compact Quick View widget.

## Provider Setup Guide (Tray Widget)

- `codex`: `~/.codex/auth.json` available from Codex CLI login.
- `claude`: `~/.claude/.credentials.json` available after Claude CLI OAuth login.
- `gemini`: `~/.gemini/oauth_creds.json` available after Gemini CLI OAuth login.
- `kiro`: `kiro-cli chat --no-interactive /usage` must work in your shell.

## Build From Source

```bash
pnpm install
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm lint
pnpm build
pnpm tauri dev
```

## Supported Providers

| Provider | Auth Method | Tracks |
| --- | --- | --- |
| OpenAI Codex | API key / session token | Usage, quota, cost |
| Anthropic Claude | API key / org cookie | Usage, quota, cost |
| Google Gemini | API key | Usage, quota, cost |
| GitHub Copilot | OAuth token | Usage, quota, cost |
| Cursor | Access token | Usage, quota, cost |
| Kiro | Access token | Usage, quota, cost |
| JetBrains AI Assistant | API key | Usage, quota, cost |
| Community Plugins | Manifest-defined | Endpoint-dependent |

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd+Shift+G` | Toggle main window |
| `Ctrl/Cmd+Shift+R` | Force refresh providers |

## Comparison

- **AIGauge vs CodexBar**: multi-provider + desktop analytics/tray focus.
- **AIGauge vs ccusage**: GUI, cross-provider view, onboarding, tray notifications.

## Roadmap

- Phase 4: richer plugin SDK and marketplace concepts
- Phase 5: team dashboards and shared budgets
- Phase 6: advanced forecast and anomaly detection

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) and [docs/PLUGIN_GUIDE.md](docs/PLUGIN_GUIDE.md).

## License

MIT
