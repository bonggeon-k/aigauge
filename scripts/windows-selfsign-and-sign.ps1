param(
  [string]$ArtifactDir = "artifacts\\windows-test",
  [string]$Subject = "CN=AIGauge Dev Test Signing",
  [string]$PfxPath = "artifacts\\windows-test\\aigauge-dev-test-signing.pfx",
  [string]$PfxPassword = ""
)

$ErrorActionPreference = "Stop"

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

Require-Command "New-SelfSignedCertificate"
Require-Command "Set-AuthenticodeSignature"

$resolvedArtifactDir = Resolve-Path -Path $ArtifactDir -ErrorAction Stop
$targets = Get-ChildItem -Path $resolvedArtifactDir -Recurse -Include *.exe,*.msi -File
if ($targets.Count -eq 0) {
  throw "No .exe or .msi files found in $resolvedArtifactDir"
}

Write-Host "Creating self-signed code-signing certificate in CurrentUser\\My..."
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject $Subject `
  -CertStoreLocation "Cert:\\CurrentUser\\My" `
  -KeyAlgorithm RSA `
  -KeyLength 3072 `
  -HashAlgorithm SHA256 `
  -NotAfter (Get-Date).AddYears(1)

if ($PfxPassword -ne "") {
  $secure = ConvertTo-SecureString -String $PfxPassword -AsPlainText -Force
  $pfxParent = Split-Path -Parent $PfxPath
  if ($pfxParent -and -not (Test-Path $pfxParent)) {
    New-Item -ItemType Directory -Path $pfxParent | Out-Null
  }
  Export-PfxCertificate -Cert $cert -FilePath $PfxPath -Password $secure | Out-Null
  Write-Host "Exported PFX: $PfxPath"
}

foreach ($file in $targets) {
  Write-Host "Signing $($file.FullName)"
  $result = Set-AuthenticodeSignature -FilePath $file.FullName -Certificate $cert -HashAlgorithm SHA256
  if ($result.Status -eq "Valid") {
    continue
  }
  if ($result.Status -eq "NotSigned") {
    throw "Signing failed for $($file.FullName): file remains unsigned."
  }
  Write-Warning "Signing result for $($file.FullName): Status=$($result.Status), Message=$($result.StatusMessage)"
}

Write-Host ""
Write-Host "Self-sign complete."
Write-Host "- Certificate Subject: $Subject"
Write-Host "- Signed files: $($targets.Count)"
Write-Host ""
Write-Host "Important:"
Write-Host "1) This is for internal/testing use."
Write-Host "2) SmartScreen/M365 reputation warnings may still appear on other machines."
Write-Host "3) For public distribution, use an OV/EV Authenticode certificate."
