# Generated runtime assets

The lantern was the first fully local text-to-image-to-3D proof.

- Canonical story entity: `lantern-1`
- Reference: `fixtures/reference-images/comfyui-lantern-1-v1.png`
- Reference provider: ComfyUI with SDXL 1.0 base (OpenRAIL++)
- Reconstruction attempt: TripoSR at mesh resolution 192
- Asset review: rejected because the in-world mesh was skeletal, too dark and
  lacked believable brass/glass materials
- Runtime decision: retain `/models/lantern.glb` until another reconstruction
  or curated asset passes post-reconstruction review
- Generated: 2026-08-03 on an NVIDIA GeForce RTX 4070 Super

The approved reference remains available for another reconstruction attempt;
the rejected GLB is deliberately not distributed as a runtime asset.

`hidden-door-1-v1.png` is the second reviewed pipeline proof and the first
template-routed asset.

- Canonical story entity: `hidden-door-1`
- Reference: `fixtures/reference-images/comfyui-hidden-door-1-v1.png`
- Review: approved seed 1; rejected seed 0 (double door) and seed 2 (modern hardware)
- Routing: generated surface projected onto controlled door geometry
- Rejected route: TripoSR produced a flattened, incorrectly colored mesh, so
  the generated GLB was not promoted
- Generated: 2026-08-03 on an NVIDIA GeForce RTX 4070 Super
