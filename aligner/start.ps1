# Starts the auto-timing service. Keep this window open while you work on the site.
Set-Location $PSScriptRoot
if (-not (Test-Path 'target\release\aligner.exe')) { & .\build.ps1 }
if (-not (Test-Path 'models\ggml-small.bin')) {
  New-Item -ItemType Directory -Force models | Out-Null
  Write-Host 'Downloading the Whisper small model (~470 MB)...'
  Invoke-WebRequest 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin' -OutFile 'models\ggml-small.bin'
}
.\target\release\aligner.exe
