Param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

function Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

Step "AIGauge Windows native smoke test"

if (-not $SkipInstall) {
  Step "Installing JS dependencies"
  pnpm install
}

Step "Running provider environment doctor"
pnpm doctor:providers

Step "Running frontend lint/build"
pnpm lint
pnpm build

Step "Running Rust checks/tests"
Push-Location src-tauri
cargo clippy --all-targets -- -D warnings
cargo test
Pop-Location

Step "Launching native Tauri dev app"
Write-Host "Close the app window or press Ctrl+C to stop." -ForegroundColor Yellow
pnpm tauri dev
