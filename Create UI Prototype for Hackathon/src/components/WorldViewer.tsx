import { useEffect, useMemo } from 'react'
import {
  WorldViewer as SpatialWorldViewer,
  compileSceneRecipe,
  type ScenePatch,
  type VisualScenePlan,
  type WorldSnapshot,
  type WorldViewerRuntimeError,
} from '@spatial-runtime'

export interface WorldViewerProps {
  snapshot: WorldSnapshot | null
  patch: ScenePatch | null
  visualPlan: VisualScenePlan | null
  selectedEntityId: string | null
  highlightedEntityIds: string[]
  showChapterChanges: boolean
  onEntitySelect: (id: string | null) => void
  onSceneReady: () => void
  onSceneError: (message: string) => void
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
  selectedEntityId,
  onEntitySelect,
  onSceneReady,
  onSceneError,
  onPassageAdvance,
}: WorldViewerProps) {
  const compiled = useMemo(() => {
    if (!snapshot || !visualPlan) return null
    try {
      return { recipe: compileSceneRecipe(snapshot, visualPlan), error: null }
    } catch (error) {
      return {
        recipe: null,
        error: error instanceof Error ? error.message : 'The spatial scene could not be compiled.',
      }
    }
  }, [snapshot, visualPlan])

  useEffect(() => {
    if (compiled?.error) onSceneError(compiled.error)
    else if (compiled?.recipe) onSceneReady()
  }, [compiled, onSceneError, onSceneReady])

  if (!snapshot || !visualPlan) return <EmptyScene />
  if (!compiled?.recipe) return <EmptyScene />

  const handleRuntimeError = (error: WorldViewerRuntimeError) => onSceneError(error.message)

  return (
    <SpatialWorldViewer
      snapshot={snapshot}
      patch={patch}
      visualPlan={visualPlan}
      sceneRecipe={compiled.recipe}
      assetRegistry={compiled.recipe.assetRegistry}
      selectedEntityId={selectedEntityId}
      onEntitySelect={onEntitySelect}
      onRuntimeError={handleRuntimeError}
      onPassageAdvance={onPassageAdvance}
      passageActionLabel="Continue reading"
      activeLocationId={snapshot.locations[0]?.id}
      className="member-three-spatial-world"
    />
  )
}
