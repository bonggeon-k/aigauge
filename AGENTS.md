# AIGauge — AGENTS.md

## Product
- **Name**: AIGauge
- **Purpose**: FinOps dashboard for AI coding tools (usage, cost, ROI tracking)
- **Stack**: Tauri 2.x (Rust) + React 19 + TypeScript + shadcn/ui + Tailwind v4
- **Repo**: everygoodnews-ship-it/aigauge
- **License**: MIT

## Architecture
Copy
src-tauri/src/ main.rs, commands.rs, credentials.rs providers/ (mod.rs, codex.rs, claude.rs, gemini.rs, kiro.rs, copilot.rs, cursor.rs) src/ components/ (ui/, layout/, dashboard/, providers/) hooks/, lib/, styles/, i18n/ dist-isolation/ docs/, tests/, .github/workflows/, .codex/


## Security Rules (MANDATORY)
1. ALL secrets via CredentialManager → OS keychain. Never plaintext.
2. Zeroize sensitive data after use.
3. CSP: default-src 'self'; connect-src 'self' https://*.anthropic.com https://*.openai.com https://*.github.com https://*.google.com https://*.amazonaws.com; style-src 'self' 'unsafe-inline'
4. Tauri isolation pattern enabled. IPC validation on all commands.
5. No unwrap!() — use anyhow::Result or thiserror.
6. Tauri capabilities scoped per window. No blanket permissions.
7. Credential access logged via tracing crate.

## Coding Standards
### Rust
- Edition 2021, cargo clippy -D warnings, cargo test must pass
- anyhow for app errors, thiserror for library errors
- tokio async, reqwest with 30s timeout
- #[cfg(target_os)] for OS-specific code

### TypeScript
- strict mode, ESLint + Prettier, no any type
- Functional components, named exports, React hooks

## Environment
- Dev: WSL2 Ubuntu, Preview: WSLg (WebKitGTK)
- Build: GitHub Actions (windows-latest, ubuntu-latest, macos-latest)
- Windows .exe/.msi: CI only (no cross-compile)
