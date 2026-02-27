# Platform Delivery Playbook

This playbook translates product requirements into platform-specific implementation and release gates.

## Design Principles

- Native-feeling behavior first, visual parity second.
- Shared domain model and IPC contracts across all OSes.
- Platform adapters for shell behavior, not business logic.
- Deterministic fallback paths for provider data and connectivity failures.

## Platform UX Matrix

| Area | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Titlebar controls | Right-aligned custom controls | Native traffic-light style (or hidden title with native semantics) | WM-friendly controls, avoid hard assumptions |
| Drag region | Explicit `data-tauri-drag-region` | Same, but do not block traffic-light interactions | Same, tested on X11 + Wayland |
| Shortcut display | `Ctrl+Shift+...` | `Cmd+Shift+...` copy in UI | `Ctrl+Shift+...` |
| Tray click behavior | Left click toggles popup, right click menu | Same behavior with native menu expectations | Same behavior, validate appindicator support |
| Notifications | Native toast via plugin | Native notification center | Desktop notifications by environment |
| Font and spacing tuning | Segoe-focused rhythm | San Francisco rhythm | Noto/Ubuntu-compatible rhythm |

## Backend Portability Matrix

| Area | Requirement |
| --- | --- |
| Home directory resolution | Unified resolver with ordered fallbacks per OS |
| Provider credential source | All secrets through `CredentialManager`; file-based OAuth tokens are read-only inputs |
| External command execution | OS strategy adapter (`direct`, `wsl`, or unavailable) with clear status mapping |
| HTTP client | Shared `reqwest::Client` with global timeout and pool reuse |
| Caching | TTL + bounded history; no unbounded vectors |
| Error normalization | Provider-specific errors mapped into stable status values |

## Release Process Gates

### G0: Architecture Gate

- IPC/event/config schema diff reviewed.
- Platform matrix impact explicitly called out.
- Security capability impact reviewed.

### G1: Implementation Gate

- Unit tests and integration tests updated.
- All commands instrumented with tracing without sensitive content.
- Frontend includes loading/error/empty states for new UX paths.

### G2: Platform Parity Gate

- Windows, Linux, macOS CI jobs pass.
- Tray popup behavior verified on each OS target.
- Keyboard navigation and accessibility checks pass.

### G3: Release Candidate Gate

- Version alignment check:
  - `package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
- Update and release metadata verified.
- Security checklist reviewed.

### G4: Production Release Gate

- Artifacts generated and validated per OS.
- Release notes and rollback note published.
- Post-release smoke test completed.

## Operational Cadence

- Daily: workstream standup with blockers by gate.
- Per merge: run full local validation set.
- Per release candidate: freeze IPC schema and run platform parity checklist.

## Required Validation Commands

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm lint
pnpm build
```

## Risk Register (Track Continuously)

- Platform-specific tray regressions.
- Provider auth token format drift.
- Capability drift from new IPC commands.
- Bundle size creep and startup performance regressions.
