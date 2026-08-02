import { Clone, Html, Line, MapControls, useGLTF } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react";
import * as THREE from "three";
import {
  ContractValidationError,
  validateScenePatch,
  validateWorldSnapshot,
} from "../contracts/validation";
import type {
  Conflict,
  ScenePatch,
  Vector3Tuple,
  WorldSnapshot,
} from "../contracts/world";
import {
  defaultAssetRegistry,
  type AssetDefinition,
  type AssetRegistry,
} from "../runtime/assetRegistry";
import type { LayoutItem, WorldLayout } from "../runtime/layoutEngine";
import { PatchVersionError } from "../runtime/applyScenePatch";
import {
  clampNavigationTarget,
  createOverviewCameraPose,
  createTravelCameraPose,
} from "../runtime/cameraNavigation";
import {
  createVisibleRelationEdges,
  spatialPredicateLabel,
  type VisibleRelationEdge,
} from "../runtime/spatialAwareness";
import {
  advanceSpatialRuntime,
  clearSpatialRuntimeExits,
  createSpatialRuntime,
  SpatialLocationError,
  switchSpatialRuntimeLocation,
  type SpatialRuntimeState,
} from "../runtime/spatialRuntime";
import "./WorldViewer.css";

export type WorldViewerErrorCode =
  | "INVALID_SNAPSHOT"
  | "INVALID_PATCH"
  | "INVALID_LOCATION"
  | "PATCH_VERSION_MISMATCH"
  | "PATCH_APPLICATION_FAILED";

export interface WorldViewerRuntimeError {
  code: WorldViewerErrorCode;
  message: string;
}

export interface WorldViewerProps {
  snapshot: WorldSnapshot;
  patch?: ScenePatch | null;
  selectedEntityId?: string | null;
  onEntitySelect?: (entityId: string | null) => void;
  onRuntimeError?: (error: WorldViewerRuntimeError) => void;
  /** Optional room selection; defaults to the snapshot's first location. */
  activeLocationId?: string;
  assetRegistry?: AssetRegistry;
  className?: string;
}

type ChangeKind = "added" | "moved" | "changed" | "removed" | undefined;

type CameraCommand =
  | { id: number; kind: "reset" }
  | { id: number; kind: "travel" | "focus"; target: Vector3Tuple };

interface CameraDestination {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

function changeMapFromPatch(patch?: ScenePatch | null): ReadonlyMap<string, ChangeKind> {
  const result = new Map<string, ChangeKind>();
  if (!patch || !Array.isArray(patch.operations)) return result;
  for (const operation of patch?.operations ?? []) {
    if (operation.op === "add_entity") result.set(operation.entity.id, "added");
    if (operation.op === "move_entity") result.set(operation.entityId, "moved");
    if (operation.op === "update_entity") result.set(operation.entityId, "changed");
    if (operation.op === "remove_entity") result.set(operation.entityId, "removed");
  }
  return result;
}

interface ViewerState {
  runtime: SpatialRuntimeState | null;
  error: WorldViewerRuntimeError | null;
}

function runtimeErrorFrom(error: unknown, fallbackCode: WorldViewerErrorCode): WorldViewerRuntimeError {
  if (error instanceof ContractValidationError) {
    return {
      code: error.contract === "WorldSnapshot" ? "INVALID_SNAPSHOT" : "INVALID_PATCH",
      message: error.issues[0] ?? error.message,
    };
  }
  if (error instanceof PatchVersionError) {
    return { code: "PATCH_VERSION_MISMATCH", message: error.message };
  }
  if (error instanceof SpatialLocationError) {
    return { code: "INVALID_LOCATION", message: error.message };
  }
  return {
    code: fallbackCode,
    message: error instanceof Error ? error.message : "The world update could not be applied.",
  };
}

function createViewerState(
  snapshot: WorldSnapshot,
  registry: AssetRegistry,
  activeLocationId?: string,
): ViewerState {
  try {
    return {
      runtime: createSpatialRuntime(
        validateWorldSnapshot(snapshot),
        registry,
        activeLocationId,
      ),
      error: null,
    };
  } catch (error) {
    return { runtime: null, error: runtimeErrorFrom(error, "INVALID_SNAPSHOT") };
  }
}

function PrimitiveGeometry({ asset }: { asset: AssetDefinition }) {
  if (asset.geometry === "sphere") return <sphereGeometry args={[0.5, 24, 16]} />;
  if (asset.geometry === "cylinder") return <cylinderGeometry args={[0.5, 0.5, 1, 20]} />;
  return <boxGeometry args={[1, 1, 1]} />;
}

function PrimitiveAsset({
  asset,
  highlighted,
  highlightColor,
}: {
  asset: AssetDefinition;
  highlighted: boolean;
  highlightColor: string;
}) {
  return (
    <mesh castShadow receiveShadow>
      <PrimitiveGeometry asset={asset} />
      <meshStandardMaterial
        color={asset.color}
        emissive={highlighted ? highlightColor : "#000000"}
        emissiveIntensity={highlighted ? 0.38 : 0}
        roughness={asset.roughness ?? 0.8}
        metalness={asset.metalness ?? 0}
      />
    </mesh>
  );
}

function LoadedModel({ url }: { url: string }) {
  const model = useGLTF(url);
  return <Clone object={model.scene} castShadow receiveShadow />;
}

class ModelErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function EntityAsset({
  asset,
  highlighted,
  highlightColor,
}: {
  asset: AssetDefinition;
  highlighted: boolean;
  highlightColor: string;
}) {
  const fallback = (
    <PrimitiveAsset
      asset={asset}
      highlighted={highlighted}
      highlightColor={highlightColor}
    />
  );

  if (!asset.modelUrl) return fallback;

  return (
    <ModelErrorBoundary key={asset.modelUrl} fallback={fallback}>
      <Suspense fallback={fallback}>
        <LoadedModel url={asset.modelUrl} />
      </Suspense>
    </ModelErrorBoundary>
  );
}

function WorldEntity({
  item,
  selected,
  change,
  onSelect,
}: {
  item: LayoutItem;
  selected: boolean;
  change: ChangeKind;
  onSelect?: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const initialPosition = useRef<THREE.Vector3>(null);
  initialPosition.current ??= new THREE.Vector3(...item.position);
  const targetPosition = useMemo(() => new THREE.Vector3(...item.position), [item.position]);
  const resolvedScale = useMemo(
    () =>
      new THREE.Vector3(
        item.dimensions[0] * item.scale[0],
        item.dimensions[1] * item.scale[1],
        item.dimensions[2] * item.scale[2],
      ),
    [item.dimensions, item.scale],
  );
  const targetScale = useMemo(
    () => (change === "removed" ? new THREE.Vector3(0.001, 0.001, 0.001) : resolvedScale),
    [change, resolvedScale],
  );
  const initialScale = useRef<THREE.Vector3>(null);
  initialScale.current ??=
    change === "added" ? new THREE.Vector3(0.05, 0.05, 0.05) : resolvedScale.clone();

  useFrame((_, delta) => {
    if (!group.current) return;
    const alpha = 1 - Math.exp(-delta * 8);
    group.current.position.lerp(targetPosition, alpha);
    group.current.scale.lerp(targetScale, alpha);
  });

  const highlighted = selected || change !== undefined;
  const emissive = selected
    ? "#54e7d5"
    : change === "added"
      ? "#79ef9b"
      : change === "removed"
        ? "#ef6f6c"
        : "#ffb84d";

  return (
    <group
      ref={group}
      name={item.entity.id}
      position={initialPosition.current}
      rotation={item.rotation}
      scale={initialScale.current}
      onPointerDown={onSelect}
      userData={{ entityId: item.entity.id, assetKey: item.asset.key }}
    >
      <EntityAsset asset={item.asset} highlighted={highlighted} highlightColor={emissive} />
      {highlighted && (
        <mesh scale={[1.04, 1.04, 1.04]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial
            color={emissive}
            wireframe
            transparent
            opacity={selected ? 0.74 : 0.42}
          />
        </mesh>
      )}
    </group>
  );
}

function Room({
  layout,
  onGroundNavigate,
}: {
  layout: WorldLayout;
  onGroundNavigate: (target: Vector3Tuple) => void;
}) {
  const bounds = layout.location.bounds ?? [12, 4.5, 10];
  const environment = layout.location.environment;
  const wallThickness = 0.12;

  return (
    <group>
      <mesh
        position={[0, -0.06, 0]}
        receiveShadow
        onDoubleClick={(event) => {
          event.stopPropagation();
          onGroundNavigate([event.point.x, 0.9, event.point.z]);
        }}
      >
        <boxGeometry args={[bounds[0], 0.12, bounds[2]]} />
        <meshStandardMaterial color={environment?.floorColor ?? "#3c3935"} roughness={1} />
      </mesh>
      <mesh position={[0, bounds[1] / 2, -bounds[2] / 2]} receiveShadow>
        <boxGeometry args={[bounds[0], bounds[1], wallThickness]} />
        <meshStandardMaterial color={environment?.wallColor ?? "#b7aa98"} roughness={1} />
      </mesh>
      <mesh position={[-bounds[0] / 2, bounds[1] / 2, 0]} receiveShadow>
        <boxGeometry args={[wallThickness, bounds[1], bounds[2]]} />
        <meshStandardMaterial color={environment?.wallColor ?? "#b7aa98"} roughness={1} />
      </mesh>
      <gridHelper args={[Math.max(bounds[0], bounds[2]), 20, "#70685f", "#4b4742"]} />
    </group>
  );
}

function tupleFromVector(vector: THREE.Vector3): Vector3Tuple {
  return [vector.x, vector.y, vector.z];
}

function SceneCamera({
  layout,
  command,
}: {
  layout: WorldLayout;
  command: CameraCommand | null;
}) {
  const { camera } = useThree();
  const controls = useRef<ComponentRef<typeof MapControls>>(null);
  const destination = useRef<CameraDestination | null>(null);
  const bounds = layout.location.bounds ?? [12, 4.5, 10];

  useEffect(() => {
    const overview = createOverviewCameraPose(bounds);
    destination.current = null;
    camera.position.set(...overview.position);
    controls.current?.target.set(...overview.target);
    controls.current?.update();
    camera.lookAt(new THREE.Vector3(...overview.target));
    camera.updateProjectionMatrix();
  }, [bounds[0], bounds[1], bounds[2], camera, layout.location.id]);

  useEffect(() => {
    const currentControls = controls.current;
    if (!command || !currentControls) return;
    const pose =
      command.kind === "reset"
        ? createOverviewCameraPose(bounds)
        : createTravelCameraPose(
            tupleFromVector(camera.position),
            tupleFromVector(currentControls.target),
            command.target,
            bounds,
          );
    destination.current = {
      position: new THREE.Vector3(...pose.position),
      target: new THREE.Vector3(...pose.target),
    };
  }, [bounds[0], bounds[1], bounds[2], camera, command]);

  useFrame((_, delta) => {
    const currentControls = controls.current;
    const next = destination.current;
    if (!currentControls || !next) return;
    const alpha = 1 - Math.exp(-delta * 5.5);
    camera.position.lerp(next.position, alpha);
    currentControls.target.lerp(next.target, alpha);
    currentControls.update();
    if (
      camera.position.distanceToSquared(next.position) < 0.0004 &&
      currentControls.target.distanceToSquared(next.target) < 0.0004
    ) {
      camera.position.copy(next.position);
      currentControls.target.copy(next.target);
      destination.current = null;
    }
  });

  return (
    <MapControls
      ref={controls}
      key={layout.location.id}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan
      screenSpacePanning={false}
      zoomToCursor
      minDistance={3}
      maxDistance={Math.max(18, Math.max(bounds[0], bounds[2]) * 2)}
      maxPolarAngle={Math.PI / 2.02}
      target={createOverviewCameraPose(bounds).target}
      onStart={() => {
        destination.current = null;
      }}
      onChange={() => {
        const currentControls = controls.current;
        if (!currentControls) return;
        const bounded = new THREE.Vector3(
          ...clampNavigationTarget(tupleFromVector(currentControls.target), bounds),
        );
        const correction = bounded.sub(currentControls.target);
        if (correction.lengthSq() === 0) return;
        currentControls.target.add(correction);
        camera.position.add(correction);
      }}
    />
  );
}

function RelationAwareness({ edges }: { edges: readonly VisibleRelationEdge[] }) {
  return edges.map((edge, index) => (
    <group key={edge.relation.id}>
      <Line
        points={[edge.from, edge.to]}
        color="#69dfce"
        lineWidth={1.8}
        transparent
        opacity={0.82}
      />
      <Html
        center
        position={[
          edge.midpoint[0],
          edge.midpoint[1] + index * 0.22,
          edge.midpoint[2],
        ]}
        distanceFactor={9}
        style={{ pointerEvents: "none" }}
      >
        <span className="world-relation-label">
          {spatialPredicateLabel(edge.relation.predicate)}
        </span>
      </Html>
    </group>
  ));
}

function ConflictMarkers({
  layout,
  conflicts,
}: {
  layout: WorldLayout;
  conflicts: readonly Conflict[];
}) {
  const conflictEntityIds = new Set(
    conflicts.flatMap((conflict) => (conflict.entityId ? [conflict.entityId] : [])),
  );
  return layout.items.flatMap((item) =>
    conflictEntityIds.has(item.entity.id)
      ? [
          <Html
            key={item.entity.id}
            center
            position={[
              item.position[0],
              item.position[1] + item.dimensions[1] * 0.9 + 0.75,
              item.position[2],
            ]}
            distanceFactor={9}
            style={{ pointerEvents: "none" }}
          >
            <span className="world-conflict-marker" title="Needs review">!</span>
          </Html>,
        ]
      : [],
  );
}

function WorldScene({
  layout,
  exitingItems,
  selectedEntityId,
  changes,
  onEntitySelect,
  cameraCommand,
  onCameraCommand,
  relationEdges,
  openConflicts,
}: {
  layout: WorldLayout;
  exitingItems: readonly LayoutItem[];
  selectedEntityId?: string | null;
  changes: ReadonlyMap<string, ChangeKind>;
  onEntitySelect?: (entityId: string | null) => void;
  cameraCommand: CameraCommand | null;
  onCameraCommand: (kind: "travel" | "focus", target: Vector3Tuple) => void;
  relationEdges: readonly VisibleRelationEdge[];
  openConflicts: readonly Conflict[];
}) {
  const ambientColor = layout.location.environment?.ambientColor ?? "#d9d2c5";

  return (
    <>
      <color attach="background" args={["#171b20"]} />
      <ambientLight color={ambientColor} intensity={1.25} />
      <directionalLight
        castShadow
        position={[4, 8, 5]}
        intensity={2.2}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <Room
        layout={layout}
        onGroundNavigate={(target) => onCameraCommand("travel", target)}
      />
      {layout.items.map((item) => (
        <WorldEntity
          key={item.entity.id}
          item={item}
          selected={selectedEntityId === item.entity.id}
          change={changes.get(item.entity.id)}
          onSelect={(event) => {
            event.stopPropagation();
            onEntitySelect?.(item.entity.id);
          }}
        />
      ))}
      {exitingItems.map((item) => (
        <WorldEntity
          key={`exiting:${item.entity.id}`}
          item={item}
          selected={false}
          change="removed"
        />
      ))}
      <RelationAwareness edges={relationEdges} />
      <ConflictMarkers layout={layout} conflicts={openConflicts} />
      {cameraCommand?.kind === "travel" && (
        <mesh
          position={[cameraCommand.target[0], 0.015, cameraCommand.target[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.18, 0.28, 32]} />
          <meshBasicMaterial color="#69dfce" transparent opacity={0.8} />
        </mesh>
      )}
      <SceneCamera layout={layout} command={cameraCommand} />
    </>
  );
}

/**
 * Reusable renderer contract owned by Member 2. A snapshot initializes the
 * scene; each new, version-compatible patch is reduced into that mounted scene.
 */
export function WorldViewer({
  snapshot,
  patch,
  selectedEntityId,
  onEntitySelect,
  onRuntimeError,
  activeLocationId,
  assetRegistry = defaultAssetRegistry,
  className,
}: WorldViewerProps) {
  const [viewer, setViewer] = useState(() =>
    createViewerState(snapshot, assetRegistry, activeLocationId),
  );
  const [cameraCommand, setCameraCommand] = useState<CameraCommand | null>(null);
  const cameraCommandId = useRef(0);
  const appliedPatch = useRef<string | null>(null);

  const requestCamera = useCallback((kind: "travel" | "focus", target: Vector3Tuple) => {
    cameraCommandId.current += 1;
    setCameraCommand({ id: cameraCommandId.current, kind, target });
  }, []);

  const resetCamera = useCallback(() => {
    cameraCommandId.current += 1;
    setCameraCommand({ id: cameraCommandId.current, kind: "reset" });
  }, []);

  useEffect(() => {
    setViewer(createViewerState(snapshot, assetRegistry, activeLocationId));
    appliedPatch.current = null;
  }, [snapshot.storyId, snapshot.version, assetRegistry]);

  useEffect(() => {
    if (!activeLocationId) return;
    setCameraCommand(null);
    setViewer((current) => {
      if (!current.runtime) return current;
      try {
        return {
          runtime: switchSpatialRuntimeLocation(
            current.runtime,
            activeLocationId,
            assetRegistry,
          ),
          error: null,
        };
      } catch (error) {
        return { ...current, error: runtimeErrorFrom(error, "INVALID_LOCATION") };
      }
    });
  }, [activeLocationId, assetRegistry]);

  useEffect(() => {
    if (!patch) return;
    let validatedPatch: ScenePatch;
    try {
      validatedPatch = validateScenePatch(patch);
    } catch (error) {
      setViewer((current) => ({
        ...current,
        error: runtimeErrorFrom(error, "INVALID_PATCH"),
      }));
      return;
    }
    const patchKey = `${validatedPatch.fromVersion}:${validatedPatch.toVersion}`;
    if (appliedPatch.current === patchKey) {
      setViewer((current) => (current.error ? { ...current, error: null } : current));
      return;
    }
    setViewer((current) => {
      if (!current.runtime) return current;
      try {
        const runtime = advanceSpatialRuntime(current.runtime, validatedPatch, assetRegistry);
        appliedPatch.current = patchKey;
        return { runtime, error: null };
      } catch (error) {
        return {
          ...current,
          error: runtimeErrorFrom(error, "PATCH_APPLICATION_FAILED"),
        };
      }
    });
  }, [patch, assetRegistry]);

  useEffect(() => {
    if (!viewer.runtime || viewer.runtime.exitingItems.length === 0) return;
    const version = viewer.runtime.snapshot.version;
    const timeout = window.setTimeout(() => {
      setViewer((current) => {
        if (!current.runtime || current.runtime.snapshot.version !== version) return current;
        return { ...current, runtime: clearSpatialRuntimeExits(current.runtime) };
      });
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [viewer.runtime?.exitingItems.length, viewer.runtime?.snapshot.version]);

  useEffect(() => {
    if (viewer.error) onRuntimeError?.(viewer.error);
  }, [onRuntimeError, viewer.error]);

  useEffect(() => {
    if (!selectedEntityId || !viewer.runtime) return;
    const selectedItem = viewer.runtime.layout.items.find(
      (item) => item.entity.id === selectedEntityId,
    );
    if (selectedItem) requestCamera("focus", selectedItem.position);
  }, [requestCamera, selectedEntityId, viewer.runtime?.layout]);

  const changes = useMemo(
    () => (viewer.error ? new Map<string, ChangeKind>() : changeMapFromPatch(patch)),
    [patch, viewer.error],
  );
  const runtime = viewer.runtime;
  const relationEdges = useMemo(
    () =>
      runtime
        ? createVisibleRelationEdges(
            runtime.layout,
            runtime.snapshot.relations,
            selectedEntityId,
          )
        : [],
    [runtime?.layout, runtime?.snapshot.relations, selectedEntityId],
  );
  const openConflicts = useMemo(
    () => runtime?.snapshot.conflicts.filter((conflict) => conflict.status === "open") ?? [],
    [runtime?.snapshot.conflicts],
  );

  return (
    <div
      className={["world-viewer", className].filter(Boolean).join(" ")}
      data-runtime-status={viewer.error ? "error" : "ready"}
      data-story-id={runtime?.snapshot.storyId ?? "invalid"}
      data-world-version={runtime?.snapshot.version ?? "invalid"}
      data-location-id={runtime?.layout.location.id ?? "invalid"}
      data-navigation-mode="map"
      data-visible-relations={relationEdges.length}
      data-open-conflicts={openConflicts.length}
      style={{ width: "100%", height: "100%", minHeight: 360 }}
    >
      {runtime ? (
        <Canvas
          shadows
          dpr={[1, 1.75]}
          camera={{ position: [8, 7, 9], fov: 48, near: 0.1, far: 100 }}
          onPointerMissed={() => onEntitySelect?.(null)}
        >
          <WorldScene
            layout={runtime.layout}
            exitingItems={runtime.exitingItems}
            selectedEntityId={selectedEntityId}
            changes={changes}
            onEntitySelect={onEntitySelect}
            cameraCommand={cameraCommand}
            onCameraCommand={requestCamera}
            relationEdges={relationEdges}
            openConflicts={openConflicts}
          />
        </Canvas>
      ) : (
        <div className="world-runtime-empty">The supplied world snapshot cannot be rendered.</div>
      )}
      {runtime && (
        <button
          type="button"
          className="world-camera-reset"
          onClick={() => {
            resetCamera();
            onEntitySelect?.(null);
          }}
        >
          Reset view
        </button>
      )}
      {!viewer.error && openConflicts.length > 0 && (
        <div className="world-conflict-summary" role="status">
          <strong>{openConflicts.length}</strong>
          <span>{openConflicts.length === 1 ? "unresolved world fact" : "unresolved world facts"}</span>
        </div>
      )}
      {viewer.error && (
        <div className="world-runtime-error" role="alert" data-error-code={viewer.error.code}>
          <strong>World update paused</strong>
          <span>{viewer.error.message}</span>
        </div>
      )}
    </div>
  );
}
