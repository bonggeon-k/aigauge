# Agent Workstreams

This document defines the execution model for building AIGauge as a high-end cross-platform desktop app.

## Objective

- Keep UX quality high across Windows, Linux, and macOS.
- Prevent architectural drift between frontend, backend, and release pipelines.
- Make handoffs explicit so workstreams can run in parallel without breaking contracts.

## Workstream Topology

### A1. Product and UX Systems

- Owns:
  - Information architecture, screen hierarchy, interaction model.
  - OS-specific UX rules (titlebar behavior, shortcut copy, tray behavior, dialogs).
- Delivers:
  - UX specs, acceptance criteria, component behavior states.
- Exit criteria:
  - Every state is specified: loading, empty, error, offline, not configured.

### A2. Frontend Platform

- Owns:
  - React views, routing, accessibility, responsive behavior.
  - Tauri frontend integration: window events, tray popup behavior, navigation.
- Delivers:
  - Typed hooks, reusable UI primitives, platform-aware shell behavior.
- Exit criteria:
  - `pnpm lint` and `pnpm build` pass.
  - Accessibility checks pass for keyboard flow and screen reader labels.

### A3. Backend Platform and Providers

- Owns:
  - Provider runtime, data normalization, caching, polling, IPC command contracts.
  - Cross-platform path/process resolution.
- Delivers:
  - Stable IPC schema and event schema.
  - Provider adapters with deterministic status fallback behavior.
- Exit criteria:
  - `cargo clippy --all-targets -- -D warnings` and `cargo test` pass.
  - Provider outputs conform to a normalized model.

### A4. Security and Compliance

- Owns:
  - Capabilities, CSP, isolation boundaries, credential handling, log hygiene.
  - Threat model maintenance and security regression checks.
- Delivers:
  - Capability diffs per feature.
  - Security check report for each release candidate.
- Exit criteria:
  - No credential path bypasses `CredentialManager`.
  - No sensitive values emitted in logs or exports.

### A5. Build and Release Engineering

- Owns:
  - CI matrix, release workflow, signing/updater readiness, artifact quality.
  - Version alignment across `package.json`, `Cargo.toml`, `tauri.conf.json`.
- Delivers:
  - Reproducible build pipeline for Windows/Linux/macOS.
  - Release runbook and rollback instructions.
- Exit criteria:
  - CI green on all target OS runners.
  - Release workflow creates valid artifacts and metadata.

### A6. QA and Performance

- Owns:
  - End-to-end behavior checks, performance regression baseline, memory behavior.
  - Platform parity validation for tray, popup, notifications, shortcuts.
- Delivers:
  - Test matrix report and perf snapshots.
- Exit criteria:
  - No P0/P1 regressions.
  - Cold start, refresh latency, and memory budgets are within limits.

## Interface Contracts (Hard Boundaries)

### Contract 1: IPC Schema

- Backend may add fields but cannot rename/remove existing fields without a versioned migration plan.
- Frontend hooks are the only place that can call `invoke`.

### Contract 2: Event Schema

- Event names are stable IDs and treated as public API:
  - `usage-updated`
  - `quota-warning`
  - `quota-critical`
  - `tray-refresh`

### Contract 3: Config Schema

- Config changes require:
  - default value,
  - migration-safe loader behavior,
  - backward compatibility test.

## Parallel Delivery Pattern

1. A1 publishes acceptance criteria for a feature slice.
2. A3 defines/locks IPC and event schema.
3. A2 implements UI with mocked contracts in parallel.
4. A4 validates capability and security changes.
5. A6 runs parity and regression checks.
6. A5 merges to release branch only after all gates are green.

## Definition of Done

- Functional:
  - Feature works on all supported OS targets.
- Quality:
  - Rust + TypeScript checks pass.
- UX:
  - No unresolved loading/error/empty state.
- Security:
  - Capability and credential rules remain compliant.
- Release:
  - CI and release workflows pass with current version.
