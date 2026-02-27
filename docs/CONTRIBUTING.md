# CONTRIBUTING

## Development Setup (WSL2)

1. Install Node.js 22+, pnpm 10+, Rust stable toolchain.
2. Clone repository into WSL2 filesystem.
3. Install dependencies:
   - `pnpm install`
   - `cargo fetch --manifest-path src-tauri/Cargo.toml`
4. Run checks:
   - `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
   - `cargo test --manifest-path src-tauri/Cargo.toml`
   - `pnpm lint && pnpm build`

## Code Style

- Rust: `anyhow`/`thiserror`, no `unwrap`, use `tracing::instrument` on public functions.
- TypeScript: strict typing, no `any`, accessible interactive controls with `aria-label`.

## Add a New Provider

1. Create `src-tauri/src/providers/<provider>.rs` implementing `Provider` trait.
2. Register in `providers/mod.rs` and `commands.rs` `ProviderRegistry`.
3. Add config defaults for polling and enablement.
4. Add frontend provider mapping/icons in dashboard UI.
5. Add tests for provider shape and status behavior.

## Create a Plugin

1. Write TOML manifest under app data `plugins/`.
2. Include required fields: `id`, `name`, `version`, `author`, `description`, `auth_method`, `api_endpoint`.
3. Validate plugin appears in Settings > Plugins.

## Pull Request Checklist

- [ ] Clippy and tests pass
- [ ] Lint and build pass
- [ ] Capability permissions updated for new IPC
- [ ] Docs updated (`README`, `SECURITY`, plugin docs if applicable)
