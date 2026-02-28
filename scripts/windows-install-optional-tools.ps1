Param(
  [switch]$WhatIfOnly
)

$ErrorActionPreference = "Stop"

function Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function CommandExists($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

Step "Checking optional tools for AIGauge"

if (-not (CommandExists "winget")) {
  Write-Host "winget not found. Install App Installer from Microsoft Store first." -ForegroundColor Yellow
  exit 1
}

$targets = @(
  @{ Name = "gh"; WingetId = "GitHub.cli"; Label = "GitHub CLI" },
  @{ Name = "sqlite3"; WingetId = "SQLite.SQLite"; Label = "SQLite" }
)

foreach ($target in $targets) {
  if (CommandExists $target.Name) {
    Write-Host "[PASS] $($target.Label) already installed" -ForegroundColor Green
    continue
  }

  Write-Host "[WARN] $($target.Label) missing" -ForegroundColor Yellow
  if ($WhatIfOnly) {
    Write-Host "  would run: winget install --id $($target.WingetId) -e --accept-package-agreements --accept-source-agreements"
    continue
  }

  Step "Installing $($target.Label)"
  winget install --id $target.WingetId -e --accept-package-agreements --accept-source-agreements
}

Step "Done"
Write-Host "Re-run: pnpm doctor:providers" -ForegroundColor Green
