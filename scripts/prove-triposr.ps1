[CmdletBinding()]
param(
  [int]$Port = 8123,
  [int]$MeshResolution = 192
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$imagePath = Join-Path $projectRoot "fixtures\reference-images\antique-brass-lantern-v1.png"
$bytes = [System.IO.File]::ReadAllBytes($imagePath)
$body = @{
  entityId = "lantern-1"
  image = @{
    mimeType = "image/png"
    base64 = [Convert]::ToBase64String($bytes)
  }
  meshResolution = $MeshResolution
  referenceArtifactId = "fixture:antique-brass-lantern-v1"
} | ConvertTo-Json -Depth 4 -Compress

Invoke-RestMethod `
  -Uri "http://127.0.0.1:$Port/v1/reconstruct" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
