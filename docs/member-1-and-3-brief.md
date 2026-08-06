# Brief integration update for Members 1 and 3

Member 2 now exposes the following behavior in the integrated `wl` prototype.
These are data-contract and integration rules, not Ashwood-only special cases.

## Member 1: data the runtime preserves

- Keep canonical `storyId`, `locationId`, and `entityId` values stable across
  passages. Clicking a rendered narrative entity uses that identity to show its
  story title, chapter, current and previous state, source sentence, evidence
  classification, and confidence.
- Emit evidence-backed spatial relations and support descriptions such as
  `on desk`, `on third stair`, or `inside shelf`. Member 2 converts these into
  supported placement; it does not infer narrative truth from decorative props.
- For multiple rooms, emit both canonical locations plus the factual entrance
  entity. Put renderer navigation in
  `VisualScenePlan.presentationConnections`. Member 2 supplies the clickable
  door and room transition without minting a second story identity.
- Decorative dressing remains `decorativeOnly`; it is not shown as passage
  evidence and cannot become persistent narrative state unless Member 1 later
  promotes it through the factual pipeline.

## Member 3: behavior available to the reader

- Keep one prepared `WorldViewer` mounted between Reading and Explore. Door
  interaction works in POV, overview, and fullscreen walk mode; the controlled
  location returns through `onLocationRequest` / `onLocationChange`.
- Object picking is wired to the story inspector. A selected factual entity
  shows **From the story** and **Passage evidence**, including the chapter and
  exact source sentence supplied by Member 1. Decorative-only items do not make
  this claim.
- **Preparing the 3D scene...** is real. The integrated shell compiles the
  recipe, mounts an off-screen on-demand WebGL canvas, loads the active
  location's models and textures, waits for the loader queue to settle and two
  rendered frames, and repeats this for every location in the chapter. Only then
  does `onSceneReady` produce **3D scene ready** and enable Explore.
- Missing, rejected, or failed optional assets still use a designed fallback;
  they do not expose internal generation/review controls to readers. ComfyUI,
  reconstruction, review, and durable promotion remain Member 2 developer work.
- Keep `public/models/`, `public/textures/`, and `public/generated/` at the
  deployed web root. Otherwise the readiness signal can settle on fallbacks but
  visual quality will be lower.

See [`team-integration-contract.md`](team-integration-contract.md),
[`member-3-handoff.md`](member-3-handoff.md), and
[`multi-location-traversal.md`](multi-location-traversal.md) for the complete
contracts and examples.
