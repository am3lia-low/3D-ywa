# Integrated prototype quick start

This is the shortest supported path from a fresh clone to the combined Member 3
reader UI and Member 2 spatial runtime. The commands are run from the repository
root; teammates do not need to start two development servers.

## Prerequisites

- Node.js 22.x (`node --version`)
- pnpm 10.34 or newer (`pnpm --version`; pnpm 11 is also verified)
- Git LFS is not required. The approved web assets are ordinary repository files.

All models, textures, environment maps, safe meshes and external glTF
dependencies required by the prepared worlds are committed with the repository.
Teammates do not need to run an asset importer or download anything manually.
ComfyUI and TripoSR remain optional development tools, not runtime requirements.

If testing the work before it is merged, check out the shared integration branch:

```bash
git checkout wl
```

After the work is merged or cherry-picked, remain on the receiving branch.

## First-time setup

From the repository root:

```bash
pnpm setup:integrated
```

This installs both lockfile-pinned dependency trees: the spatial runtime at the
repository root and Member 3's product shell under
`Create UI Prototype for Hackathon/`.

## Start the combined application

```bash
pnpm dev:integrated
```

Open <http://127.0.0.1:8443/>. The page should identify itself as **Lorescape**
and show these prepared stories:

- The Ashwood Inheritance
- Meridian
- The Amber Archive

Choose **Start Reading**, allow the mock passage-processing stages to finish,
then choose **Explore the Scene**. The explorer is Member 3's UI; the fullscreen
React Three Fiber world, camera controls, selection, layout, environment kits and
assets come directly from Member 2 through the `@spatial-runtime` import alias.

The mock processing delay is intentional. It demonstrates the asynchronous
reader flow while Member 1's HTTP service is not connected. ComfyUI, TripoSR and
the Part 1 mock HTTP server are not required for this prepared-story demo.

## Run imported text through live Member 1

Prepared library stories keep their curated local fixtures. To send newly
imported or pasted text through Member 1, configure the reader and run the
Python API alongside it.

Create the UI environment file once:

```powershell
Copy-Item "Create UI Prototype for Hackathon/.env.example" "Create UI Prototype for Hackathon/.env.local"
```

Terminal 1 — start Member 1 on port 8000:

```powershell
& ".\.venv\Scripts\python.exe" -m uvicorn storyworld.api:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2 — start the Member 3 reader and Member 2 renderer:

```powershell
pnpm dev:integrated
```

Open <http://127.0.0.1:8443/>, select **Import Story**, paste text or upload a
`.txt` file, confirm the detected chapters, and open the imported book. Each new
chapter is posted to Member 1, validated against the shared contract, compiled
by Member 2, and warmed by Member 3 before **Explore** becomes available.

`VITE_STORYWORLD_API_URL` is intentionally opt-in. Without it, imported stories
use the UI's generic local fallback; prepared stories always keep their curated
fixtures. The team MVP still emits one persistent location per imported story,
which remains valid input to the updated multi-location renderer.

## Which development server to use

| Command | URL | Purpose |
| --- | --- | --- |
| `pnpm dev:integrated` | `http://127.0.0.1:8443/` | Combined Member 3 product UI and Member 2 world; use this for team review and demo work. |
| `pnpm dev` | `http://127.0.0.1:5173/` | Member 2 renderer laboratory and fixture selector; use this for spatial debugging. |

Do not run both unless you are deliberately comparing the product integration
with the renderer laboratory.

## Verify a branch or pull request

```bash
pnpm check:integrated
```

This compile-checks the public Member 3 consumer, preflights every built-in scene
moment, and builds the integrated product shell. Before merging or recording the
final demo, also run:

```bash
pnpm verify
```

`pnpm verify` includes `pnpm assets:runtime:check`. That portability gate scans
runtime source references, follows local `.gltf` buffer and image dependencies,
and fails if any required asset is missing, empty or not tracked by Git.

For a production build of only the combined UI:

```bash
pnpm build:integrated
```

The output is written to `Create UI Prototype for Hackathon/dist/`. Its Vite
configuration bundles the root runtime source and copies the root `public/`
asset tree, so the deployed build must be produced from the complete repository.

## Integration layout

```text
Create UI Prototype for Hackathon/src/App.tsx
  -> src/components/WorldViewer.tsx (Member 3 adapter)
  -> @spatial-runtime (alias to repository-root src/index.ts)
  -> Member 2 WorldViewer + scene compiler + asset registry
  -> repository-root public/ models, textures, environments and safe meshes
```

Member 2 changes belong in root `src/`, `public/`, `fixtures/` and the relevant
root documentation. Member 3 product changes belong under
`Create UI Prototype for Hackathon/`. Member 3 should keep importing the runtime
only through `@spatial-runtime` rather than copying renderer files into the UI
folder.

## Troubleshooting

- **`styleText` or Vite startup error:** Node is older than 22. Switch Node
  versions and rerun `pnpm setup:integrated`.
- **Port 8443 is already in use:** stop the older integrated Vite process, or set
  a temporary port in PowerShell with `$env:PORT=8444` before
  `pnpm dev:integrated`.
- **World is blank but the reader UI loads:** hard-refresh once, then inspect the
  browser console for a missing file under `/models`, `/textures`,
  `/environments` or `/safe-meshes`. Confirm the full root `public/` directory
  exists on the checked-out branch.
- **Dependencies disagree after switching branches:** delete neither lockfile.
  Run `pnpm setup:integrated` again so both projects match their committed locks.
- **Prepared chapter reports no scene:** use one of the three prepared stories.
  Arbitrary imported prose still needs the real Member 1 response to supply the
  canonical snapshot, patch and visual plan.

For contract ownership and production API replacement, continue with
[`team-integration-contract.md`](team-integration-contract.md) and
[`member-3-handoff.md`](member-3-handoff.md).
