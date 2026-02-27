# Environment Checklist (WSL2 / macOS / Windows)

Use this checklist before validating provider integrations in AIGauge.

## 1. Base Toolchain

- `node`, `pnpm`, `cargo` are installed and available in `PATH`.
- Linux/WSL2 desktop dependencies for Tauri are installed.
- Optional but recommended: `sqlite3` (Cursor browser cookie fallback import).

## 2. Provider Prerequisites

- Codex:
  - `~/.codex/auth.json` exists.
  - `OPENAI_API_KEY` or `tokens.access_token` is present.
- Claude:
  - `~/.claude/.credentials.json` exists.
  - `claudeAiOauth.accessToken` is present.
  - `claudeAiOauth.scopes` includes `user:profile`.
  - `expiresAt` is not near expiry.
- Gemini:
  - `~/.gemini/oauth_creds.json` exists.
  - `access_token` and valid `expires_at` are present.
- Kiro:
  - `kiro-cli chat --no-interactive /usage` runs successfully.
  - Output includes `Estimated Usage`.
- Copilot:
  - `gh auth status -h github.com` returns success or app credential is set.
- Cursor:
  - Manual cookie header set, or browser cookie sources are discoverable.
  - `sqlite3` installed if using browser DB fallback.

## 3. Network Reachability

- Provider API/service endpoints are reachable from your environment:
  - `chatgpt.com`
  - `api.claude.ai` or fallback `claude.ai`
  - `cloudcode-pa.googleapis.com`
  - status endpoints (OpenAI/Anthropic/Google/GitHub/Cursor/JetBrains/Kiro)

## 4. One-command Doctor

Run:

```bash
pnpm doctor:providers
```

Strict mode (warnings treated as failure):

```bash
pnpm doctor:providers --strict
```

## 5. Typical Fixes

- Re-authenticate CLI providers:
  - `codex`
  - `claude`
  - Gemini CLI login flow
  - `gh auth login -h github.com`
- Install missing helper tools:
  - `sqlite3` for Cursor cookie DB fallback
- Re-run:
  - `pnpm doctor:providers`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `pnpm tauri dev`

