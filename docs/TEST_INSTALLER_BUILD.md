# Test Installer Build Guide (Windows + macOS)

Use this guide to create unsigned test installers for limited QA before the signed public GitHub release.

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

Do **not** treat these artifacts as public release candidates for general distribution.
For public releases intended for normal end users, use the signed release workflow described in [docs/PUBLIC_RELEASE_SIGNING.md](PUBLIC_RELEASE_SIGNING.md).

For a tester-friendly install guide, share [docs/TEST_BUILD_INSTALL.md](TEST_BUILD_INSTALL.md) together with the artifact.

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
