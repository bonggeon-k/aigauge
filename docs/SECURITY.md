# SECURITY

## Threat Model (T1-T6)

- T1: Credential exfiltration from local storage
- T2: Malicious renderer/IPC command abuse
- T3: MITM/tampered provider or updater responses
- T4: Untrusted content injection in UI context
- T5: Over-broad desktop capabilities
- T6: Sensitive data leakage in logs/errors

## Credential Flow

1. Frontend invokes credential IPC commands.
2. Backend routes all reads/writes through `CredentialManager`.
3. OS keychain backend is used (`keyring`).
4. Sensitive values are zeroized when dropped.

Credentials are never persisted in config files, telemetry, or exported reports.

## Plugin Security Model

- Plugin manifests are TOML files loaded from app data directory only.
- Manifest validation rejects empty IDs/names and `javascript:` endpoint schemes.
- Plugin requests use shared reqwest client with timeout.
- Plugin credential access is still delegated to `CredentialManager`.

## Telemetry Disclosure

Telemetry is disabled by default and includes only:

- app version
- OS identifier
- configured provider count

Telemetry excludes:

- credentials
- prompts
- usage payload details
- export content

## Update Signature Verification

- Current repository default is **unsigned development update metadata** for local/internal validation.
- Production signing is enabled at final public GitHub release time (release secrets + real pubkey).
- `tauri.conf.json` currently contains a placeholder pubkey until that release step.
- Update install is user-initiated from app UI.
- If updater initialization fails (for example during unsigned development builds),
  the app degrades gracefully and continues without update actions.

## Dependency Audit Notes

- `pnpm audit --audit-level=high` is required before release.
- `cargo audit` is required before release.
- Current RustSec output includes known *transitive* warnings from the Linux GTK3
  stack pulled by Tauri/WRY (`gtk`, `gdk`, `atk`, related `-sys` crates) and
  `unic-*` crates via `tauri-utils`.
- These are tracked upstream; no direct vulnerable app code path was identified.

## CSP Rationale

CSP restricts to app-local sources by default and permits outbound provider/update endpoints only.

## Isolation Pattern

Tauri isolation pattern is enabled (`dist-isolation/`) to reduce renderer privilege exposure.
