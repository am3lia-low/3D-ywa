[CmdletBinding()]
param(
  [int]$Port = 8190
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$comfyRoot = Join-Path $projectRoot ".local\ComfyUI"
$venvPython = Join-Path $projectRoot ".local\comfyui-venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $venvPython)) {
  throw "ComfyUI is not installed. Run scripts\setup-comfyui.ps1 first."
}
& $venvPython (Join-Path $comfyRoot "main.py") `
  --listen 127.0.0.1 `
  --port $Port `
  --disable-auto-launch `
  --disable-api-nodes `
  --enable-cors-header http://127.0.0.1:5173 `
  --preview-method none
