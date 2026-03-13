$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "[1/4] Installing dependencies..."
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed with exit code $LASTEXITCODE" }

Write-Host "[2/4] Building Windows installers (MSI + NSIS EXE)..."
pnpm tauri build --bundles msi --bundles nsis
if ($LASTEXITCODE -ne 0) { throw "tauri build failed with exit code $LASTEXITCODE" }

$bundleRoot = Join-Path (Get-Location) "src-tauri\target\release\bundle"
$outputRoot = Join-Path (Get-Location) "artifacts\windows-test"
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

Write-Host "[3/4] Collecting installers..."
$artifacts = Get-ChildItem -Path $bundleRoot -Recurse -File |
  Where-Object { $_.Extension -in @(".msi", ".exe") }

if (-not $artifacts) {
  throw "No Windows installer artifacts found under $bundleRoot"
}

foreach ($artifact in $artifacts) {
  Copy-Item -Path $artifact.FullName -Destination $outputRoot -Force
}

$zipPath = Join-Path $outputRoot "AIGauge-windows-test.zip"
if (Test-Path $zipPath) {
  Remove-Item -Path $zipPath -Force
}
Compress-Archive -Path (Join-Path $outputRoot "*") -DestinationPath $zipPath -Force

Write-Host "[4/4] Done."
Write-Host "Artifacts: $outputRoot"
Write-Host "Zip: $zipPath"
