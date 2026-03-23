# GitHub Release Body Template

Use this template for public GitHub releases.

---

## AIGauge {{version}}

AIGauge is a desktop FinOps dashboard for AI coding tools. It helps you monitor usage, quota, and cost across providers such as Codex, Claude, Gemini, Copilot, Cursor, Kiro, and JetBrains AI.

This project is currently developed primarily as a **Windows-first desktop app**. macOS artifacts may be available, but Windows is the main target environment at this stage.

### What’s included in this release

- Cross-platform desktop build for the release targets published in this page
- Main dashboard + tray quick view
- Usage, quota, and cost visibility across supported providers
- Export support for CSV / JSON
- Setup flow for connecting supported providers

### Before you install

- Download the installer or archive that matches your operating system.
- If you are upgrading from an older build, close AIGauge before installing.
- Public releases are intended to be signed production builds.
- Windows is the primary target platform for this release line.
- macOS builds may be published before full hands-on device validation is complete. If you are installing on macOS, please treat the first public builds as lightly tested and report issues.

### Notes for testers

If you are using a pre-release or QA build instead of a signed public release:

- Windows may show a SmartScreen warning.
- macOS may require right-clicking the app and choosing **Open** on first launch.
- Detailed tester instructions: `docs/TEST_BUILD_INSTALL.md`

### Known limitations

- Provider availability can depend on your local CLI login state or local credential setup.
- Some providers expose different levels of usage, quota, or cost detail.
- Community plugins depend on their own endpoint behavior and quality.
- Windows is the primary supported target today.
- macOS compatibility may still need additional real-device verification on the maintainer side.

### Verification

- Built from repository tag: `{{tag}}`
- Commit: `{{commit}}`
- Provenance guide: `docs/PROVENANCE.md`

### Feedback

- Bug reports: GitHub Issues
- Security reports: see `docs/SECURITY.md`

---

## Short Version

Use this shorter version when you want a compact release body.

### AIGauge {{version}}

Signed production release of AIGauge, a desktop usage/quota/cost dashboard for AI coding tools.

This project is currently Windows-first. macOS artifacts may be available, but Windows is the main target platform right now.

Included in this release:

- Dashboard + tray quick view
- Multi-provider usage and quota monitoring
- Cost analytics and export support

Before installing:

- Download the artifact for your OS
- Close older AIGauge builds before upgrading
- See `docs/PROVENANCE.md` for verification details
- Windows is the primary target platform for this release
- macOS builds may still need broader real-device validation

Support:

- Issues: GitHub Issues
- Security: `docs/SECURITY.md`
