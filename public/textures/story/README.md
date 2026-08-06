# Generated story textures

Project-owned runtime textures generated with OpenAI's built-in image-generation
workflow. They are versioned outputs of semantic descriptions in the visual
scene plan, not factual additions to the story world.

## `faded-red-rug-v1.png`

Prompt summary: seamless orthographic aged wool weave, unmistakably muted
crimson/burgundy, hand-painted storybook realism, no border or surrounding room.

## `antique-map-v1.png`

Prompt summary: orthographic old parchment map with inked paths, rivers,
mountains, forests and fold creases, with no readable words or modern labels.

## `storybook-gallery-atlas-v1.png`

Prompt summary: four decorative, character-free storybook landscape paintings
in a two-by-two texture atlas: woodland, moonlit manor garden, coast and alpine
valley. The runtime crops quadrants deterministically for non-narrative wall art.

## `ashwood-woman-portrait-v1.png`

Prompt summary: a vertical oil portrait of the passage-explicit seated woman in
a dark period dress, with her hands arranged carefully in her lap. This is the
prepared demo's resolved hero texture; future stories resolve their own portrait
surface through the asynchronous asset pipeline.

## `ashwood-victorian-wallpaper-v1.webp`

Prompt summary: a seamless orthographic Victorian botanical-damask wallpaper
tile in muted sage, aged gold and umber, with uniform illumination and no wall,
room, border, text or perspective. The WebP runtime copy is a 1024px optimized
version of the project-owned generated source.

## `ashwood-victorian-window-v1.png`

Prompt summary: straight-on late-Victorian arched triptych window in carved
dark walnut, old leaded glass and a moonlit estate garden, composed as one
cohesive facade texture without a surrounding wall or detached decoration.

This first version is retained as provenance but is not used by the runtime;
its baked frame and terrace perspective were unsuitable for a parallax window.

## `ashwood-estate-exterior-v2.png`

Prompt summary: a single continuous, ground-level moonlit estate drive with a
high crescent moon, layered shrubs, woodland and distant lanterns. It contains
no baked window, balcony, railing, glass or interior geometry. The runtime uses
it only as the deepest backdrop behind separate 3D foliage, glass and framing.

This version is retained as provenance but is no longer used by the runtime;
its near-camera path and foreground planting produced an implausible view from
the room's elevated window.

## `ashwood-estate-exterior-v3.png`

Prompt summary: a landscape, eye-level view across a moonlit late-Victorian
estate garden from an elevated ground-floor room, with clipped yew hedges,
mature trees, a distant stone wall, restrained manor lights and a high moon.
The generation explicitly excludes a window, frame, glass, balcony, railing,
terrace, path approaching the viewer, close grass, ferns and foreground plants.
The runtime crops this plate to the physical opening and places it behind real
three-dimensional timber jambs, mullions, glazing and a deep sill.

## `ashwood-mantel-photos-v1.png`

Prompt summary: three equal late-Victorian sepia family photographs—a couple,
a young boy and a seated woman—prepared as a horizontal atlas for the small
mantel frames, without captions or baked-in physical frames.

## `ashwood-window-frame-v2.png`

Prompt summary: a straight-on, late-Victorian English manor triptych window
frame with three tall openings, carved dark walnut and restrained brass detail,
isolated against a uniform chroma-green field with no glass, scenery, wall,
curtains or interior. The green field was removed into alpha with the bundled
ImageGen chroma-key helper. The runtime layers this transparent architectural
frame over separately rendered glass, foliage and a parallax exterior.

## `ashwood-victorian-fireplace-tiles-v1.png`

Prompt summary: a seamless, straight-on late-Victorian encaustic ceramic tile
surface in bottle green and peacock teal with restrained aged-gold botanical
linework, fine crazed glaze, subtle grout and uniform material-capture lighting.
It is used only on recessed tile bands inside the dimensional marble fireplace;
the texture does not provide or imply any narrative object identity.
