[CmdletBinding()]
param(
  [int]$Port = 8123
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$venvPython = Join-Path $projectRoot ".local\triposr-venv\Scripts\python.exe"
$tripoRepo = Join-Path $projectRoot ".local\TripoSR"
$outputDir = Join-Path $projectRoot "public\generated"

if (-not (Test-Path -LiteralPath $venvPython)) {
  throw "TripoSR is not installed. Run scripts\setup-triposr.ps1 first."
}
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
& $venvPython (Join-Path $projectRoot "services\triposr\server.py") `
  --port $Port `
  --triposr-repo $tripoRepo `
  --output-dir $outputDir `
  --public-url /generated
