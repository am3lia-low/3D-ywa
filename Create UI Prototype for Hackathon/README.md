# Lorescape — Persistent 3D Story World Prototype

A frontend prototype for a hackathon project that turns a book, chapter by chapter, into an explorable, persistent 3D world. Read a chapter, watch the scene process in the background, then step into the 3D world it built.

This is a **frontend-only mock**: there's no real backend or 3D renderer yet. `src/api/mockApi.ts` and `src/components/WorldViewer.tsx` stand in for those and are built to match the intended integration contracts, so they can be swapped for the real implementations later without touching the rest of the app.

## Prerequisites

- **Node 22** (pinned in `.mise.toml`). Vite 8 will crash on startup with an older Node (`node:util` missing `styleText`) — check with `node --version` before running anything.
- **pnpm 10** (there's a `pnpm-lock.yaml`). npm works as a fallback with `--legacy-peer-deps`, but you'll get a separate `package-lock.json` that shouldn't be committed alongside the pnpm lockfile.

If you use [mise](https://mise.jdx.dev/), it'll pick up the pinned toolchain automatically:

```bash
mise install
```

## Run it

```bash
pnpm install
pnpm dev
```

Then open the URL Vite prints (typically `http://localhost:5173`).

Without `mise`, make sure `node --version` reports `v22.x` before running the above — otherwise switch to it first via nvm/fnm/Volta or a manual Node 22 install.

## npm fallback (no pnpm/mise available)

This is the path actually verified while building this prototype, on a machine without `pnpm` or `mise` installed:

```bash
node --version          # must report v22.x — see Prerequisites above
npm install --legacy-peer-deps
npm run dev
```

`--legacy-peer-deps` is needed because of a `@types/react` / `@types/react-dom` peer-version mismatch in this dependency set. This generates its own `package-lock.json`, which duplicates `pnpm-lock.yaml` — don't commit it; delete it (or add it to `.gitignore`) once you're done if you were only using npm temporarily.

If `node --version` reports below `v22`, `npm run dev` will crash with a `node:util` / `styleText` error — install/switch to Node 22 first via nvm, fnm, Volta, or a direct download from [nodejs.org](https://nodejs.org).

## Other scripts

```bash
pnpm build     # production build
pnpm preview   # preview a production build locally
pnpm format    # format source with oxfmt
```

## Project structure

```
src/
  App.tsx               # screens (Library, Reader, Explorer) and app-level state
  types.ts              # shared data model (Book, Chapter, ProcessingStage, Conflict, ...)
  api/mockApi.ts         # mock backend adapter — one function per intended REST endpoint
  components/WorldViewer.tsx  # mock 3D viewer, built to the intended viewer prop contract
  data/mockData.ts       # book/chapter text, scene entities, conflicts
```

The design brief this prototype follows is at `src/imports/pasted_text/ui-ux-design-brief.md`.
