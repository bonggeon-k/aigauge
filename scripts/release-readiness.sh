#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/8] Git status"
git status --short

echo "[2/8] Provider env doctor"
pnpm doctor:providers

echo "[3/8] Rust clippy"
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings

echo "[4/8] Rust tests"
cargo test --manifest-path src-tauri/Cargo.toml

echo "[5/8] Frontend lint"
pnpm lint

echo "[6/8] Frontend build"
pnpm build

echo "[7/8] Cargo audit"
(cd src-tauri && cargo audit)

echo "[8/8] pnpm audit"
pnpm audit --audit-level=high

if command -v gitleaks >/dev/null 2>&1; then
  echo "[extra] gitleaks secret scan"
  gitleaks detect --source . --no-git --redact
else
  echo "[extra] gitleaks not installed (skip)"
fi

echo
echo "Release readiness checks completed."
echo "For public release also verify:"
echo "- docs/OPEN_SOURCE_RELEASE_CHECKLIST.md"
echo "- docs/PROVENANCE.md"
echo "- THIRD_PARTY_NOTICES.md"
