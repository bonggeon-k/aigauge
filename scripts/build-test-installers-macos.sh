#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[1/4] Installing dependencies..."
pnpm install --frozen-lockfile

echo "[2/4] Building macOS installers (DMG + APP)..."
pnpm tauri build --bundles dmg,app

bundle_root="src-tauri/target/release/bundle"
output_root="artifacts/macos-test"
mkdir -p "$output_root"

echo "[3/4] Collecting installers..."
found=0

while IFS= read -r -d '' dmg; do
  cp "$dmg" "$output_root/"
  found=1
done < <(find "$bundle_root" -type f -name "*.dmg" -print0)

while IFS= read -r -d '' appdir; do
  rsync -a "$appdir" "$output_root/"
  found=1
done < <(find "$bundle_root" -type d -name "*.app" -print0)

if [[ "$found" -eq 0 ]]; then
  echo "No macOS installer artifacts found under $bundle_root" >&2
  exit 1
fi

archive_path="$output_root/AIGauge-macos-test.tar.gz"
tar -czf "$archive_path" -C "$output_root" .

echo "[4/4] Done."
echo "Artifacts: $output_root"
echo "Archive: $archive_path"
