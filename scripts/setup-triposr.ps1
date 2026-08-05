[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$localRoot = Join-Path $projectRoot ".local"
$tripoRepo = Join-Path $localRoot "TripoSR"
$venvRoot = Join-Path $localRoot "triposr-venv"
$python311 = "C:\Users\wl\AppData\Local\Programs\Python\Python311\python.exe"

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
if (-not (Test-Path -LiteralPath (Join-Path $tripoRepo "run.py"))) {
  Invoke-Checked git clone --depth 1 https://github.com/VAST-AI-Research/TripoSR.git $tripoRepo
}
if (-not (Test-Path -LiteralPath (Join-Path $venvRoot "Scripts\python.exe"))) {
  Invoke-Checked $python311 -m venv $venvRoot
}

$venvPython = Join-Path $venvRoot "Scripts\python.exe"
Invoke-Checked $venvPython -m pip install --upgrade pip setuptools wheel
Invoke-Checked $venvPython -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
Invoke-Checked $venvPython -m pip install "numpy<2" omegaconf==2.3.0 Pillow==10.1.0 einops==0.7.0 transformers==4.35.0 trimesh==4.0.5 rembg==2.0.60 onnxruntime huggingface-hub xatlas==0.0.9

Invoke-Checked $venvPython -c "import torch; print('torch', torch.__version__, 'cuda', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')"
