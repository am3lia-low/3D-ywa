[CmdletBinding()]
param(
  [string]$SharedCheckpointPath = $env:STORYWORLD_SDXL_CHECKPOINT,
  [switch]$SkipDependencies
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$localRoot = Join-Path $projectRoot ".local"
$comfyRepo = Join-Path $localRoot "ComfyUI"
$venvRoot = Join-Path $localRoot "comfyui-venv"
$python311 = if ($env:STORYWORLD_PYTHON311) {
  $env:STORYWORLD_PYTHON311
} else {
  Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"
}
$comfyCommit = "b53e247c94f9225dc206bcfef5d64a2f7bc85232"
$checkpointName = "sd_xl_base_1.0.safetensors"
$checkpointHash = "31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b"
$checkpointUrl = "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors?download=true"

function Invoke-Checked {
  & $args[0] $args[1..($args.Count - 1)]
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $($args -join ' ')"
  }
}

if (-not (Test-Path -LiteralPath $python311)) {
  throw "Python 3.11 was not found at $python311"
}
New-Item -ItemType Directory -Force -Path $localRoot | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $comfyRepo "main.py"))) {
  Invoke-Checked git clone https://github.com/Comfy-Org/ComfyUI.git $comfyRepo
}
$safeRepo = $comfyRepo.Replace("\", "/")
Invoke-Checked git -c "safe.directory=$safeRepo" -C $comfyRepo checkout $comfyCommit

if (-not (Test-Path -LiteralPath (Join-Path $venvRoot "Scripts\python.exe"))) {
  Invoke-Checked $python311 -m venv $venvRoot
}
$venvPython = Join-Path $venvRoot "Scripts\python.exe"
if (-not $SkipDependencies) {
  Invoke-Checked $venvPython -m pip install --upgrade pip setuptools wheel
  Invoke-Checked $venvPython -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126
  Invoke-Checked $venvPython -m pip install -r (Join-Path $comfyRepo "requirements.txt")
}

$checkpointDir = Join-Path $comfyRepo "models\checkpoints"
$checkpointPath = Join-Path $checkpointDir $checkpointName
$partialPath = "$checkpointPath.partial"
New-Item -ItemType Directory -Force -Path $checkpointDir | Out-Null
if (-not $SharedCheckpointPath) {
  $userProfile = [Environment]::GetFolderPath("UserProfile")
  if (-not $userProfile) { $userProfile = $env:USERPROFILE }
  $knownCheckpoint = Join-Path $userProfile "ComfyUI_setup\ComfyUI_windows_portable\ComfyUI\models\checkpoints\$checkpointName"
  if (Test-Path -LiteralPath $knownCheckpoint) {
    $SharedCheckpointPath = $knownCheckpoint
  }
}

if ($SharedCheckpointPath) {
  $resolvedSharedCheckpoint = (Resolve-Path -LiteralPath $SharedCheckpointPath).Path
  if ([System.IO.Path]::GetFileName($resolvedSharedCheckpoint) -ne $checkpointName) {
    throw "Shared checkpoint must be named $checkpointName."
  }
  $actualHash = (Get-FileHash -LiteralPath $resolvedSharedCheckpoint -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $checkpointHash) {
    throw "Shared checkpoint has SHA256 $actualHash; expected $checkpointHash."
  }
  $sharedComfyRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $resolvedSharedCheckpoint))
  $yamlRoot = $sharedComfyRoot.Replace("\", "/").Replace("'", "''")
  $extraModels = @"
storyworld_shared:
  base_path: '$yamlRoot'
  checkpoints: models/checkpoints/
"@
  [System.IO.File]::WriteAllText((Join-Path $comfyRepo "extra_model_paths.yaml"), $extraModels)
  Write-Output "using shared checkpoint $resolvedSharedCheckpoint"
} elseif (Test-Path -LiteralPath $checkpointPath) {
  $actualHash = (Get-FileHash -LiteralPath $checkpointPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $checkpointHash) {
    throw "Existing checkpoint has SHA256 $actualHash; expected $checkpointHash."
  }
} else {
  Invoke-Checked curl.exe -L --fail --retry 3 --continue-at - --output $partialPath $checkpointUrl
  $actualHash = (Get-FileHash -LiteralPath $partialPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $checkpointHash) {
    throw "Downloaded checkpoint has SHA256 $actualHash; expected $checkpointHash."
  }
  Move-Item -LiteralPath $partialPath -Destination $checkpointPath
}

Invoke-Checked $venvPython -c "import torch; print('torch', torch.__version__, 'cuda', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')"
Write-Output "checkpoint $checkpointName sha256 $checkpointHash"
