import type {
  Entity,
  EntityKind,
  VisualEntityPlan,
  VisualLocationPlan,
  VisualScenePlan,
  WorldSnapshot as SpatialWorldSnapshot,
} from '@spatial-runtime'
import type { Book, Chapter, WorldEntity, WorldSnapshot } from '../types'

export interface MockSpatialScene {
  spatialSnapshot: SpatialWorldSnapshot
  spatialPatch: null
  visualPlan: VisualScenePlan
}

const BOUNDS: [number, number, number] = [24, 8, 28]

function semanticText(book: Book, chapter: Chapter): string {
  return `${book.title} ${book.description ?? ''} ${chapter.title} ${chapter.content}`.toLowerCase()
}

function entityKind(entity: WorldEntity): EntityKind {
  const text = `${entity.id} ${entity.name}`.toLowerCase()
  if (/door|window|fireplace|hearth|stair/.test(text)) return 'architecture'
  if (/chair|desk|table|bench|shelf/.test(text)) return 'furniture'
  if (/lamp|lantern|candle|light/.test(text)) return 'light'
  if (/box|chest|crate|cabinet/.test(text)) return 'container'
  return 'decor'
}

function assetKey(entity: WorldEntity): string | undefined {
  const text = `${entity.id} ${entity.name}`.toLowerCase()
  if (/fireplace|hearth/.test(text)) return 'fireplace'
  if (/armchair|chair|seat/.test(text)) return 'chair'
  if (/desk|table/.test(text)) return 'desk'
  if (/hidden.*door|doorway/.test(text)) return 'hidden-door'
  if (/door/.test(text)) return 'door'
  if (/lantern|lamp/.test(text)) return 'lantern'
  if (/map|chart|document/.test(text)) return 'map'
  if (/crate|box|chest/.test(text)) return 'crate'
  return undefined
}

function dimensions(entity: WorldEntity): [number, number, number] {
  const text = `${entity.id} ${entity.name}`.toLowerCase()
  if (/fireplace|hearth/.test(text)) return [2.5, 2.45, 0.7]
  if (/window/.test(text)) return [2.3, 1.7, 0.18]
  if (/portrait|painting/.test(text)) return [1.15, 1.5, 0.12]
  if (/door/.test(text)) return [1.2, 2.4, 0.2]
  if (/armchair|chair|seat/.test(text)) return [0.95, 1.2, 0.95]
  if (/desk|table/.test(text)) return [2.6, 1.05, 1.35]
  if (/key|pendant/.test(text)) return [0.25, 0.08, 0.16]
  return [0.9, 0.9, 0.9]
}

function position(entity: WorldEntity, size: [number, number, number]): [number, number, number] {
  const x = ((entity.position.x / 1200) - 0.5) * (BOUNDS[0] - 4)
  const z = ((entity.position.y / 680) - 0.5) * (BOUNDS[2] - 5)
  return [x, size[1] / 2, z]
}

function environment(text: string): {
  location: Omit<VisualLocationPlan, 'locationId' | 'evidence'>
  colors: { floorColor: string; wallColor: string; ambientColor: string }
} {
  if (/city|street|canal|quarter|market|bridge/.test(text)) {
    return {
      location: {
        archetype: 'storybook city quarter',
        visualDescription: 'A weathered old-city street with layered facades, stone paving and atmospheric depth.',
        architectureTags: ['open-air', 'urban-paving', 'urban-skyline'],
        dressingTags: ['courtyard-clutter', 'storage-crates', 'street-lamps'],
        dressingDensity: 'rich',
        mood: 'mysterious, lived-in and quietly magical',
        timeOfDay: 'blue hour',
        palette: { background: '#17262d', fog: '#52686d', floor: '#4c4b48', wall: '#796d63', timber: '#49362d', ambient: '#a8b7b3', keyLight: '#c9dbd8', practical: '#efa85e' },
        lighting: { warmth: 'neutral', contrast: 'medium', ambientIntensity: 0.72, keyIntensity: 1.45, atmosphericEffects: ['evening haze'] },
      },
      colors: { floorColor: '#4c4b48', wallColor: '#796d63', ambientColor: '#a8b7b3' },
    }
  }

  if (/archive|gallery|catalog|ledger|shelf/.test(text)) {
    return {
      location: {
        archetype: 'old archive gallery',
        visualDescription: 'A tall archival chamber with stone floors, shadowed shelving and pools of warm reading light.',
        architectureTags: ['archive-shelving', 'stone-tile-floor', 'aged-plaster'],
        dressingTags: ['books', 'storage-crates'],
        dressingDensity: 'rich',
        mood: 'hushed, uncanny and scholarly',
        timeOfDay: 'windowless interior',
        palette: { background: '#111718', fog: '#293133', floor: '#44433f', wall: '#8b8172', timber: '#3f3028', ambient: '#afa99d', keyLight: '#ded7c8', practical: '#e9a153' },
        lighting: { warmth: 'warm', contrast: 'high', ambientIntensity: 0.55, keyIntensity: 1.55, atmosphericEffects: ['dust-motes'] },
      },
      colors: { floorColor: '#44433f', wallColor: '#8b8172', ambientColor: '#afa99d' },
    }
  }

  return {
    location: {
      archetype: 'weathered country-estate hall',
      visualDescription: 'A spacious old hall with aged plaster, dark wood floors, a cold hearth and cool window light.',
      architectureTags: ['aged-plaster', 'wood-floorboards', 'small-window'],
      dressingTags: ['books', 'storage-crates'],
      dressingDensity: 'moderate',
      mood: 'elegant, secretive and melancholy',
      timeOfDay: 'moonlit evening',
      palette: { background: '#10151a', fog: '#293238', floor: '#44362f', wall: '#a79b89', timber: '#382b25', ambient: '#b5b1a8', keyLight: '#c8d9e4', practical: '#efa45b' },
      lighting: { warmth: 'neutral', contrast: 'high', ambientIntensity: 0.6, keyIntensity: 1.55, atmosphericEffects: ['window-shaft', 'dust-motes'] },
    },
    colors: { floorColor: '#44362f', wallColor: '#a79b89', ambientColor: '#b5b1a8' },
  }
}

function spatialEntity(entity: WorldEntity, chapter: Chapter): Entity {
  const size = dimensions(entity)
  return {
    id: entity.id,
    name: entity.name,
    kind: entityKind(entity),
    locationId: `${chapter.id}:scene`,
    assetKey: assetKey(entity),
    transform: { position: position(entity, size) },
    dimensions: size,
    state: entity.currentCondition ? { condition: entity.currentCondition } : undefined,
    provenance: {
      passageId: chapter.id,
      sentence: entity.sourceSentence,
      confidence: entity.evidenceType === 'Explicit' ? 0.95 : 0.62,
    },
  }
}

function visualEntity(entity: WorldEntity, chapter: Chapter): VisualEntityPlan {
  const factual = spatialEntity(entity, chapter)
  return {
    entityId: entity.id,
    visualDescription: `${entity.name}. ${entity.currentCondition ?? 'Story-worn and grounded in the scene.'}`,
    importance: /fireplace|armchair|pendant|canal|doorway/.test(`${entity.id} ${entity.name}`.toLowerCase()) ? 'hero' : 'supporting',
    materials: factual.kind === 'architecture' ? ['aged masonry', 'dark wood'] : ['weathered natural materials'],
    colors: ['story palette'],
    condition: entity.currentCondition ?? 'used',
    assetSearchTags: [entity.name.toLowerCase(), factual.assetKey ?? factual.kind],
    evidence: {
      passageIds: [chapter.id],
      confidence: entity.evidenceType === 'Explicit' ? 0.95 : 0.62,
      basis: entity.evidenceType === 'Explicit' ? 'explicit_text' : 'cross_passage_inference',
    },
  }
}

/** Development-only bridge. Production processing results pass through Part 1's real contracts. */
export function buildMockSpatialScene(
  book: Book,
  chapter: Chapter,
  uiSnapshot: WorldSnapshot,
): MockSpatialScene {
  const version = Math.max(1, chapter.index)
  const sceneId = `${chapter.id}:scene`
  const generatedEnvironment = environment(semanticText(book, chapter))
  const spatialSnapshot: SpatialWorldSnapshot = {
    storyId: book.id,
    version,
    passageId: chapter.id,
    locations: [{ id: sceneId, name: `${book.title} — ${chapter.title}`, bounds: BOUNDS, environment: generatedEnvironment.colors }],
    entities: uiSnapshot.entities.map((entity) => spatialEntity(entity, chapter)),
    relations: [],
    conflicts: [],
  }
  const visualPlan: VisualScenePlan = {
    schemaVersion: '1.0',
    storyId: book.id,
    segmentId: chapter.id,
    sourcePassageIds: [chapter.id],
    snapshotVersion: version,
    planVersion: version,
    artDirection: {
      styleLabel: 'cinematic hand-painted storybook realism',
      stylePrompt: `A cohesive explorable interpretation of ${book.title}, with readable silhouettes and layered atmospheric depth.`,
      negativePrompt: ['empty room', 'flat lighting', 'placeholder grid', 'floating props'],
      materialVocabulary: ['weathered natural surfaces', 'tactile story props', 'subtle age and wear'],
    },
    locations: [{
      locationId: sceneId,
      ...generatedEnvironment.location,
      evidence: { passageIds: [chapter.id], confidence: 0.55, basis: 'art_direction_default' },
    }],
    entities: uiSnapshot.entities.map((entity) => visualEntity(entity, chapter)),
    presentationConnections: [],
    unresolvedQuestions: [],
  }
  return { spatialSnapshot, spatialPatch: null, visualPlan }
}
