# Installing Test Builds

This guide is for **unsigned or limited-trust QA builds** shared before a fully signed public release.

If you are a tester, the warning does **not** automatically mean the app is malicious.
It usually means the build is not signed with a commercial Windows certificate or Apple Developer ID yet.

Current status note:

- AIGauge is currently developed primarily as a **Windows-first** app.
- Windows test flow has been exercised more directly.
- The maintainer has directly exercised Codex and Kiro more than other providers.
- Claude, Gemini, Copilot, Cursor, and JetBrains setup paths exist, but not every real paid-account, local-environment, or long-running scenario has been hands-on validated yet.
- macOS builds may still be insufficiently tested on real hardware, so installation or runtime issues are still possible.

## Windows

When Windows shows a SmartScreen warning:

1. Double-click the installer.
2. If you see **"Windows protected your PC"**, click **More info**.
3. Confirm the app name is **AIGauge**.
4. Click **Run anyway**.
5. Continue the installer normally.

If your company-managed PC blocks this completely:

- Ask the maintainer for a signed public release.
- Or ask your IT admin whether unsigned test builds are allowed.

## macOS

When macOS blocks the app because it is from an unidentified developer:

### Recommended method

1. Open **Finder**.
2. Locate the `AIGauge.app` file.
3. Control-click or right-click the app.
4. Choose **Open**.
5. In the confirmation dialog, click **Open** again.

### If the Open button does not appear

1. Try opening the app once.
2. Open **System Settings**.
3. Go to **Privacy & Security**.
4. Scroll to the security section near the bottom.
5. Look for a message saying the app was blocked.
6. Click **Open Anyway**.
7. Return to the app and open it again.

## Important note for testers

- These steps are meant only for **test builds provided directly by the project maintainer**.
- Do not bypass OS warnings for random files from unknown sources.

## For public releases

Public end-user releases should use:

- Windows Authenticode signing
- macOS Developer ID signing and notarization

See [docs/PUBLIC_RELEASE_SIGNING.md](PUBLIC_RELEASE_SIGNING.md).
