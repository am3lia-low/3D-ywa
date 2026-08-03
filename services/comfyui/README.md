# Local ComfyUI reference-image provider

This stage turns Part 1's asset-generation prompt into the clean isolated image
consumed by TripoSR. It uses only ComfyUI core nodes and the full SDXL 1.0 base
checkpoint; no API key or paid service is required. The slower base profile was
selected after the four-step Lightning profile repeatedly failed single-object
and unlit-condition review gates.

```powershell
.\scripts\setup-comfyui.ps1
.\scripts\run-comfyui.ps1
# in another terminal
.\scripts\prove-comfyui.ps1
```

The install is pinned to ComfyUI commit
`b53e247c94f9225dc206bcfef5d64a2f7bc85232`. The setup script verifies the
checkpoint against SHA256
`31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b`.
Large dependencies and the 6.94 GB checkpoint stay under ignored `.local/`.
If the same verified checkpoint already exists in a conventional portable
ComfyUI install, setup reuses it through ComfyUI's `extra_model_paths.yaml`
instead of downloading a duplicate. Set `STORYWORLD_SDXL_CHECKPOINT` to select
another existing copy.
The project service uses port `8190` to avoid colliding with a conventional
ComfyUI installation on `8188`.

ComfyUI is GPL-3.0 and SDXL 1.0 is OpenRAIL++. Review those licenses for
the final deployment and distribution model. The local server disables paid API
nodes and binds to `127.0.0.1`.

On a 12 GB GPU, run ComfyUI and TripoSR sequentially rather than keeping both
models resident. This avoids VRAM contention while preserving the provider
interfaces used by `runSceneAssetWorker`.
