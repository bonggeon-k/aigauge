# Test Installer Build Guide (Windows + macOS)

Use this guide to create unsigned test installers for external QA before public GitHub release.

## 1) Windows (MSI + EXE)

Run in PowerShell (Windows native checkout path):

```powershell
cd C:\Dev\aigauge
powershell -ExecutionPolicy Bypass -File .\scripts\build-test-installers-windows.ps1
```

Output:

- `artifacts\windows-test\*.msi`
- `artifacts\windows-test\*.exe`
- `artifacts\windows-test\AIGauge-windows-test.zip`

## 2) macOS (DMG + APP)

Run in Terminal on a real macOS machine:

```bash
cd ~/Dev/aigauge
./scripts/build-test-installers-macos.sh
```

Output:

- `artifacts/macos-test/*.dmg`
- `artifacts/macos-test/*.app`
- `artifacts/macos-test/AIGauge-macos-test.tar.gz`

## 3) Distribution Note for Testers

These are unsigned development builds:

- Windows: SmartScreen warning may appear. Choose `More info` -> `Run anyway`.
- macOS: Gatekeeper may block first run. Open via Finder context menu -> `Open`.

Optional (Windows internal QA only): self-sign test installers with a temporary cert.

```powershell
cd C:\Dev\aigauge
powershell -ExecutionPolicy Bypass -File .\scripts\windows-selfsign-and-sign.ps1
```

Details: `docs/WINDOWS_FREE_SIGNING.md`

## 4) Pre-share Sanity Check

Before sharing artifacts:

```bash
pnpm release:check
pnpm release:oss-check
```
