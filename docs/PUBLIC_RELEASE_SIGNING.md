# Public Release Signing

Public AIGauge installers should be distributed only as **signed production releases**.

Without platform trust signing:

- **Windows** users can see SmartScreen warnings and installation blocks.
- **macOS** users can see Gatekeeper warnings, and unsigned / unnotarized apps may be blocked from launching.

This repository supports three separate trust layers during release:

1. **Tauri updater signing**
2. **Windows Authenticode signing**
3. **macOS code signing + notarization**

## What is required

### Windows public release

To reduce or avoid SmartScreen trust warnings, ship a Windows build signed with a real code-signing certificate.

Required GitHub secrets:

- `WINDOWS_CERTIFICATE`
- `WINDOWS_CERTIFICATE_PASSWORD`
- `WINDOWS_CERTIFICATE_SHA1`
- `WINDOWS_DIGEST_ALGORITHM`
- `WINDOWS_TIMESTAMP_URL`

Notes:

- Self-signed certificates are suitable only for internal QA.
- OV/EV code-signing certificates are required for public distribution trust.

### macOS public release

To avoid Gatekeeper blocking downloaded builds, ship a macOS build signed with a **Developer ID Application** certificate and notarized by Apple.

Required GitHub secrets:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`
- `KEYCHAIN_PASSWORD`

Notes:

- For distribution outside the App Store, `Developer ID Application` is the correct certificate class.
- Notarization is required for a smooth first-run experience on downloaded builds.

### Updater signing

Required GitHub secrets:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `UPDATER_PUBLIC_KEY`

Updater signing protects update metadata, but it does **not** replace Windows/macOS trust signing.

## Release policy

- `scripts/check-release-secrets.mjs` enforces platform-specific signing secrets in CI.
- `.github/workflows/release.yml` imports macOS and Windows signing material only on their respective runners.
- If the required trust secrets are missing, the public release workflow should fail before publishing artifacts.

## Test builds vs public builds

- `docs/TEST_INSTALLER_BUILD.md` is for unsigned or limited-trust QA artifacts.
- Public GitHub releases should be created only from the signing-enabled release workflow.
