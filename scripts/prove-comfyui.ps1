[CmdletBinding()]
param(
  [int]$Port = 8190,
  [string]$EntityId = "lantern-1",
  [string]$PlanPath = "fixtures\visual_scene_plan_3.json",
  [string]$OutputPath = "fixtures\reference-images\comfyui-lantern-1-v1.png",
  [int]$TimeoutSeconds = 300,
  [string]$CheckpointName = "sd_xl_base_1.0.safetensors",
  [int]$Steps = 24,
  [double]$Cfg = 6.5,
  [string]$SamplerName = "dpmpp_2m",
  [string]$Scheduler = "karras",
  [uint32]$SeedOffset = 0
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resolvedPlan = (Resolve-Path (Join-Path $projectRoot $PlanPath)).Path
$plan = Get-Content -LiteralPath $resolvedPlan -Raw | ConvertFrom-Json
$visual = $plan.entities | Where-Object entityId -eq $EntityId | Select-Object -First 1
if (-not $visual) { throw "Visual plan does not contain canonical entity '$EntityId'." }

$basePrompt = if ($visual.assetGenerationPrompt) {
  $visual.assetGenerationPrompt
} else {
  "$($visual.visualDescription). $($visual.materials -join ', '). $($visual.colors -join ', '). Condition: $($visual.condition)."
}
$conditionGuard = if ($basePrompt -match '\bunlit\b') {
  "empty dark chamber with no light source installed, strictly unlit"
} else { $null }
$positive = @(
  "A single standalone object, exactly one object in the image",
  $conditionGuard,
  $basePrompt.Trim(),
  "centered front three-quarter view, entire object visible with empty space around it",
  "plain light gray seamless background, realistic materials, coherent proportions"
) | Where-Object { $_ }
$positive = $positive -join ", "
$negative = "contact sheet, catalog sheet, grid, collage, collection, lineup, repeating pattern, multiple objects, object parts, room, environment, floor, pedestal, cast shadow, cropped, cut off, person, hand, text, label, watermark, low detail, deformed, duplicate"
if ($conditionGuard) {
  $negative += ", flame, candle, light bulb, glowing, lit interior"
}

$seedText = "$EntityId`n$basePrompt"
$hasher = [System.Security.Cryptography.SHA256]::Create()
try {
  $sha = $hasher.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($seedText))
} finally {
  $hasher.Dispose()
}
$seed = ([uint64][BitConverter]::ToUInt32($sha, 0) + [uint64]$SeedOffset) % 4294967296
$prefix = $EntityId -replace '[^A-Za-z0-9._-]+', '-'
$workflow = @{
  "1" = @{ class_type = "CheckpointLoaderSimple"; inputs = @{ ckpt_name = $CheckpointName } }
  "2" = @{ class_type = "CLIPTextEncode"; inputs = @{ text = $positive; clip = @("1", 1) } }
  "3" = @{ class_type = "CLIPTextEncode"; inputs = @{ text = $negative; clip = @("1", 1) } }
  "4" = @{ class_type = "EmptyLatentImage"; inputs = @{ width = 1024; height = 1024; batch_size = 1 } }
  "5" = @{ class_type = "KSampler"; inputs = @{
    seed = $seed; steps = $Steps; cfg = $Cfg; sampler_name = $SamplerName; scheduler = $Scheduler; denoise = 1.0
    model = @("1", 0); positive = @("2", 0); negative = @("3", 0); latent_image = @("4", 0)
  } }
  "6" = @{ class_type = "VAEDecode"; inputs = @{ samples = @("5", 0); vae = @("1", 2) } }
  "7" = @{ class_type = "SaveImage"; inputs = @{ filename_prefix = "storyworld/$prefix"; images = @("6", 0) } }
}
$queueBody = @{ prompt = $workflow; client_id = "storyworld-$prefix-$seed" } | ConvertTo-Json -Depth 12 -Compress
$queued = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/prompt" -Method Post -ContentType "application/json" -Body $queueBody
if (-not $queued.prompt_id) { throw "ComfyUI did not return a prompt ID." }

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$image = $null
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 500
  $history = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/history/$($queued.prompt_id)"
  $entry = $history.PSObject.Properties[$queued.prompt_id].Value
  if (-not $entry) { continue }
  foreach ($output in $entry.outputs.PSObject.Properties.Value) {
    if ($output.images -and $output.images.Count -gt 0) { $image = $output.images[0]; break }
  }
  if ($image) { break }
  if ($entry.status.completed) { throw "ComfyUI completed without an image." }
}
if (-not $image) { throw "ComfyUI timed out after $TimeoutSeconds seconds." }

$absoluteOutput = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $OutputPath))
$allowedRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "fixtures\reference-images"))
if ([System.IO.Path]::GetDirectoryName($absoluteOutput) -ne $allowedRoot) {
  throw "Output must be directly inside fixtures\reference-images."
}
$query = "filename=$([Uri]::EscapeDataString($image.filename))&subfolder=$([Uri]::EscapeDataString($image.subfolder))&type=$([Uri]::EscapeDataString($image.type))"
Invoke-WebRequest -Uri "http://127.0.0.1:$Port/view?$query" -OutFile $absoluteOutput

[pscustomobject]@{
  entityId = $EntityId
  promptId = $queued.prompt_id
  referenceImage = $absoluteOutput
  sourcePrompt = $basePrompt
}
