# SECURITY

## Threat Model (T1-T6)

- T1: Credential exfiltration from local storage
- T2: Malicious renderer/IPC command abuse
- T3: MITM/tampered provider or updater responses
- T4: Untrusted content injection in UI context
- T5: Over-broad desktop capabilities
- T6: Sensitive data leakage in logs/errors

## Credential Flow

1. Frontend invokes `save_credential` / `delete_credential` IPC.
2. Backend routes all credential operations through `CredentialManager`.
3. `CredentialManager` uses OS keychain APIs (`keyring` crate).
4. Read values are wrapped in `Zeroizing<String>` where applicable.
5. Provider modules request credentials via `CredentialManager` only.

No credentials are persisted in repo files, app config JSON, or export output by default.

## Update Signature Verification

- Updater uses Tauri updater plugin.
- `tauri.conf.json` defines release metadata endpoint and update `pubkey`.
- Signed artifacts and `latest.json` are expected from release workflow.
- Installation is initiated only through explicit IPC command (`install_update`).

## CSP Rationale

CSP is configured to:

- Restrict defaults to `self`
- Allow outbound `connect-src` only for provider endpoints and GitHub update metadata
- Keep style/script execution constrained to the packaged app and isolation environment

## Isolation Pattern

Tauri isolation pattern is enabled with assets from `dist-isolation/`.

Purpose:

- reduce renderer privilege surface
- minimize risk from injected/untrusted web content
- enforce stricter separation between privileged Rust commands and UI layer
