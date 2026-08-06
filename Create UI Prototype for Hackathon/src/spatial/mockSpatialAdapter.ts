import type {
  Entity,
  EntityKind,
  VisualEntityPlan,
  VisualLocationPlan,
  VisualScenePlan,
  WorldSnapshot as SpatialWorldSnapshot,
  SpatialRelation,
  Vector3Tuple,
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
  if (/box|chest|crate|cabinet|drawer/.test(text)) return 'container'
  return 'decor'
}

function isSpatialContainer(entity: WorldEntity): boolean {
  const text = `${entity.id} ${entity.name}`.toLowerCase()
  return /\b(?:[a-z-]*room|hall|corridor|street|quarter|district|forest|wood|garden|courtyard|square)\b/.test(text)
}

function assetKey(entity: WorldEntity): string | undefined {
  const text = `${entity.id} ${entity.name}`.toLowerCase()
  if (/canal|waterway|channel/.test(text)) return 'storybook-canal'
  if (/amber.*pendant|pendant|necklace/.test(text)) return 'amber-pendant'
  if (/portrait|painting/.test(text)) return 'storybook-portrait'
  if (/clock/.test(text)) return 'victorian-mantel-clock'
  if (/window/.test(text)) return 'storybook-bay-window'
  if (/silver.*key|\bkey\b/.test(text)) return 'silver-key'
  if (/fireplace|hearth/.test(text)) return 'fireplace'
  if (/armchair|easy.*chair|lounge.*chair/.test(text)) return 'victorian-armchair'
  if (/chair|seat/.test(text)) return 'chair'
  if (/desk|table/.test(text)) return 'desk'
  if (/hidden.*door|doorway/.test(text)) return 'hidden-door'
  if (/door/.test(text)) return 'story-door'
  if (/lantern|lamp/.test(text)) return 'lantern'
  if (/map|chart|document/.test(text)) return 'map'
  if (/ledger|notebook|journal/.test(text)) return 'aged-leather-notebook'
  if (/horse.*figurine|figurine.*horse/.test(text)) return 'porcelain-horse-figurine'
  if (/drawer/.test(text)) return 'victorian-document-drawers'
  if (/crate|box|chest/.test(text)) return 'crate'
  return undefined
}

function dimensions(entity: WorldEntity): [number, number, number] {
  const text = `${entity.id} ${entity.name}`.toLowerCase()
  if (/canal|waterway|channel/.test(text)) return [6.2, 0.65, 27.4]
  if (/amber.*pendant|pendant|necklace/.test(text)) return [0.22, 0.38, 0.08]
  if (/fireplace|hearth/.test(text)) return [3.8, 3.35, 1.05]
  if (/window/.test(text)) return [3.25, 2.73, 0.33]
  if (/small.*(?:photograph|portrait)|(?:photograph|portrait).*small/.test(text)) return [0.35, 0.45, 0.035]
  if (/portrait|painting/.test(text)) return [2.1, 2.7, 0.21]
  if (/clock/.test(text)) return [0.5, 0.314, 0.184]
  if (/hidden.*door|doorway/.test(text)) return [1.8, 2.9, 0.25]
  if (/door/.test(text)) return [1.44, 2.9, 0.18]
  if (/armchair|easy.*chair|lounge.*chair/.test(text)) return [1.15, 1.45, 1.04]
  if (/chair|seat/.test(text)) return [0.95, 1.55, 0.95]
  if (/desk|table/.test(text)) return [2.4, 1.2, 1.1]
  if (/map|chart/.test(text)) return [0.46, 0.0125, 0.32]
  if (/ledger|notebook|journal/.test(text)) return [0.28, 0.045, 0.36]
  if (/horse.*figurine|figurine.*horse/.test(text)) return [0.34, 0.46, 0.2]
  if (/drawer/.test(text)) return [1.05, 1.12, 0.58]
  if (/\bkey\b/.test(text)) return [0.3, 0.08, 0.12]
  return [0.9, 0.9, 0.9]
}

function semanticPlacementText(entity: WorldEntity): string {
  return `${entity.name} ${entity.currentLocation ?? ''} ${entity.sourceSentence ?? ''}`.toLowerCase()
}

function wallFor(entity: WorldEntity): 'north' | 'south' | 'east' | 'west' | undefined {
  const resolve = (text: string) => {
    if (/\bnorth(?:ern)?\b/.test(text)) return 'north' as const
    if (/\bsouth(?:ern)?\b/.test(text)) return 'south' as const
    if (/\beast(?:ern)?\b/.test(text)) return 'east' as const
    if (/\bwest(?:ern)?\b/.test(text)) return 'west' as const
    return undefined
  }
  return resolve((entity.currentLocation ?? '').toLowerCase())
    ?? resolve((entity.sourceSentence ?? '').toLowerCase())
}

function anchorsToWall(entity: WorldEntity): boolean {
  const text = semanticPlacementText(entity)
  return entityKind(entity) === 'architecture' || /\b(wall|entrance|door|window|fireplace|hearth)\b/.test(text)
}

function namedTarget(entity: WorldEntity, entities: readonly WorldEntity[]): WorldEntity | undefined {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const location = normalize(entity.currentLocation ?? '')
  const directlyNamed = entities.find((candidate) => {
    if (candidate.id === entity.id) return false
    return location.includes(normalize(candidate.name)) || location.includes(normalize(candidate.id))
  })
  if (directlyNamed) return directlyNamed
  if (/\bmantel(?:piece)?\b/.test(location)) {
    return entities.find((candidate) => /fireplace|hearth/.test(`${candidate.id} ${candidate.name}`.toLowerCase()))
  }
  if (/\bsill\b/.test(location)) {
    return entities.find((candidate) => /window/.test(`${candidate.id} ${candidate.name}`.toLowerCase()))
  }
  if (/\bstair\b/.test(location)) {
    return entities.find((candidate) => /stair/.test(`${candidate.id} ${candidate.name}`.toLowerCase()))
  }
  return undefined
}

function wallAxisPosition(entity: WorldEntity, wall: 'north' | 'south' | 'east' | 'west'): number {
  const text = semanticPlacementText(entity)
  const extent = wall === 'north' || wall === 'south' ? BOUNDS[0] : BOUNDS[2]
  if (/\b(left|west(?:ern)?)\b/.test(text)) return -extent * 0.27
  if (/\b(right|east(?:ern)?)\b/.test(text)) return extent * 0.27
  return 0
}

function wallPosition(
  entity: WorldEntity,
  size: Vector3Tuple,
  wall: 'north' | 'south' | 'east' | 'west',
): Vector3Tuple {
  const axis = wallAxisPosition(entity, wall)
  const baseOffset = /window/.test(semanticPlacementText(entity)) ? 1.18 : 0
  return wall === 'north' || wall === 'south'
    ? [axis, size[1] / 2 + baseOffset, 0]
    : [0, size[1] / 2 + baseOffset, axis]
}

function fallbackFloorPosition(entity: WorldEntity, size: Vector3Tuple): Vector3Tuple {
  const text = semanticPlacementText(entity)
  const fallbackX = ((entity.position.x / 1200) - 0.5) * BOUNDS[0] * 0.5
  const fallbackZ = ((entity.position.y / 680) - 0.5) * BOUNDS[2] * 0.5
  const x = /\b(right|east) side\b/.test(text)
    ? BOUNDS[0] * 0.24
    : /\b(left|west) side\b/.test(text)
      ? -BOUNDS[0] * 0.24
      : fallbackX
  const z = /\b(right|east|left|west) side\b/.test(text)
    ? BOUNDS[2] * 0.04
    : fallbackZ
  return [x, size[1] / 2, z]
}

function plannedPosition(
  entity: WorldEntity,
  entities: readonly WorldEntity[],
  size: Vector3Tuple,
): Vector3Tuple | undefined {
  const text = semanticPlacementText(entity)
  const target = namedTarget(entity, entities)
  const targetSize = target ? dimensions(target) : undefined
  const targetWall = target ? wallFor(target) : undefined
  const isSurfacePlacement = /\b(mantel(?:piece)?|sill|on top of|atop)\b/.test(text)

  // A city waterway is a scene-scale circulation feature, not a loose prop.
  // Center it and let the urban kit reserve the corresponding corridor.
  if (/canal|waterway|channel/.test(text)) return [0, size[1] / 2, 0]

  // Hanging objects need a vertical coordinate. The frozen relation set has no
  // "above" predicate, so this development bridge resolves that height here.
  if (/\babove\b/.test(text) && target && targetSize && targetWall) {
    const targetPosition = wallPosition(target, targetSize, targetWall)
    const wallDepth = targetWall === 'north' || targetWall === 'south' ? BOUNDS[2] : BOUNDS[0]
    const wallCoordinate = wallDepth / 2 - size[2] / 2 - 0.2
    const y = Math.min(BOUNDS[1] - size[1] / 2 - 0.35, targetSize[1] + size[1] / 2 + 0.32)
    if (targetWall === 'north') return [targetPosition[0], y, -wallCoordinate]
    if (targetWall === 'south') return [targetPosition[0], y, wallCoordinate]
    if (targetWall === 'east') return [wallCoordinate, y, targetPosition[2]]
    return [-wallCoordinate, y, targetPosition[2]]
  }

  // Small discoveries described beneath furniture belong on its floor plane,
  // not at the height of their legacy 2D diagram marker.
  if (/\b(beneath|under|below)\b/.test(text) && target && targetSize) {
    const targetPosition = plannedPosition(target, entities, targetSize) ?? fallbackFloorPosition(target, targetSize)
    return [targetPosition[0] + targetSize[0] * 0.22, size[1] / 2, targetPosition[2] + targetSize[2] * 0.22]
  }

  if (/\bshelf\b/.test(text)) {
    const x = /\b(east|right)\b/.test(text)
      ? BOUNDS[0] * 0.28
      : /\b(west|left)\b/.test(text)
        ? -BOUNDS[0] * 0.28
        : 0
    const shelfLevel = /\b(?:third|3rd)\b/.test(text) ? 1.9 : /\b(?:fourth|4th)\b/.test(text) ? 2.55 : 1.22
    return [x, shelfLevel + size[1] / 2 + 0.05, -BOUNDS[2] / 2 + 0.62]
  }

  if (target && isSurfacePlacement) return undefined

  const wall = wallFor(entity)
  if (wall && anchorsToWall(entity)) return wallPosition(entity, size, wall)

  // Relation-driven objects remain unpositioned so the layout engine can
  // ground them, avoid overlaps, and orient furniture toward their targets.
  if (target && /\b(beside|near|toward|towards|next to)\b/.test(text)) return undefined

  return fallbackFloorPosition(entity, size)
}

function spatialRelations(entities: readonly WorldEntity[]): SpatialRelation[] {
  return entities.flatMap((entity): SpatialRelation[] => {
    const relations: SpatialRelation[] = []
    const text = semanticPlacementText(entity)
    const wall = wallFor(entity)
    const target = namedTarget(entity, entities)

    if (wall && anchorsToWall(entity) && !/\babove\b/.test(text)) {
      relations.push({
        id: `${entity.id}:against-${wall}-wall`,
        subjectId: entity.id,
        predicate: 'against_wall',
        metadata: { wall },
      })
    }
    if (target && /\b(beside|near|toward|towards|next to)\b/.test(text)) {
      relations.push({
        id: `${entity.id}:near:${target.id}`,
        subjectId: entity.id,
        predicate: 'near',
        objectId: target.id,
        distance: 0.42,
      })
    }
    if (target && /\b(mantel(?:piece)?|sill|on top of|atop)\b/.test(text)) {
      relations.push({
        id: `${entity.id}:on:${target.id}`,
        subjectId: entity.id,
        predicate: 'on',
        objectId: target.id,
      })
    }
    return relations
  })
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
        dressingTags: ['urban-clutter', 'street-lamps', 'market clutter'],
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
        dressingTags: ['books', 'storage-crates', 'archive-clutter', 'interior-rugs', 'interior-lighting'],
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
      dressingTags: ['books', 'storage-crates', 'estate-furnishings', 'interior-rugs', 'interior-lighting'],
      dressingDensity: 'rich',
      mood: 'elegant, secretive and melancholy',
      timeOfDay: 'moonlit evening',
      palette: { background: '#10151a', fog: '#293238', floor: '#7a6250', wall: '#a79b89', timber: '#382b25', ambient: '#c4b8a7', keyLight: '#c8d9e4', practical: '#efa45b' },
      lighting: { warmth: 'neutral', contrast: 'high', ambientIntensity: 0.6, keyIntensity: 1.55, atmosphericEffects: ['window-shaft', 'dust-motes'] },
    },
    colors: { floorColor: '#44362f', wallColor: '#a79b89', ambientColor: '#b5b1a8' },
  }
}

function spatialEntity(entity: WorldEntity, chapter: Chapter, entities: readonly WorldEntity[]): Entity {
  const size = dimensions(entity)
  const position = plannedPosition(entity, entities, size)
  return {
    id: entity.id,
    name: entity.name,
    kind: entityKind(entity),
    locationId: `${chapter.id}:scene`,
    assetKey: assetKey(entity),
    transform: position ? { position } : undefined,
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
  const factual = spatialEntity(entity, chapter, [entity])
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
  // Member 3's inspection graph can contain places as WorldEntity nodes. The
  // 3D contract represents those as locations, not selectable prop meshes.
  // Keeping them out of the entity registry prevents a room from being
  // semantically matched to an unrelated decorative asset.
  const renderableEntities = uiSnapshot.entities.filter((entity) => !isSpatialContainer(entity))
  const spatialSnapshot: SpatialWorldSnapshot = {
    storyId: book.id,
    version,
    passageId: chapter.id,
    locations: [{ id: sceneId, name: `${book.title} — ${chapter.title}`, bounds: BOUNDS, environment: generatedEnvironment.colors }],
    entities: renderableEntities.map((entity) => spatialEntity(entity, chapter, renderableEntities)),
    relations: spatialRelations(renderableEntities),
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
    entities: renderableEntities.map((entity) => visualEntity(entity, chapter)),
    presentationConnections: [],
    unresolvedQuestions: [],
  }
  return { spatialSnapshot, spatialPatch: null, visualPlan }
}
