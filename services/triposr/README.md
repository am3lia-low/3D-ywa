# Local TripoSR provider

This service is the real open-source image-to-3D adapter behind
`createTripoSrHttpProvider`. Its model environment and downloaded weights live
under ignored `.local/`; generated app assets are written to `public/generated/`.

On the current Windows/NVIDIA development machine:

```powershell
.\scripts\setup-triposr.ps1
.\scripts\run-triposr.ps1
```

In another terminal, run the checked-in proof input:

```powershell
.\scripts\prove-triposr.ps1
```

The production sequence is intentionally two-stage: a
`SceneReferenceImageProvider` converts Part 1's asset prompt into a clean image,
then TripoSR reconstructs that image. A static project image can be used for
approved hero art; a hosted or local text-to-image implementation can be
plugged in without changing the scene worker.

TripoSR source and pretrained weights are MIT licensed. The service only binds
to `127.0.0.1` by default and should be placed behind the application's backend
authentication if deployed remotely.

The current Windows machine has CUDA 12.4 but Visual Studio 2026, a combination
the CUDA compiler does not support for native extensions. The neural model still
runs on CUDA; `services/triposr/torchmcubes.py` provides the same marching-cubes
interface through scikit-image on CPU so setup remains reproducible.
