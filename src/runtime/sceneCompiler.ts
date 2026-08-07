import type { WorldSnapshot } from "../contracts/world";
import type {
  ScenePalette,
  VisualEntityPlan,
  VisualLocationPlan,
  VisualScenePlan,
} from "../contracts/visualScenePlan";

export interface AssetGenerationRequest {
  entityId: string;
  prompt: string;
  searchTags: string[];
  priority: "supporting" | "hero";
}

export type NarrativeSceneDomain =
  | "constructed"
  | "natural"
  | "celestial"
  | "subterranean"
  | "aquatic"
  | "volcanic"
  | "ruined";

export type NarrativeSceneVista =
  | "none"
  | "forest"
  | "mountain"
  | "dunes"
  | "ocean"
  | "city"
  | "celestial"
  | "cavern";

/**
 * Reusable visual axes inferred from Part 1 prose. They deliberately contain no
 * story identity, so unrelated stories can compose the same renderer grammar.
 */
export interface SceneSemanticProfile {
  enclosure: "interior" | "open" | "mixed";
  domain: NarrativeSceneDomain;
  vista: NarrativeSceneVista;
  scale: "intimate" | "roomy" | "monumental";
  metallic: boolean;
  crystalline: boolean;
  organic: boolean;
  fractured: boolean;
}

export type SceneEnvironmentModuleId =
  | "shell:solid-room"
  | "shell:glasshouse"
  | "shell:open-air"
  | "shell:industrial"
  | "shell:cavern"
  | "surface:wood-floorboards"
  | "surface:stone-tiles"
  | "surface:cobblestone"
  | "surface:forest-floor"
  | "surface:snow"
  | "surface:sand"
  | "surface:coastal"
  | "surface:grassland"
  | "surface:urban-paving"
  | "surface:industrial-floor"
  | "surface:aquatic"
  | "surface:volcanic"
  | "surface:crystal"
  | "surface:neutral-floor"
  | "path:earth-trail"
  | "wall:aged-plaster"
  | "structure:timber-frame"
  | "structure:iron-frame"
  | "structure:archive-shelves"
  | "structure:stone-arcade"
  | "structure:ruins"
  | "boundary:courtyard-wall"
  | "boundary:woodland-edge"
  | "boundary:mountain-horizon"
  | "boundary:dune-horizon"
  | "boundary:coastline"
  | "boundary:rolling-hills"
  | "boundary:urban-skyline"
  | "boundary:cosmic-vista"
  | "boundary:cavern-depth"
  | "opening:small-window"
  | "opening:panoramic-window";

export type SceneDressingModuleId =
  | "dressing:books"
  | "dressing:storage-crates"
  | "dressing:travel-chest"
  | "dressing:planters"
  | "dressing:climbing-vines"
  | "dressing:rain-puddles"
  | "dressing:wall-ivy"
  | "dressing:fallen-leaves"
  | "dressing:courtyard-clutter"
  | "dressing:broadleaf-trees"
  | "dressing:hedges"
  | "dressing:verge-rocks"
  | "dressing:pine-trees"
  | "dressing:forest-undergrowth"
  | "dressing:grass-tufts"
  | "dressing:wild-mushrooms"
  | "dressing:fallen-logs"
  | "dressing:forest-rocks"
  | "dressing:tavern-interior"
  | "dressing:nautical-interior"
  | "dressing:bedroom-interior"
  | "dressing:modern-interior";

export interface SceneModuleSelection<TModuleId extends string> {
  moduleId: TModuleId;
  sourceTags: string[];
}

export interface ScenePresentation {
  planVersion: number;
  styleLabel: string;
  semanticProfile: SceneSemanticProfile;
  location: VisualLocationPlan;
  palette: ScenePalette;
  modules: {
    environment: SceneModuleSelection<SceneEnvironmentModuleId>[];
    dressing: SceneModuleSelection<SceneDressingModuleId>[];
  };
  architecture: {
    floorboards: boolean;
    plasterWalls: boolean;
    timberFrame: boolean;
    window: boolean;
    archiveShelves: boolean;
    glasshousePanels: boolean;
    ironFrame: boolean;
    stoneTileFloor: boolean;
    openAir: boolean;
    cobblestone: boolean;
    forestFloor: boolean;
    earthTrail: boolean;
    stoneArcade: boolean;
    courtyardWalls: boolean;
    woodlandEdge: boolean;
    alpineTerrain: boolean;
    aridTerrain: boolean;
    coastalTerrain: boolean;
    grassland: boolean;
    urbanStreet: boolean;
    industrialShell: boolean;
  };
  dressing: {
    books: boolean;
    storageCrates: boolean;
    travelChest: boolean;
    planters: boolean;
    climbingVines: boolean;
    rainPuddles: boolean;
    wallIvy: boolean;
    fallenLeaves: boolean;
    courtyardClutter: boolean;
    broadleafTrees: boolean;
    hedges: boolean;
    vergeRocks: boolean;
    density: VisualLocationPlan["dressingDensity"];
  };
  atmosphere: {
    dust: boolean;
    coolWindowLight: boolean;
    rain: boolean;
    groundMist: boolean;
  };
  portalTargetLocationId?: string;
  /** Canonical entrance entity used for both faces of a factual connection. */
  portalSourceEntityId?: string;
  /** True when this location renders the destination-side face of that entrance. */
  portalIsReturn?: boolean;
  assetRequests: AssetGenerationRequest[];
}

const ENVIRONMENT_MODULE_RULES: ReadonlyArray<{
  moduleId: SceneEnvironmentModuleId;
  anyTags: string[];
}> = [
  { moduleId: "shell:glasshouse", anyTags: ["glasshouse-panels", "arched-glazing"] },
  { moduleId: "shell:open-air", anyTags: ["open-air", "open-courtyard"] },
  { moduleId: "shell:industrial", anyTags: ["industrial-shell"] },
  { moduleId: "shell:cavern", anyTags: ["cavern-shell"] },
  { moduleId: "surface:wood-floorboards", anyTags: ["wood-floorboards"] },
  { moduleId: "surface:stone-tiles", anyTags: ["stone-tile-floor"] },
  { moduleId: "surface:cobblestone", anyTags: ["cobblestone", "cobblestone-courtyard"] },
  { moduleId: "surface:forest-floor", anyTags: ["forest-floor", "mossy-ground", "woodland-ground"] },
  { moduleId: "surface:snow", anyTags: ["snow-ground", "frozen-ground"] },
  { moduleId: "surface:sand", anyTags: ["sand-ground", "desert-ground"] },
  { moduleId: "surface:coastal", anyTags: ["coastal-ground", "shoreline-ground"] },
  { moduleId: "surface:grassland", anyTags: ["grassland-ground", "meadow-ground"] },
  { moduleId: "surface:urban-paving", anyTags: ["urban-paving", "street-surface"] },
  { moduleId: "surface:industrial-floor", anyTags: ["industrial-floor", "metal-floor"] },
  { moduleId: "surface:aquatic", anyTags: ["aquatic-ground", "seabed"] },
  { moduleId: "surface:volcanic", anyTags: ["volcanic-ground", "lava-field"] },
  { moduleId: "surface:crystal", anyTags: ["crystal-ground", "crystalline-floor"] },
  { moduleId: "path:earth-trail", anyTags: ["earth-trail", "winding-path", "forest-path"] },
  { moduleId: "wall:aged-plaster", anyTags: ["aged-plaster"] },
  { moduleId: "structure:timber-frame", anyTags: ["timber-frame"] },
  { moduleId: "structure:iron-frame", anyTags: ["iron-frame"] },
  { moduleId: "structure:archive-shelves", anyTags: ["archive-shelving"] },
  { moduleId: "structure:stone-arcade", anyTags: ["stone-arcade", "cloister-arches"] },
  { moduleId: "structure:ruins", anyTags: ["ruined-structure", "ancient-ruins"] },
  { moduleId: "boundary:courtyard-wall", anyTags: ["courtyard-walls", "weathered-masonry"] },
  { moduleId: "boundary:woodland-edge", anyTags: ["woodland-edge", "forest-boundary", "dense-tree-line"] },
  { moduleId: "boundary:mountain-horizon", anyTags: ["mountain-horizon", "alpine-horizon"] },
  { moduleId: "boundary:dune-horizon", anyTags: ["dune-horizon", "desert-horizon"] },
  { moduleId: "boundary:coastline", anyTags: ["coastline", "water-horizon"] },
  { moduleId: "boundary:rolling-hills", anyTags: ["rolling-hills", "grassland-horizon"] },
  { moduleId: "boundary:urban-skyline", anyTags: ["urban-skyline", "street-buildings"] },
  { moduleId: "boundary:cosmic-vista", anyTags: ["cosmic-vista", "celestial-horizon"] },
  { moduleId: "boundary:cavern-depth", anyTags: ["cavern-depth", "underground-depth"] },
  { moduleId: "opening:small-window", anyTags: ["small-window"] },
  { moduleId: "opening:panoramic-window", anyTags: ["panoramic-window", "observation-window"] },
];

const DRESSING_MODULE_RULES: ReadonlyArray<{
  moduleId: SceneDressingModuleId;
  anyTags: string[];
}> = [
  { moduleId: "dressing:books", anyTags: ["books"] },
  { moduleId: "dressing:storage-crates", anyTags: ["storage-crates"] },
  { moduleId: "dressing:travel-chest", anyTags: ["travel-chest"] },
  { moduleId: "dressing:planters", anyTags: ["planters", "ceramic-pots"] },
  { moduleId: "dressing:climbing-vines", anyTags: ["climbing-vines"] },
  { moduleId: "dressing:rain-puddles", anyTags: ["rain-puddles", "wet-stone"] },
  { moduleId: "dressing:wall-ivy", anyTags: ["wall-ivy", "ivy"] },
  { moduleId: "dressing:fallen-leaves", anyTags: ["fallen-leaves", "leaf-litter"] },
  { moduleId: "dressing:courtyard-clutter", anyTags: ["courtyard-clutter", "coaching-yard-clutter"] },
  { moduleId: "dressing:broadleaf-trees", anyTags: ["broadleaf-trees", "oak-trees", "trees"] },
  { moduleId: "dressing:hedges", anyTags: ["hedges", "shrubs", "bushes"] },
  { moduleId: "dressing:verge-rocks", anyTags: ["verge-rocks", "rocks", "boulders"] },
  { moduleId: "dressing:pine-trees", anyTags: ["pine-trees", "conifers"] },
  { moduleId: "dressing:forest-undergrowth", anyTags: ["forest-undergrowth", "woodland-shrubs"] },
  { moduleId: "dressing:grass-tufts", anyTags: ["grass-tufts", "forest-grass"] },
  { moduleId: "dressing:wild-mushrooms", anyTags: ["wild-mushrooms", "forest-fungi"] },
  { moduleId: "dressing:fallen-logs", anyTags: ["fallen-logs", "deadwood"] },
  { moduleId: "dressing:forest-rocks", anyTags: ["forest-rocks", "mossy-rocks"] },
  { moduleId: "dressing:tavern-interior", anyTags: ["tavern-interior", "inn-common-room", "alehouse"] },
  { moduleId: "dressing:nautical-interior", anyTags: ["nautical-interior", "ship-cabin", "signal-room"] },
  { moduleId: "dressing:bedroom-interior", anyTags: ["bedroom-interior", "bedchamber"] },
  { moduleId: "dressing:modern-interior", anyTags: ["modern-interior", "contemporary-interior"] },
];

function semanticText(values: readonly string[]): string {
  return values
    .join(" ")
    .toLowerCase()
    .replace(/[_/]+/g, "-")
    .replace(/[^a-z0-9-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasSemantic(text: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

export function compileSceneSemanticProfile(
  location: VisualLocationPlan,
  resolvedArchitectureTags: ReadonlySet<string> = new Set(location.architectureTags),
): SceneSemanticProfile {
  const text = semanticText([
    location.archetype,
    location.visualDescription,
    location.mood,
    location.timeOfDay,
    ...location.architectureTags,
    ...location.dressingTags,
    ...location.lighting.atmosphericEffects,
  ]);
  const explicitlyOpen = hasSemantic(
    text,
    /\b(?:outdoor|outside|open-air|exterior|courtyard|plaza|square|street|road|alley|market|village|town|city|harbor|port|garden|meadow|field|forest|woodland|woods|grove|path|trail|beach|shore|desert|mountain|valley|salt-flat|wasteland|sky-island|seabed|ocean-floor)\b/,
  );
  const explicitlyExterior = hasSemantic(
    text,
    /\b(?:outdoor|outside|open[ -]air|exterior|courtyard|plaza|square|street|road|alley|marketplace|garden|path|trail|beach|shore)\b/,
  );
  const explicitlyInterior = hasSemantic(
    text,
    /\b(?:indoor|interior|inside|enclosed|room|chamber|cabin|vault|attic|archive|laboratory|workshop|ship[ -]interior)\b/,
  );
  const enclosure = explicitlyInterior
    ? explicitlyExterior ? "mixed" : "interior"
    : explicitlyOpen || resolvedArchitectureTags.has("open-air") ? "open" : "interior";
  const aquatic = hasSemantic(text, /\b(?:underwater|submerged|subaquatic|deep-sea|seabed|ocean-floor|coral-reef|sunken-palace|abyssal)\w*\b/);
  const volcanic = hasSemantic(text, /\b(?:volcanic|volcano|lava|magma|obsidian|ash-field|basalt|caldera|ember-field)\w*\b/);
  const subterranean = hasSemantic(text, /\b(?:cave|cavern|grotto|underground|subterranean|mine|catacomb|underworld|hollow-earth)\w*\b/);
  const hasCelestialVocabulary = hasSemantic(
    text,
    /\b(?:(?:celestial|cosmic|planet(?:ary)?|lunar|aether|orbital|void|nebula|astral)\w*|alien[ -]world|outer[ -]space|sky[ -]island|moon(?:scape|world)?)\b/,
  );
  const hasCelestialView = hasSemantic(
    text,
    /\b(?:panoramic[ -]window|observation[ -]window|viewing[ -]window|window[ -]wall|vast[ -]window|open[ -]sky|exterior)\w*\b/,
  );
  const celestial = hasCelestialVocabulary && (!explicitlyInterior || hasCelestialView);
  const ruined = hasSemantic(text, /\b(?:ruin|ruined|crumbling|collapsed|shattered-temple|ancient-remains|broken-monument|abandoned-city)\w*\b/);
  const natural = hasSemantic(text, /\b(?:forest|woodland|grove|meadow|mountain|valley|desert|coast|beach|jungle|swamp|marsh|tundra|wilderness)\w*\b/);
  const domain: NarrativeSceneDomain = aquatic
    ? "aquatic"
    : volcanic
      ? "volcanic"
      : subterranean
        ? "subterranean"
        : celestial
          ? "celestial"
          : ruined
            ? "ruined"
            : natural
              ? "natural"
              : "constructed";
  const vista: NarrativeSceneVista = celestial
    ? "celestial"
    : subterranean
      ? "cavern"
      : hasSemantic(text, /\b(?:ocean|sea|coast|shore|underwater|seabed)\w*\b/)
        ? "ocean"
      : hasSemantic(text, /\b(?:mountain|peak|glacier|alpine|cliff|caldera|volcano)\w*\b/)
          ? "mountain"
          : hasSemantic(text, /\b(?:desert|dune|badlands)\w*\b/)
            ? "dunes"
            : hasSemantic(text, /\b(?:city|town|village|urban|skyline)\w*\b/)
              ? "city"
              : hasSemantic(text, /\b(?:forest|woodland|grove|jungle)\w*\b/)
                ? "forest"
                : "none";
  const scale = hasSemantic(text, /\b(?:vast|enormous|colossal|monumental|towering|endless|immense|cathedral-scale)\w*\b/)
    ? "monumental"
    : hasSemantic(text, /\b(?:small|tiny|narrow|cramped|intimate|compact|cozy)\w*\b/)
      ? "intimate"
      : "roomy";

  return {
    enclosure,
    domain,
    vista,
    scale,
    metallic: hasSemantic(text, /\b(?:metal|metallic|iron|steel|bronze|copper|brass|riveted|mechanical|industrial)\w*\b/),
    crystalline: hasSemantic(text, /\b(?:crystal|crystalline|glass|glasswork|gem|quartz|ice-palace|prismatic)\w*\b/),
    organic: hasSemantic(text, /\b(?:organic|living|grown|root|vine|fungal|coral|bone|biomorphic)\w*\b/),
    fractured: hasSemantic(text, /\b(?:fractured|shattered|broken|cracked|splintered|collapsed)\w*\b/),
  };
}

/**
 * Maps unfamiliar but descriptive Part 1 vocabulary onto the finite renderer
 * kit. These are presentation defaults only: they never create story entities
 * or factual relations.
 */
function expandSemanticTags(location: VisualLocationPlan): {
  architecture: Set<string>;
  dressing: Set<string>;
  atmosphereText: string;
} {
  const architecture = new Set(location.architectureTags.map((tag) => tag.toLowerCase()));
  const dressing = new Set(location.dressingTags.map((tag) => tag.toLowerCase()));
  const atmosphereText = semanticText([
    location.archetype,
    location.visualDescription,
    location.mood,
    location.timeOfDay,
    ...location.architectureTags,
    ...location.dressingTags,
    ...location.lighting.atmosphericEffects,
  ]);
  const hasExplicitIndoorShell = hasSemantic(
    atmosphereText,
    /\b(?:indoor|interior|room|chamber|hall|attic|archive|library|study|bedroom|kitchen|laboratory|workshop|cabin|vault|bay|observatory|outpost|cave|cavern|grotto|tunnel|mine|station|spaceship|airship|ship-interior)\b/,
  );
  const hasExplicitOpenShell = hasSemantic(
    atmosphereText,
    /\b(?:outdoor|outside|open-air|exterior|courtyard|plaza|square|street|road|alley|market|village|town|city|harbor|port|garden|meadow|field|forest|woodland|woods|grove|path|trail|beach|shore|desert|mountain|valley|salt-flat|wasteland|sky-island|seabed|ocean-floor)\b/,
  );
  const hasAquaticSetting = hasSemantic(
    atmosphereText,
    /\b(?:underwater|submerged|subaquatic|deep-sea|seabed|ocean-floor|coral-reef|sunken-palace|abyssal)\w*\b/,
  );
  const hasVolcanicSetting = hasSemantic(
    atmosphereText,
    /\b(?:volcanic|volcano|lava|magma|obsidian|ash-field|basalt|caldera|ember-field)\w*\b/,
  );
  const hasPanoramicWindow = hasSemantic(
    atmosphereText,
    /\b(?:panoramic[ -]window|observation[ -]window|viewing[ -]window|window[ -]wall|vast[ -]window)\w*\b/,
  );
  const hasStrongExteriorShell = hasSemantic(
    atmosphereText,
    /\b(?:outdoor|outside|open[ -]air|exterior|courtyard|plaza|square|street|road|alley|marketplace|garden|path|trail|beach|shore)\b/,
  );
  const isExposedRuin = hasSemantic(
    atmosphereText,
    /\b(?:ruin|ruined|crumbling|collapsed|roofless|open[ -]ruin|broken[ -]monument)\w*\b/,
  );
  const permitsTerrain = !hasExplicitIndoorShell || hasStrongExteriorShell || isExposedRuin;
  const hasIndustrialInterior = hasExplicitIndoorShell && hasSemantic(
    atmosphereText,
    /\b(?:industrial|factory|warehouse|foundry|engine-room|machine-room|spaceship|space-station|orbital|laboratory|workshop|retrofuturist|mechanical|machinery|metallic|riveted|control-bay|generator)\w*\b/,
  );
  const hasSpecializedInterior = architecture.has("timber-frame") ||
    architecture.has("glasshouse-panels") ||
    architecture.has("archive-shelving") ||
    hasSemantic(atmosphereText, /\b(?:attic|archive|library|conservatory|glasshouse|greenhouse)\b/);
  const hasTavernInterior = hasExplicitIndoorShell && hasSemantic(
    atmosphereText,
    /\b(?:tavern|alehouse|taproom|inn[ -]common[ -]room|public[ -]house)\w*\b/,
  );
  const hasNauticalInterior = hasExplicitIndoorShell && hasSemantic(
    atmosphereText,
    /\b(?:ship[ -]cabin|captain(?:'s)?[ -]cabin|signal[ -]room|lighthouse[ -]room|chart[ -]room|wheelhouse|belowdecks|naval[ -]cabin)\w*\b/,
  );
  const hasBedroomInterior = hasExplicitIndoorShell && hasSemantic(
    atmosphereText,
    /\b(?:bedroom|bedchamber|sleeping[ -]chamber|guest[ -]room|nursery)\w*\b/,
  );
  const hasModernInterior = hasExplicitIndoorShell && hasSemantic(
    atmosphereText,
    /\b(?:modern|contemporary|minimalist|twenty-first-century|glass-and-steel|corporate|coworking|open-plan[ -]office)\w*\b/,
  );
  const hasGroundedInterior = hasExplicitIndoorShell &&
    !hasIndustrialInterior &&
    !hasSpecializedInterior &&
    !hasTavernInterior &&
    !hasNauticalInterior &&
    !hasBedroomInterior &&
    !hasModernInterior && hasSemantic(
    atmosphereText,
    /\b(?:house|home|room|hall|chamber|manor|estate|parlour|parlor|gallery|archive|library|study|bedroom|inn|tavern|office|school|palace|castle)\w*\b/,
  );

  if (hasExplicitOpenShell && !hasExplicitIndoorShell) architecture.add("open-air");
  if (hasSemantic(atmosphereText, /\b(?:conservatory|glasshouse|greenhouse|winter-garden)\b/)) {
    architecture.add("glasshouse-panels");
    architecture.add("iron-frame");
    architecture.add("stone-tile-floor");
  }
  if (permitsTerrain && hasSemantic(atmosphereText, /\b(?:forest|woodland|woods|grove|mossy|understory)\b/)) {
    architecture.add("open-air");
    architecture.add("forest-floor");
    architecture.add("woodland-edge");
    dressing.add("forest-undergrowth");
    dressing.add("grass-tufts");
  }
  if (permitsTerrain && hasSemantic(atmosphereText, /\b(?:snow|snowy|winter|frozen|ice|icy|glacier|alpine|tundra)\w*\b/)) {
    architecture.add("open-air");
    architecture.add("snow-ground");
    architecture.add("mountain-horizon");
    dressing.add("pine-trees");
    dressing.add("forest-rocks");
  }
  if (permitsTerrain && hasSemantic(atmosphereText, /\b(?:desert|dune|arid|badlands|canyon|oasis|sand-sea)\w*\b/)) {
    architecture.add("open-air");
    architecture.add("sand-ground");
    architecture.add("dune-horizon");
  }
  if (permitsTerrain && !hasAquaticSetting && hasSemantic(atmosphereText, /\b(?:coast|coastal|shore|shoreline|beach|seaside|ocean|sea-cliff|island|harbor|harbour|port)\w*\b/)) {
    architecture.add("open-air");
    architecture.add("coastal-ground");
    architecture.add("coastline");
  }
  if (permitsTerrain && hasSemantic(atmosphereText, /\b(?:grassland|meadow|prairie|savanna|steppe|moor|countryside|open-field|rolling-hill)\w*\b/)) {
    architecture.add("open-air");
    architecture.add("grassland-ground");
    architecture.add("rolling-hills");
    dressing.add("grass-tufts");
    dressing.add("hedges");
  }
  if (permitsTerrain && hasAquaticSetting) {
    architecture.add("open-air");
    architecture.add("aquatic-ground");
  }
  if (permitsTerrain && hasVolcanicSetting) {
    architecture.add("open-air");
    architecture.add("volcanic-ground");
    architecture.add("mountain-horizon");
  }
  if (hasSemantic(atmosphereText, /\b(?:cave|cavern|grotto|underground|subterranean|mine|catacomb|underworld|hollow-earth)\w*\b/)) {
    architecture.add("cavern-shell");
    architecture.add("cavern-depth");
  }
  if (
    hasSemantic(atmosphereText, /\b(?:(?:celestial|cosmic|planet(?:ary)?|lunar|aether|orbital|void|nebula|astral)\w*|alien[ -]world|outer[ -]space|sky[ -]island|moon(?:scape|world)?)\b/) &&
    (!hasExplicitIndoorShell || hasPanoramicWindow)
  ) {
    architecture.add("cosmic-vista");
  }
  if (hasPanoramicWindow) {
    architecture.add("panoramic-window");
  }
  if (hasSemantic(atmosphereText, /\b(?:ruin|ruined|crumbling|collapsed|shattered-temple|ancient-remains|broken-monument|abandoned-city)\w*\b/)) {
    architecture.add("ruined-structure");
  }
  if (hasSemantic(atmosphereText, /\b(?:crystal|crystalline|quartz|prismatic|gem-floor)\w*\b/)) {
    architecture.add("crystal-ground");
  }
  if (!hasExplicitIndoorShell && hasSemantic(atmosphereText, /\b(?:city|town|village|street|alley|marketplace|market-square|urban|boulevard)\w*\b/)) {
    architecture.add("open-air");
    architecture.add("urban-paving");
    architecture.add("urban-skyline");
    dressing.add("urban-clutter");
    dressing.add("street-lamps");
  }
  if (hasIndustrialInterior) {
    architecture.add("industrial-shell");
    architecture.add("industrial-floor");
    dressing.add("storage-crates");
    dressing.add("industrial-pipes");
  }
  if (hasTavernInterior) {
    dressing.add("tavern-interior");
    dressing.add("interior-lighting");
  }
  if (hasNauticalInterior) {
    dressing.add("nautical-interior");
    dressing.add("storage-crates");
    dressing.add("interior-lighting");
  }
  if (hasBedroomInterior) {
    dressing.add("bedroom-interior");
    dressing.add("interior-rugs");
    dressing.add("interior-lighting");
  }
  if (hasModernInterior) {
    dressing.add("modern-interior");
  }
  if (hasGroundedInterior) {
    dressing.add("period-interior");
    dressing.add("interior-rugs");
    dressing.add("interior-lighting");
  }
  if (hasGroundedInterior && hasSemantic(atmosphereText, /\b(?:study|office|writing[ -]room|writing[ -]desk|scribe|workroom)\w*\b/)) {
    dressing.add("writing-room");
  }
  if (hasGroundedInterior && hasSemantic(atmosphereText, /\b(?:reading[ -]nook|reading[ -]room|fireside[ -]reading)\w*\b/)) {
    dressing.add("reading-nook");
  }
  if (hasGroundedInterior && hasSemantic(atmosphereText, /\b(?:parlour|parlor|drawing[ -]room|salon|sitting[ -]room|conversation[ -]room|lounge)\w*\b/)) {
    dressing.add("parlor");
  }
  if (
    (hasGroundedInterior || hasTavernInterior || hasNauticalInterior || hasBedroomInterior) &&
    hasSemantic(atmosphereText, /\b(?:mantel|mantelpiece|fireplace|hearth)\w*\b/)
  ) {
    dressing.add("mantel-display");
  }
  if (hasExplicitIndoorShell && !hasIndustrialInterior && hasSemantic(atmosphereText, /\b(?:picture[ -]wall|portrait[ -]wall|wall[ -]gallery|framed[ -]art|paintings?)\w*\b/)) {
    dressing.add("wall-gallery");
  }
  const isCompactUtilityInterior = hasSemantic(
    atmosphereText,
    /\b(?:schoolroom|classroom|nursery|servants?[ -]room|box[ -]room|store[ -]room|storage[ -]room)\w*\b/,
  );
  if (
    hasGroundedInterior
    && !isCompactUtilityInterior
    && hasSemantic(atmosphereText, /\b(?:storybook|historical|historic|antique|victorian|gothic|manor|estate|old-world|period)\w*\b/)
  ) {
    architecture.add("estate-paneling");
  }
  if (hasSemantic(atmosphereText, /\b(?:path|trail|track|woodland-road)\b/)) {
    architecture.add("earth-trail");
  }
  if (hasSemantic(atmosphereText, /\b(?:courtyard|cloister|quadrangle)\b/)) {
    architecture.add("open-courtyard");
    architecture.add("courtyard-walls");
  }
  if (hasSemantic(atmosphereText, /\b(?:arcade|cloister|colonnade|stone-arches?)\b/)) {
    architecture.add("stone-arcade");
  }
  if (hasSemantic(atmosphereText, /\b(?:cobble|cobblestone|stone-paved|paving-stone)\b/)) {
    architecture.add("cobblestone");
  }
  if (hasSemantic(atmosphereText, /\b(?:wooden-floor|wood-floor|floorboard|plank-floor)\b/)) {
    architecture.add("wood-floorboards");
  }
  if (hasSemantic(atmosphereText, /\b(?:stone-tile|tiled-stone|flagstone-floor|marble-floor)\b/)) {
    architecture.add("stone-tile-floor");
  }
  if (hasSemantic(atmosphereText, /\b(?:plaster|stucco|limewash)\b/)) architecture.add("aged-plaster");
  if (hasSemantic(atmosphereText, /\b(?:timber-frame|exposed-beam|half-timber)\b/)) architecture.add("timber-frame");
  if (hasSemantic(atmosphereText, /\b(?:archive|library|book-lined|bookshel)\w*\b/)) {
    architecture.add("archive-shelving");
    dressing.add("books");
    dressing.add("archive-clutter");
    dressing.add("interior-rugs");
    dressing.add("interior-lighting");
  }
  if (hasSemantic(atmosphereText, /\b(?:window|moonbeam|sunbeam)\b/)) architecture.add("small-window");

  if (hasSemantic(atmosphereText, /\b(?:book|folio|manuscript|scroll)\w*\b/)) dressing.add("books");
  if (hasSemantic(atmosphereText, /\b(?:crate|box|storage)\w*\b/)) dressing.add("storage-crates");
  if (hasSemantic(atmosphereText, /\b(?:chest|trunk|luggage)\w*\b/)) dressing.add("travel-chest");
  if (hasSemantic(atmosphereText, /\b(?:planter|flowerpot|potted-plant|ceramic-pot)\w*\b/)) dressing.add("planters");
  if (hasSemantic(atmosphereText, /\b(?:vine|creeper|climbing-plant)\w*\b/)) dressing.add("climbing-vines");
  if (hasSemantic(atmosphereText, /\b(?:ivy|wall-vine)\w*\b/)) dressing.add("wall-ivy");
  if (hasSemantic(atmosphereText, /\b(?:puddle|wet-stone|rain-soaked)\w*\b/)) dressing.add("rain-puddles");
  if (hasSemantic(atmosphereText, /\b(?:fallen-lea|leaf-litter|autumn-lea)\w*\b/)) dressing.add("fallen-leaves");
  if (hasSemantic(atmosphereText, /\b(?:oak|broadleaf|deciduous)\w*\b/)) dressing.add("broadleaf-trees");
  if (hasSemantic(atmosphereText, /\b(?:pine|conifer|fir-tree|spruce)\w*\b/)) dressing.add("pine-trees");
  if (hasSemantic(atmosphereText, /\b(?:hedge|shrub|bush)\w*\b/)) {
    dressing.add(architecture.has("forest-floor") ? "forest-undergrowth" : "hedges");
  }
  if (hasSemantic(atmosphereText, /\b(?:boulder|rock|stone-outcrop)\w*\b/)) {
    const hasIntegratedRockDressing = [
      "sand-ground",
      "coastal-ground",
      "aquatic-ground",
      "volcanic-ground",
      "cavern-shell",
    ].some((tag) => architecture.has(tag));
    if (!hasIntegratedRockDressing) {
      dressing.add(architecture.has("forest-floor") ? "forest-rocks" : "verge-rocks");
    }
  }
  if (hasSemantic(atmosphereText, /\b(?:mushroom|fungi|toadstool)\w*\b/)) dressing.add("wild-mushrooms");
  if (hasSemantic(atmosphereText, /\b(?:fallen-log|deadwood|tree-trunk)\w*\b/)) dressing.add("fallen-logs");

  return { architecture, dressing, atmosphereText };
}

function selectModules<TModuleId extends string>(
  tags: ReadonlySet<string>,
  rules: ReadonlyArray<{ moduleId: TModuleId; anyTags: string[] }>,
): SceneModuleSelection<TModuleId>[] {
  return rules.flatMap((rule) => {
    const sourceTags = rule.anyTags.filter((tag) => tags.has(tag));
    return sourceTags.length > 0 ? [{ moduleId: rule.moduleId, sourceTags }] : [];
  });
}

function environmentModules(
  architectureTags: ReadonlySet<string>,
): SceneModuleSelection<SceneEnvironmentModuleId>[] {
  const selected = selectModules(architectureTags, ENVIRONMENT_MODULE_RULES);
  const hasGlasshouse = selected.some((module) => module.moduleId === "shell:glasshouse");
  const hasOpenAir = selected.some((module) => module.moduleId === "shell:open-air");
  const hasCavern = selected.some((module) => module.moduleId === "shell:cavern");
  const hasFloor = selected.some((module) => module.moduleId.startsWith("surface:"));
  return [
    ...(!hasGlasshouse && !hasOpenAir && !hasCavern
      ? [{ moduleId: "shell:solid-room" as const, sourceTags: [] }]
      : []),
    ...(!hasFloor
      ? [{ moduleId: "surface:neutral-floor" as const, sourceTags: [] }]
      : []),
    ...selected,
  ];
}

export class ScenePlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenePlanError";
  }
}

export function visualAssetPrompt(visual: VisualEntityPlan): string {
  if (visual.assetGenerationPrompt) return visual.assetGenerationPrompt;
  return [
    visual.visualDescription,
    visual.materials.join(", "),
    visual.colors.join(", "),
    visual.condition ? `Condition: ${visual.condition}.` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

function requireCanonicalJoins(plan: VisualScenePlan, snapshot: WorldSnapshot): void {
  if (plan.storyId !== snapshot.storyId) {
    throw new ScenePlanError(`Visual plan story '${plan.storyId}' does not match '${snapshot.storyId}'.`);
  }
  if (plan.snapshotVersion > snapshot.version) {
    throw new ScenePlanError(
      `Visual plan requires world v${plan.snapshotVersion}, but the runtime is at v${snapshot.version}.`,
    );
  }

  const locationIds = new Set(snapshot.locations.map((location) => location.id));
  const entityIds = new Set(snapshot.entities.map((entity) => entity.id));
  for (const location of plan.locations) {
    if (!locationIds.has(location.locationId)) {
      throw new ScenePlanError(`Visual location '${location.locationId}' is not canonical.`);
    }
  }
  for (const entity of plan.entities) {
    if (!entityIds.has(entity.entityId)) {
      throw new ScenePlanError(`Visual entity '${entity.entityId}' is not canonical.`);
    }
  }
  for (const connection of plan.presentationConnections) {
    if (
      !entityIds.has(connection.entityId) ||
      !locationIds.has(connection.fromLocationId) ||
      !locationIds.has(connection.targetLocationId)
    ) {
      throw new ScenePlanError(`Presentation connection '${connection.entityId}' has a broken join.`);
    }
  }
}

function createAssetRequests(
  entities: readonly VisualEntityPlan[],
  snapshot: WorldSnapshot,
): AssetGenerationRequest[] {
  const worldEntities = new Map(snapshot.entities.map((entity) => [entity.id, entity]));
  return entities.flatMap((visual) => {
    const entity = worldEntities.get(visual.entityId);
    if (!entity || entity.assetKey || visual.importance === "background") return [];
    return [{
      entityId: visual.entityId,
      prompt: visualAssetPrompt(visual),
      searchTags: visual.assetSearchTags,
      priority: visual.importance,
    }];
  });
}

/** Compiles novel-derived visual context into deterministic renderer decisions. */
export function compileScenePresentation(
  plan: VisualScenePlan,
  snapshot: WorldSnapshot,
  locationId: string,
): ScenePresentation {
  requireCanonicalJoins(plan, snapshot);
  const location = plan.locations.find((candidate) => candidate.locationId === locationId);
  if (!location) {
    throw new ScenePlanError(`No visual plan exists for location '${locationId}'.`);
  }

  const semanticTags = expandSemanticTags(location);
  const architectureTags = semanticTags.architecture;
  const dressingTags = semanticTags.dressing;
  const forwardConnection = plan.presentationConnections.find(
    (candidate) => candidate.fromLocationId === locationId,
  );
  // A factual physical doorway has two usable faces. Reuse the same canonical
  // entity on the destination side instead of minting a second story identity.
  // Presentation-only portals remain directional because their reverse route
  // is not established narrative truth.
  const returnConnection = forwardConnection
    ? undefined
    : plan.presentationConnections.find(
        (candidate) => !candidate.presentationOnly && candidate.targetLocationId === locationId,
      );
  const connection = forwardConnection ?? returnConnection;
  const selectedEnvironmentModules = environmentModules(architectureTags);
  const selectedDressingModules = selectModules(dressingTags, DRESSING_MODULE_RULES);
  const resolvedLocation: VisualLocationPlan = {
    ...location,
    architectureTags: [...architectureTags],
    dressingTags: [...dressingTags],
  };

  return {
    planVersion: plan.planVersion,
    styleLabel: plan.artDirection.styleLabel,
    semanticProfile: compileSceneSemanticProfile(resolvedLocation, architectureTags),
    location: resolvedLocation,
    palette: location.palette,
    modules: {
      environment: selectedEnvironmentModules,
      dressing: selectedDressingModules,
    },
    architecture: {
      floorboards: architectureTags.has("wood-floorboards"),
      plasterWalls: architectureTags.has("aged-plaster"),
      timberFrame: architectureTags.has("timber-frame"),
      window: architectureTags.has("small-window"),
      archiveShelves: architectureTags.has("archive-shelving"),
      glasshousePanels: architectureTags.has("glasshouse-panels"),
      ironFrame: architectureTags.has("iron-frame"),
      stoneTileFloor: architectureTags.has("stone-tile-floor"),
      openAir: architectureTags.has("open-air") || architectureTags.has("open-courtyard"),
      cobblestone: architectureTags.has("cobblestone") || architectureTags.has("cobblestone-courtyard"),
      forestFloor: ["forest-floor", "mossy-ground", "woodland-ground"].some((tag) => architectureTags.has(tag)),
      earthTrail: ["earth-trail", "winding-path", "forest-path"].some((tag) => architectureTags.has(tag)),
      stoneArcade: architectureTags.has("stone-arcade") || architectureTags.has("cloister-arches"),
      courtyardWalls: architectureTags.has("courtyard-walls") || architectureTags.has("weathered-masonry"),
      woodlandEdge: ["woodland-edge", "forest-boundary", "dense-tree-line"].some((tag) => architectureTags.has(tag)),
      alpineTerrain: architectureTags.has("snow-ground") || architectureTags.has("mountain-horizon"),
      aridTerrain: architectureTags.has("sand-ground") || architectureTags.has("dune-horizon"),
      coastalTerrain: architectureTags.has("coastal-ground") || architectureTags.has("coastline"),
      grassland: architectureTags.has("grassland-ground") || architectureTags.has("rolling-hills"),
      urbanStreet: architectureTags.has("urban-paving") || architectureTags.has("urban-skyline"),
      industrialShell: architectureTags.has("industrial-shell") || architectureTags.has("industrial-floor"),
    },
    dressing: {
      books: dressingTags.has("books"),
      storageCrates: dressingTags.has("storage-crates"),
      travelChest: dressingTags.has("travel-chest"),
      planters: dressingTags.has("planters") || dressingTags.has("ceramic-pots"),
      climbingVines: dressingTags.has("climbing-vines"),
      rainPuddles: dressingTags.has("rain-puddles") || dressingTags.has("wet-stone"),
      wallIvy: dressingTags.has("wall-ivy") || dressingTags.has("ivy"),
      fallenLeaves: dressingTags.has("fallen-leaves") || dressingTags.has("leaf-litter"),
      courtyardClutter: dressingTags.has("courtyard-clutter") || dressingTags.has("coaching-yard-clutter"),
      broadleafTrees: ["broadleaf-trees", "oak-trees", "trees"].some((tag) => dressingTags.has(tag)),
      hedges: ["hedges", "shrubs", "bushes"].some((tag) => dressingTags.has(tag)),
      vergeRocks: ["verge-rocks", "rocks", "boulders"].some((tag) => dressingTags.has(tag)),
      density: location.dressingDensity,
    },
    atmosphere: {
      dust: location.lighting.atmosphericEffects.includes("dust-motes") ||
        hasSemantic(semanticTags.atmosphereText, /\b(?:dusty|dust-motes|floating-dust)\b/),
      coolWindowLight: location.lighting.atmosphericEffects.includes("window-shaft") ||
        hasSemantic(semanticTags.atmosphereText, /\b(?:moonbeam|moonlight|window-shaft)\b/),
      rain: location.lighting.atmosphericEffects.includes("rain-streaks") ||
        hasSemantic(semanticTags.atmosphereText, /\b(?:rain|rainy|storm|drizzle|downpour)\w*\b/),
      groundMist: location.lighting.atmosphericEffects.includes("ground-mist") ||
        hasSemantic(semanticTags.atmosphereText, /\b(?:mist|misty|fog|foggy|ground-haze)\w*\b/),
    },
    portalTargetLocationId: returnConnection
      ? returnConnection.fromLocationId
      : forwardConnection?.targetLocationId,
    portalSourceEntityId: connection?.entityId,
    portalIsReturn: Boolean(returnConnection),
    assetRequests: createAssetRequests(plan.entities, snapshot),
  };
}

/** Keeps WorldViewer usable when a consumer has not adopted visual planning yet. */
export function createFallbackScenePresentation(
  snapshot: WorldSnapshot,
  locationId: string,
): ScenePresentation {
  const location = snapshot.locations.find((candidate) => candidate.id === locationId);
  if (!location) throw new ScenePlanError(`Cannot create fallback for '${locationId}'.`);
  const fallbackContext = semanticText([location.name]);
  const appearsExterior = hasSemantic(
    fallbackContext,
    /\b(?:courtyard|plaza|square|street|road|alley|garden|meadow|field|forest|woodland|woods|grove|path|trail|beach|shore|desert|mountain|valley)\b/,
  );
  const palette: ScenePalette = {
    background: appearsExterior ? "#162326" : "#171b20",
    fog: appearsExterior ? "#293b3a" : "#20262a",
    floor: location.environment?.floorColor ?? (appearsExterior ? "#39453a" : "#453b34"),
    wall: location.environment?.wallColor ?? "#b7aa98",
    timber: "#44372f",
    ambient: location.environment?.ambientColor ?? "#d9d2c5",
    keyLight: appearsExterior ? "#d3e3df" : "#f0dfc7",
    practical: "#f2a45d",
  };
  const visualLocation: VisualLocationPlan = {
    locationId,
    archetype: appearsExterior ? "generic-exterior" : "generic-interior",
    visualDescription: location.name,
    architectureTags: appearsExterior ? [] : ["aged-plaster", "wood-floorboards"],
    dressingTags: [],
    dressingDensity: "moderate",
    mood: "quiet storybook atmosphere",
    timeOfDay: "unspecified",
    palette,
    lighting: {
      warmth: "neutral",
      contrast: "medium",
      ambientIntensity: 0.85,
      keyIntensity: 1.8,
      atmosphericEffects: [],
    },
    evidence: {
      passageIds: [snapshot.passageId],
      confidence: 0,
      basis: "art_direction_default",
    },
  };
  return compileScenePresentation({
    schemaVersion: "1.0",
    storyId: snapshot.storyId,
    segmentId: `${snapshot.passageId}:fallback`,
    sourcePassageIds: [snapshot.passageId],
    snapshotVersion: snapshot.version,
    planVersion: 0,
    artDirection: {
      styleLabel: "polished storybook fallback",
      stylePrompt: "A cohesive, atmospheric, readable story environment.",
      negativePrompt: ["empty room", "flat lighting", "placeholder geometry"],
      materialVocabulary: ["natural materials", "subtle wear", "layered surfaces"],
    },
    locations: [visualLocation],
    entities: [],
    presentationConnections: [],
    unresolvedQuestions: ["No VisualScenePlan was supplied; presentation uses labeled defaults."],
  }, snapshot, locationId);
}
