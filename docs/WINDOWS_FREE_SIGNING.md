# Windows Free Signing (Internal QA)

This project can be signed for **internal testing** without buying a certificate by using a self-signed cert.

## What this does

- Signs `.exe` / `.msi` installers so tamper detection works in test environments.
- Helps internal traceability.

## What this does NOT do

- Does **not** build SmartScreen reputation.
- Does **not** remove Microsoft Defender / M365 warnings on external machines by itself.

## Usage

Run after building Windows test installers:

```powershell
cd C:\Dev\aigauge
powershell -ExecutionPolicy Bypass -File .\scripts\windows-selfsign-and-sign.ps1
```

Optional PFX export:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-selfsign-and-sign.ps1 `
  -PfxPassword "change-me"
```

## Public release recommendation

For public installer distribution, use OV/EV Authenticode signing.
Self-signed certs are only recommended for private/internal QA circulation.
