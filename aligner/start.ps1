# Starts the auto-timing service. Keep this window open while you work on the site.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
# Local settings and the service account (ALIGNER_EMAIL / ALIGNER_PASSWORD): aligner\.env,
# one NAME=value per line. The file is git-ignored; see .env.example and README.md.
if (Test-Path '.env') {
  foreach ($line in Get-Content '.env') {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
      Set-Item "env:$($Matches[1])" $Matches[2].Trim('"')
    }
  }
}
if (-not (Test-Path 'target\release\aligner.exe')) { & .\build.ps1 }
$modelFile = 'models\ggml-small.bin'
$expectedSha256 = '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b'
if (-not (Test-Path $modelFile)) {
  New-Item -ItemType Directory -Force models | Out-Null
  $tmpFile = "$modelFile.part"
  Write-Host 'Downloading the Whisper small model (~470 MB)...'
  Invoke-WebRequest 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin' -OutFile $tmpFile
  $actualHash = (Get-FileHash -Path $tmpFile -Algorithm SHA256).Hash.ToLowerInvariant()
  $checkHash = if ($env:WHISPER_MODEL_SHA256) { $env:WHISPER_MODEL_SHA256.ToLowerInvariant() } else { $expectedSha256 }
  if ($checkHash -ne 'skip' -and $actualHash -ne $checkHash) {
    Remove-Item -Force $tmpFile -ErrorAction SilentlyContinue
    throw "SHA-256 mismatch for ggml-small.bin: got $actualHash, expected $checkHash"
  }
  Move-Item -Force $tmpFile $modelFile
}
.\target\release\aligner.exe
