[CmdletBinding()]
param(
  [int]$Port = 8123,
  [int]$MeshResolution = 192,
  [string]$EntityId = "lantern-1",
  [string]$ImagePath = "fixtures\reference-images\comfyui-lantern-1-v1.png",
  [string]$ReferenceArtifactId = "approved:comfyui-lantern-1-v1"
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resolvedImagePath = (Resolve-Path (Join-Path $projectRoot $ImagePath)).Path
$bytes = [System.IO.File]::ReadAllBytes($resolvedImagePath)
$body = @{
  entityId = $EntityId
  image = @{
    mimeType = "image/png"
    base64 = [Convert]::ToBase64String($bytes)
  }
  meshResolution = $MeshResolution
  referenceArtifactId = $ReferenceArtifactId
} | ConvertTo-Json -Depth 4 -Compress

Invoke-RestMethod `
  -Uri "http://127.0.0.1:$Port/v1/reconstruct" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
