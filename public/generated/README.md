# Generated runtime assets

`lantern-1-df16671b5965.glb` is the first fully local text-to-image-to-3D proof.

- Canonical story entity: `lantern-1`
- Reference: `fixtures/reference-images/comfyui-lantern-1-v1.png`
- Reference provider: ComfyUI with SDXL 1.0 base (OpenRAIL++)
- Reconstruction provider: official TripoSR source and weights (MIT)
- Mesh resolution: 192
- Format: glTF 2.0 binary with vertex colors
- Geometry: 31,084 vertices and 62,168 faces
- Generated: 2026-08-03 on an NVIDIA GeForce RTX 4070 Super

The content hash in the filename makes regeneration explicit and prevents a
visual-plan update from silently changing an already approved app asset.

`hidden-door-1-v1.png` is the second reviewed pipeline proof and the first
template-routed asset.

- Canonical story entity: `hidden-door-1`
- Reference: `fixtures/reference-images/comfyui-hidden-door-1-v1.png`
- Review: approved seed 1; rejected seed 0 (double door) and seed 2 (modern hardware)
- Routing: generated surface projected onto controlled door geometry
- Rejected route: TripoSR produced a flattened, incorrectly colored mesh, so
  the generated GLB was not promoted
- Generated: 2026-08-03 on an NVIDIA GeForce RTX 4070 Super
