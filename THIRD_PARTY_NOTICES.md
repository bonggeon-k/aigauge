# THIRD PARTY NOTICES

This project is distributed under the MIT License and includes third-party dependencies under their own licenses.

## Notable Dependency Licenses

Based on dependency inventory from `pnpm licenses` and `cargo license`.

### JavaScript / Node

- `@tauri-apps/api` — `Apache-2.0 OR MIT`
- `victory-vendor` — `MIT AND ISC`
- `tslib` — `0BSD`

### Rust

- ICU-related crates — `Unicode-3.0`
- `cssparser`, `selectors` family — `MPL-2.0`
- `webpki-roots`, `webpki-root-certs` — `CDLA-Permissive-2.0`
- `unicode-ident` — `(Apache-2.0 OR MIT) AND Unicode-3.0`
- Some transitive dependency sets may include `CC-BY-4.0` assets; validate per-release with the regeneration commands below.

## Trademark and Product Names

References to third-party products and services (for example CodexBar, ccusage, OpenAI, Anthropic, Google, GitHub, Cursor, JetBrains) are nominative and for compatibility/comparison context only.

All trademarks are the property of their respective owners. No affiliation or endorsement is implied.

## Provenance Note

The Cursor provider supports interoperability with the CodexBar session file format. This compatibility does not imply affiliation.

## How to Regenerate Dependency License Inventory

```bash
pnpm licenses list --prod --json > /tmp/aigauge-pnpm-licenses.json
cd src-tauri && cargo license --json > /tmp/aigauge-cargo-licenses.json
```

Review and update this file before each public release.
