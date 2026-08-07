import { useEffect, useMemo, useState } from 'react'
import {
  WorldViewer as SpatialWorldViewer,
  compileSceneRecipe,
  type CompiledSceneRecipe,
  type ScenePatch,
  type VisualScenePlan,
  type WorldSnapshot,
  type WorldViewerRuntimeError,
} from '@spatial-runtime'

export interface WorldViewerProps {
  snapshot: WorldSnapshot | null
  patch: ScenePatch | null
  visualPlan: VisualScenePlan | null
  sceneRecipe?: CompiledSceneRecipe | null
  activeLocationId?: string
  resetToken?: number
  renderMode?: 'continuous' | 'on-demand'
  selectedEntityId: string | null
  highlightedEntityIds: string[]
  showChapterChanges: boolean
  onEntitySelect: (id: string | null) => void
  onSceneReady: () => void
  onSceneError: (message: string) => void
  onLocationChange?: (locationId: string) => void
  onPassageAdvance?: () => void
}

function EmptyScene() {
  return (
    <div className="flex h-full items-center justify-center font-mono text-sm" style={{ color: '#6e6354' }}>
      Process this passage to build its explorable world.
    </div>
  )
}

/** Member 3 UI adapter over Member 2's stable public renderer contract. */
export default function WorldViewer({
  snapshot,
  patch,
  visualPlan,
  sceneRecipe,
  activeLocationId,
  resetToken,
  renderMode,
  selectedEntityId,
  onEntitySelect,
  onSceneReady,
  onSceneError,
  onLocationChange,
  onPassageAdvance,
}: WorldViewerProps) {
  const [internalLocationId, setInternalLocationId] = useState(snapshot?.locations[0]?.id ?? '')
  const resolvedLocationId = activeLocationId ?? internalLocationId
  const compiled = useMemo(() => {
    if (!snapshot || !visualPlan) return null
    if (sceneRecipe) return { recipe: sceneRecipe, error: null }
    try {
      return { recipe: compileSceneRecipe(snapshot, visualPlan), error: null }
    } catch (error) {
      return {
        recipe: null,
        error: error instanceof Error ? error.message : 'The spatial scene could not be compiled.',
      }
    }
  }, [sceneRecipe, snapshot, visualPlan])

  useEffect(() => {
    if (!snapshot) return
    setInternalLocationId(snapshot.locations[0]?.id ?? '')
  }, [snapshot?.storyId, snapshot?.version])

  useEffect(() => {
    if (compiled?.error) onSceneError(compiled.error)
  }, [compiled, onSceneError])

  if (!snapshot || !visualPlan) return <EmptyScene />
  if (!compiled?.recipe) return <EmptyScene />

  const handleRuntimeError = (error: WorldViewerRuntimeError) => onSceneError(error.message)

  return (
    <SpatialWorldViewer
      snapshot={snapshot}
      resetToken={resetToken}
      renderMode={renderMode}
      patch={patch}
      visualPlan={visualPlan}
      sceneRecipe={compiled.recipe}
      assetRegistry={compiled.recipe.assetRegistry}
      selectedEntityId={selectedEntityId}
      onEntitySelect={onEntitySelect}
      onRuntimeError={handleRuntimeError}
      onSceneReady={onSceneReady}
      onLocationRequest={locationId => {
        setInternalLocationId(locationId)
        onLocationChange?.(locationId)
      }}
      onPassageAdvance={onPassageAdvance}
      passageActionLabel="Continue reading"
      activeLocationId={resolvedLocationId || snapshot.locations[0]?.id}
      className="member-three-spatial-world"
    />
  )
}
