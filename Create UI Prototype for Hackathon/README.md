# Lorescape — Integrated Persistent 3D Story World

A reader-facing hackathon prototype that turns a book, chapter by chapter, into
an explorable, persistent 3D world. Read a chapter, watch the scene process in
the background, then step into the world it built.

This folder owns Member 3's product UI. It is connected to Member 2's real React
Three Fiber renderer through the `@spatial-runtime` alias in `vite.config.ts`.
`src/api/mockApi.ts` still simulates Member 1's asynchronous passage API for the
three prepared demo stories; it emits canonical spatial snapshots, patches and
visual plans through `src/spatial/mockSpatialAdapter.ts`.

For the supported fresh-clone workflow, start with
[`../docs/integrated-quick-start.md`](../docs/integrated-quick-start.md).
Room-to-room input, ownership, preloading, and door navigation are documented in
[`../docs/multi-location-traversal.md`](../docs/multi-location-traversal.md).

## Prerequisites

- **Node 22** (pinned in `.mise.toml`). Vite 8 will crash on startup with an older Node (`node:util` missing `styleText`) — check with `node --version` before running anything.
- **pnpm 10** (there's a `pnpm-lock.yaml`). npm works as a fallback with `--legacy-peer-deps`, but you'll get a separate `package-lock.json` that shouldn't be committed alongside the pnpm lockfile.

If you use [mise](https://mise.jdx.dev/), it'll pick up the pinned toolchain automatically:

```bash
mise install
```

## Run the integrated app

From the repository root:

```bash
pnpm setup:integrated
pnpm dev:integrated
```

Then open `http://127.0.0.1:8443/`.

Running `pnpm dev` inside this folder is equivalent after both dependency trees
have been installed, but the root command is preferred because it makes the
integration boundary explicit.

Without `mise`, make sure `node --version` reports `v22.x` before running the above — otherwise switch to it first via nvm/fnm/Volta or a manual Node 22 install.

## npm fallback (no pnpm/mise available)

The repository's supported workflow uses pnpm because it contains two committed
pnpm lockfiles. npm can run this UI folder in isolation, but it is not the
recommended integrated workflow:

```bash
node --version          # must report v22.x — see Prerequisites above
npm install --legacy-peer-deps
npm run dev
```

`--legacy-peer-deps` is needed because of a `@types/react` / `@types/react-dom`
peer-version mismatch in this dependency set. This generates its own
`package-lock.json`; do not commit it alongside `pnpm-lock.yaml`.

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
  api/mockApi.ts         # temporary Member 1 API simulator for prepared stories
  components/WorldViewer.tsx  # Member 3 adapter over Member 2's real viewer
  spatial/mockSpatialAdapter.ts # maps prepared UI data into canonical runtime contracts
  data/mockData.ts       # book/chapter text, scene entities, conflicts
```

Member 2's public API is imported from repository-root `src/index.ts`; its
models, textures, environment maps and safe meshes are served from the
repository-root `public/` directory. Do not copy those files into this folder.

The design brief this prototype follows is at `src/imports/pasted_text/ui-ux-design-brief.md`.
