import {
  CameraControls,
  CameraControlsImpl,
  Clone,
  Html,
  Line,
  PerformanceMonitor,
  useGLTF,
} from "@react-three/drei";
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
  Location,
  ScenePatch,
  Vector3Tuple,
  WorldSnapshot,
} from "../contracts/world";
import type { VisualScenePlan } from "../contracts/visualScenePlan";
import {
  defaultAssetRegistry,
  type AssetDefinition,
  type AssetRegistry,
} from "../runtime/assetRegistry";
import type { LayoutItem, WorldLayout } from "../runtime/layoutEngine";
import { PatchVersionError } from "../runtime/applyScenePatch";
import {
  createOverviewCameraPose,
  createTravelCameraPose,
} from "../runtime/cameraNavigation";
import {
  createVisibleRelationEdges,
  spatialPredicateLabel,
  type VisibleRelationEdge,
} from "../runtime/spatialAwareness";
import {
  qualityForPerformanceFactor,
  renderQualityProfiles,
  type RenderQuality,
} from "../runtime/renderQuality";
import {
  compileScenePresentation,
  createFallbackScenePresentation,
  type ScenePresentation,
} from "../runtime/sceneCompiler";
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
  visualPlan?: VisualScenePlan;
  selectedEntityId?: string | null;
  onEntitySelect?: (entityId: string | null) => void;
  onRuntimeError?: (error: WorldViewerRuntimeError) => void;
  onPatchApplied?: (snapshot: WorldSnapshot, patch: ScenePatch) => void;
  onLocationRequest?: (locationId: string) => void;
  /** Optional room selection; defaults to the snapshot's first location. */
  activeLocationId?: string;
  assetRegistry?: AssetRegistry;
  className?: string;
}

type ChangeKind = "added" | "moved" | "changed" | "removed" | undefined;

type CameraCommand =
  | { id: number; kind: "reset" }
  | { id: number; kind: "travel" | "focus"; target: Vector3Tuple };

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
  const normalization = useMemo(() => {
    model.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model.scene);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    return {
      offset: center.multiplyScalar(-1),
      scale: new THREE.Vector3(
        size.x > 0 ? 1 / size.x : 1,
        size.y > 0 ? 1 / size.y : 1,
        size.z > 0 ? 1 / size.z : 1,
      ),
    };
  }, [model.scene]);

  return (
    <group scale={normalization.scale}>
      <Clone
        object={model.scene}
        position={normalization.offset}
        castShadow
        receiveShadow
      />
    </group>
  );
}

function usePbrSurface(
  colorPath: string,
  normalPath: string,
  armPath: string,
  repeat: [number, number],
) {
  const textures = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const configure = (texture: THREE.Texture, isColor = false) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(...repeat);
      texture.anisotropy = 8;
      if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };
    return {
      color: configure(loader.load(colorPath), true),
      normal: configure(loader.load(normalPath)),
      arm: configure(loader.load(armPath)),
    };
  }, [armPath, colorPath, normalPath, repeat[0], repeat[1]]);

  useEffect(
    () => () => Object.values(textures).forEach((texture) => texture.dispose()),
    [textures],
  );
  return textures;
}

function useStoryTexture(path: string) {
  const texture = useMemo(() => {
    const loaded = new THREE.TextureLoader().load(path);
    loaded.colorSpace = THREE.SRGBColorSpace;
    loaded.wrapS = THREE.ClampToEdgeWrapping;
    loaded.wrapT = THREE.ClampToEdgeWrapping;
    loaded.anisotropy = 8;
    return loaded;
  }, [path]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function StoryRug({ highlighted, highlightColor }: {
  highlighted: boolean;
  highlightColor: string;
}) {
  const surface = usePbrSurface(
    "/textures/story/faded-red-rug-v1.png",
    "/textures/polyhaven/dirty_carpet_nor_gl_1k.jpg",
    "/textures/polyhaven/dirty_carpet_arm_1k.jpg",
    [1, 1],
  );

  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1, 0.18, 1]} />
        <meshStandardMaterial
          color="#9d7658"
          roughness={0.96}
          emissive={highlighted ? highlightColor : "#000000"}
          emissiveIntensity={highlighted ? 0.3 : 0}
        />
      </mesh>
      <mesh position={[0, 0.105, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.88, 0.07, 0.84]} />
        <meshStandardMaterial
          color="#ffffff"
          map={surface.color}
          normalMap={surface.normal}
          normalScale={new THREE.Vector2(0.72, 0.72)}
          roughnessMap={surface.arm}
          roughness={1}
          emissive={highlighted ? highlightColor : "#000000"}
          emissiveIntensity={highlighted ? 0.24 : 0}
        />
      </mesh>
      {Array.from({ length: 11 }, (_, index) => {
        const x = -0.44 + index * 0.088;
        return [-0.54, 0.54].map((z) => (
          <mesh key={`${index}:${z}`} position={[x, 0, z]}>
            <boxGeometry args={[0.018, 0.06, 0.11]} />
            <meshStandardMaterial color="#c9ad7d" roughness={1} />
          </mesh>
        ));
      })}
    </group>
  );
}

function StoryMap({ highlighted, highlightColor }: {
  highlighted: boolean;
  highlightColor: string;
}) {
  const mapTexture = useStoryTexture("/textures/story/antique-map-v1.png");

  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1, 0.72, 1]} />
        <meshStandardMaterial color="#b58d50" roughness={0.94} />
      </mesh>
      <mesh position={[0, 0.375, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.98, 0.98]} />
        <meshStandardMaterial
          map={mapTexture}
          roughness={0.92}
          emissive={highlighted ? highlightColor : "#000000"}
          emissiveIntensity={highlighted ? 0.2 : 0}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
    </group>
  );
}

function StoryFireplace({ highlighted, highlightColor }: {
  highlighted: boolean;
  highlightColor: string;
}) {
  const surface = usePbrSurface(
    "/textures/polyhaven/castle_wall_slates_diff_1k.jpg",
    "/textures/polyhaven/castle_wall_slates_nor_gl_1k.jpg",
    "/textures/polyhaven/castle_wall_slates_arm_1k.jpg",
    [1.35, 1.35],
  );
  const stoneMaterial = (
    <meshStandardMaterial
      color="#aaa49b"
      map={surface.color}
      normalMap={surface.normal}
      normalScale={new THREE.Vector2(0.62, 0.62)}
      roughnessMap={surface.arm}
      roughness={0.98}
      emissive={highlighted ? highlightColor : "#000000"}
      emissiveIntensity={highlighted ? 0.22 : 0}
    />
  );

  return (
    <group>
      <mesh position={[0, 0.02, -0.08]} castShadow receiveShadow>
        <boxGeometry args={[0.98, 0.92, 0.28]} />
        {stoneMaterial}
      </mesh>
      <mesh position={[0, -0.1, 0.075]}>
        <boxGeometry args={[0.53, 0.57, 0.035]} />
        <meshStandardMaterial color="#100b08" roughness={1} />
      </mesh>
      {[-0.39, 0.39].map((x) => (
        <mesh key={x} position={[x, -0.08, 0.13]} castShadow receiveShadow>
          <boxGeometry args={[0.2, 0.72, 0.36]} />
          {stoneMaterial}
        </mesh>
      ))}
      <mesh position={[0, 0.39, 0.15]} castShadow receiveShadow>
        <boxGeometry args={[1, 0.18, 0.48]} />
        {stoneMaterial}
      </mesh>
      <mesh position={[0, -0.43, 0.2]} castShadow receiveShadow>
        <boxGeometry args={[1, 0.14, 0.64]} />
        {stoneMaterial}
      </mesh>
      {[-0.14, 0.14].map((x) => (
        <mesh key={x} position={[x, -0.34, 0.25]} rotation={[0, 0, x * 1.6]} castShadow>
          <cylinderGeometry args={[0.055, 0.075, 0.42, 10]} />
          <meshStandardMaterial color="#392218" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function PeriodCrate({
  position,
  rotation = [0, 0, 0],
  scale,
}: {
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
  scale: Vector3Tuple;
}) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <Suspense fallback={null}>
        <LoadedModel url="/models/polyhaven/wooden_crate_01/wooden_crate_01_1k.gltf" />
      </Suspense>
    </group>
  );
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

  if (asset.key === "rug") {
    return <StoryRug highlighted={highlighted} highlightColor={highlightColor} />;
  }

  if (asset.key === "fireplace") {
    return <StoryFireplace highlighted={highlighted} highlightColor={highlightColor} />;
  }

  if (asset.key === "map") {
    return <StoryMap highlighted={highlighted} highlightColor={highlightColor} />;
  }

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
  onActivate,
}: {
  item: LayoutItem;
  selected: boolean;
  change: ChangeKind;
  onSelect?: (event: ThreeEvent<PointerEvent>) => void;
  onActivate?: (event: ThreeEvent<PointerEvent>) => void;
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
      onPointerDown={onActivate ?? onSelect}
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
  presentation,
  onGroundNavigate,
}: {
  layout: WorldLayout;
  presentation: ScenePresentation;
  onGroundNavigate: (target: Vector3Tuple) => void;
}) {
  const bounds = layout.location.bounds ?? [12, 4.5, 10];
  const wallThickness = 0.12;
  const usesAtticKit = presentation.architecture.timberFrame;
  const usesArchiveKit = presentation.architecture.archiveShelves;
  const roomTextures = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const load = (path: string, repeat: [number, number], color = false) => {
      const texture = loader.load(path);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(...repeat);
      texture.anisotropy = 8;
      if (color) texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };

    return {
      wallColor: load(
        "/textures/polyhaven/plastered_wall_03_diff_1k.jpg",
        [2.7, 1.45],
        true,
      ),
      wallNormal: load(
        "/textures/polyhaven/plastered_wall_03_nor_gl_1k.jpg",
        [2.7, 1.45],
      ),
      wallArm: load(
        "/textures/polyhaven/plastered_wall_03_arm_1k.jpg",
        [2.7, 1.45],
      ),
      floorColor: load(
        "/textures/polyhaven/dark_wooden_planks_diff_1k.jpg",
        [3.2, 3.2],
        true,
      ),
      floorNormal: load(
        "/textures/polyhaven/dark_wooden_planks_nor_gl_1k.jpg",
        [3.2, 3.2],
      ),
      floorArm: load(
        "/textures/polyhaven/dark_wooden_planks_arm_1k.jpg",
        [3.2, 3.2],
      ),
    };
  }, []);
  const rearStuds = Array.from({ length: 7 }, (_, index) =>
    -bounds[0] / 2 + (bounds[0] / 6) * index,
  );
  const sideStuds = Array.from({ length: 6 }, (_, index) =>
    -bounds[2] / 2 + (bounds[2] / 5) * index,
  );
  const wallTop = bounds[1] * 0.72;
  const archiveFloorTiles = Array.from({ length: 8 * 7 }, (_, index) => ({
    x: index % 8,
    z: Math.floor(index / 8),
  }));
  const archiveShelfCenters = [-bounds[0] * 0.28, 0, bounds[0] * 0.28];
  const archiveShelfLevels = [0.55, 1.22, 1.89, 2.56];

  useEffect(
    () => () => Object.values(roomTextures).forEach((texture) => texture.dispose()),
    [roomTextures],
  );

  return (
    <group
      onDoubleClick={(event) => {
        event.stopPropagation();
        onGroundNavigate([event.point.x, 0.9, event.point.z]);
      }}
    >
      <mesh
        position={[0, -0.06, 0]}
        receiveShadow
      >
        <boxGeometry args={[bounds[0], 0.12, bounds[2]]} />
        <meshStandardMaterial color={presentation.palette.floor} roughness={1} />
      </mesh>
      <mesh position={[0, bounds[1] / 2, -bounds[2] / 2]} receiveShadow>
        <boxGeometry args={[bounds[0], bounds[1], wallThickness]} />
        <meshStandardMaterial
          color={presentation.architecture.plasterWalls ? "#d3c5aa" : presentation.palette.wall}
          map={presentation.architecture.plasterWalls ? roomTextures.wallColor : undefined}
          normalMap={presentation.architecture.plasterWalls ? roomTextures.wallNormal : undefined}
          normalScale={new THREE.Vector2(0.48, 0.48)}
          roughnessMap={presentation.architecture.plasterWalls ? roomTextures.wallArm : undefined}
          roughness={0.98}
        />
      </mesh>
      <mesh position={[-bounds[0] / 2, bounds[1] / 2, 0]} receiveShadow>
        <boxGeometry args={[wallThickness, bounds[1], bounds[2]]} />
        <meshStandardMaterial
          color={presentation.architecture.plasterWalls ? "#d3c5aa" : presentation.palette.wall}
          map={presentation.architecture.plasterWalls ? roomTextures.wallColor : undefined}
          normalMap={presentation.architecture.plasterWalls ? roomTextures.wallNormal : undefined}
          normalScale={new THREE.Vector2(0.48, 0.48)}
          roughnessMap={presentation.architecture.plasterWalls ? roomTextures.wallArm : undefined}
          roughness={0.98}
        />
      </mesh>
      {usesAtticKit ? (
        <>
          {presentation.architecture.floorboards && (
            <mesh position={[0, 0.012, 0]} receiveShadow>
              <boxGeometry args={[bounds[0] - 0.08, 0.025, bounds[2] - 0.08]} />
              <meshStandardMaterial
                color="#a98d76"
                map={roomTextures.floorColor}
                normalMap={roomTextures.floorNormal}
                normalScale={new THREE.Vector2(0.55, 0.55)}
                roughnessMap={roomTextures.floorArm}
                roughness={0.96}
              />
            </mesh>
          )}
          <mesh position={[0, 0.18, -bounds[2] / 2 + 0.1]} castShadow receiveShadow>
            <boxGeometry args={[bounds[0], 0.34, 0.18]} />
            <meshStandardMaterial color={presentation.palette.timber} roughness={0.96} />
          </mesh>
          <mesh position={[-bounds[0] / 2 + 0.1, 0.18, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.18, 0.34, bounds[2]]} />
            <meshStandardMaterial color={presentation.palette.timber} roughness={0.96} />
          </mesh>
          {rearStuds.map((x, index) => (
            <mesh
              key={`rear-stud-${index}`}
              position={[x, wallTop / 2, -bounds[2] / 2 + 0.055]}
              castShadow
            >
              <boxGeometry args={[0.16, wallTop, 0.18]} />
              <meshStandardMaterial color={presentation.palette.timber} roughness={0.94} />
            </mesh>
          ))}
          {sideStuds.map((z, index) => (
            <mesh
              key={`side-stud-${index}`}
              position={[-bounds[0] / 2 + 0.055, wallTop / 2, z]}
              castShadow
            >
              <boxGeometry args={[0.18, wallTop, 0.16]} />
              <meshStandardMaterial color={presentation.palette.timber} roughness={0.94} />
            </mesh>
          ))}
          <mesh position={[0, wallTop, -bounds[2] / 2 + 0.04]} castShadow>
            <boxGeometry args={[bounds[0], 0.2, 0.22]} />
            <meshStandardMaterial color={presentation.palette.timber} roughness={0.95} />
          </mesh>
          <mesh position={[-bounds[0] / 2 + 0.04, wallTop, 0]} castShadow>
            <boxGeometry args={[0.22, 0.2, bounds[2]]} />
            <meshStandardMaterial color={presentation.palette.timber} roughness={0.95} />
          </mesh>
          <group
            visible={presentation.architecture.window}
            position={[-bounds[0] * 0.31, bounds[1] * 0.61, -bounds[2] / 2 + 0.075]}
          >
            <mesh>
              <planeGeometry args={[1.75, 1.45]} />
              <meshStandardMaterial
                color="#91a6ad"
                emissive="#9cc7d1"
                emissiveIntensity={0.52}
                roughness={0.32}
              />
            </mesh>
            <mesh position={[0, 0, 0.025]}>
              <boxGeometry args={[0.1, 1.65, 0.08]} />
              <meshStandardMaterial color="#30221c" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0, 0.03]}>
              <boxGeometry args={[1.95, 0.1, 0.08]} />
              <meshStandardMaterial color="#30221c" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.79, 0.02]}>
              <boxGeometry args={[2.05, 0.14, 0.12]} />
              <meshStandardMaterial color="#2b1e18" roughness={0.95} />
            </mesh>
            <mesh position={[0, -0.79, 0.02]}>
              <boxGeometry args={[2.05, 0.14, 0.12]} />
              <meshStandardMaterial color="#2b1e18" roughness={0.95} />
            </mesh>
          </group>
          <group
            visible={presentation.dressing.storageCrates}
            position={[-bounds[0] * 0.38, 0, bounds[2] * 0.3]}
          >
            <PeriodCrate position={[0, 0.42, 0]} scale={[1.38, 0.84, 1.08]} />
            <PeriodCrate
              position={[0.48, 1.18, -0.05]}
              rotation={[0, 0.18, 0.08]}
              scale={[0.92, 0.62, 0.76]}
            />
          </group>
          <group
            visible={presentation.dressing.travelChest}
            position={[bounds[0] * 0.37, 0, bounds[2] * 0.27]}
          >
            <PeriodCrate
              position={[0, 0.48, 0]}
              rotation={[0, -0.08, 0]}
              scale={[2.05, 0.96, 1.12]}
            />
          </group>
          <group
            visible={presentation.dressing.books}
            position={[-bounds[0] / 2 + 0.38, 1.65, -0.25]}
            rotation={[0, Math.PI / 2, 0]}
          >
            <mesh castShadow>
              <boxGeometry args={[2.7, 0.13, 0.62]} />
              <meshStandardMaterial color="#4a3226" roughness={0.94} />
            </mesh>
            {Array.from({ length: 9 }, (_, index) => (
              <mesh
                key={`attic-shelf-book-${index}`}
                position={[-1.05 + index * 0.26, 0.22, 0]}
                rotation={[0, 0, index % 4 === 0 ? -0.08 : 0]}
                castShadow
              >
                <boxGeometry args={[0.18, 0.42 + (index % 3) * 0.05, 0.34]} />
                <meshStandardMaterial
                  color={["#6f4639", "#5b6355", "#8a6b43"][index % 3]}
                  roughness={0.96}
                />
              </mesh>
            ))}
          </group>
        </>
      ) : usesArchiveKit ? (
        <>
          {archiveFloorTiles.map((tile) => {
            const tileWidth = bounds[0] / 8;
            const tileDepth = bounds[2] / 7;
            return (
              <mesh
                key={`archive-tile-${tile.x}-${tile.z}`}
                position={[
                  -bounds[0] / 2 + tileWidth * (tile.x + 0.5),
                  0.014,
                  -bounds[2] / 2 + tileDepth * (tile.z + 0.5),
                ]}
                receiveShadow
              >
                <boxGeometry args={[tileWidth - 0.035, 0.028, tileDepth - 0.035]} />
                <meshStandardMaterial
                  color={(tile.x + tile.z) % 3 === 0 ? "#263a39" : "#2d4240"}
                  roughness={0.98}
                />
              </mesh>
            );
          })}
          <mesh position={[0, 0.16, -bounds[2] / 2 + 0.09]} receiveShadow>
            <boxGeometry args={[bounds[0], 0.32, 0.18]} />
            <meshStandardMaterial color="#263534" roughness={1} />
          </mesh>
          <mesh position={[-bounds[0] / 2 + 0.09, 0.16, 0]} receiveShadow>
            <boxGeometry args={[0.18, 0.32, bounds[2]]} />
            <meshStandardMaterial color="#263534" roughness={1} />
          </mesh>
          {archiveShelfCenters.map((center, shelfIndex) => (
            <group key={`archive-shelf-${shelfIndex}`} position={[center, 0, -bounds[2] / 2 + 0.24]}>
              <mesh position={[0, 1.55, -0.05]} castShadow receiveShadow>
                <boxGeometry args={[1.65, 3.1, 0.16]} />
                <meshStandardMaterial color="#30413f" roughness={0.96} />
              </mesh>
              <mesh position={[-0.77, 1.55, 0.12]} castShadow>
                <boxGeometry args={[0.12, 3.2, 0.5]} />
                <meshStandardMaterial color="#3a2920" roughness={0.92} />
              </mesh>
              <mesh position={[0.77, 1.55, 0.12]} castShadow>
                <boxGeometry args={[0.12, 3.2, 0.5]} />
                <meshStandardMaterial color="#3a2920" roughness={0.92} />
              </mesh>
              {archiveShelfLevels.map((level, levelIndex) => (
                <group key={`archive-shelf-level-${levelIndex}`}>
                  <mesh position={[0, level, 0.12]} castShadow>
                    <boxGeometry args={[1.65, 0.1, 0.54]} />
                    <meshStandardMaterial color="#4b3326" roughness={0.9} />
                  </mesh>
                  {Array.from({ length: 7 }, (_, bookIndex) => (
                    <mesh
                      key={`archive-book-${bookIndex}`}
                      position={[
                        -0.59 + bookIndex * 0.19,
                        level + 0.23 + ((bookIndex + levelIndex) % 3) * 0.025,
                        0.17,
                      ]}
                      rotation={[0, 0, bookIndex % 4 === 0 ? -0.07 : 0]}
                      castShadow
                    >
                      <boxGeometry args={[0.13, 0.4 + ((bookIndex + 1) % 3) * 0.045, 0.27]} />
                      <meshStandardMaterial
                        color={["#78594a", "#657165", "#6f4a45", "#88714c"][
                          (bookIndex + levelIndex) % 4
                        ]}
                        roughness={0.94}
                      />
                    </mesh>
                  ))}
                </group>
              ))}
            </group>
          ))}
          {sideStuds.map((z, index) => (
            <mesh
              key={`archive-pier-${index}`}
              position={[-bounds[0] / 2 + 0.07, bounds[1] / 2, z]}
              receiveShadow
            >
              <boxGeometry args={[0.2, bounds[1], 0.28]} />
              <meshStandardMaterial color="#354a48" roughness={1} />
            </mesh>
          ))}
        </>
      ) : (
        <gridHelper args={[Math.max(bounds[0], bounds[2]), 16, "#637270", "#394746"]} />
      )}
    </group>
  );
}

function DustMotes({ bounds }: { bounds: Vector3Tuple }) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const values = new Float32Array(90 * 3);
    for (let index = 0; index < 90; index += 1) {
      const seed = index + 1;
      values[index * 3] = Math.sin(seed * 12.9898) * bounds[0] * 0.5;
      values[index * 3 + 1] = 0.3 + Math.abs(Math.sin(seed * 4.1414)) * bounds[1] * 0.85;
      values[index * 3 + 2] = Math.sin(seed * 7.233) * bounds[2] * 0.5;
    }
    return values;
  }, [bounds]);

  useFrame((state, delta) => {
    if (!points.current) return;
    points.current.rotation.y += delta * 0.008;
    points.current.position.y = Math.sin(state.clock.elapsedTime * 0.16) * 0.08;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#f1d5ad"
        size={0.028}
        transparent
        opacity={0.48}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

function Firelight({ item }: { item: LayoutItem }) {
  const light = useRef<THREE.PointLight>(null);
  const flame = useRef<THREE.Mesh>(null);
  const frontOffset = item.asset.key === "fireplace" ? 0.38 : 0;
  const height = item.asset.key === "fireplace" ? 0.58 : item.dimensions[1] * 0.72;

  useFrame((state) => {
    const flicker =
      0.88 +
      Math.sin(state.clock.elapsedTime * 9.1) * 0.08 +
      Math.sin(state.clock.elapsedTime * 15.7) * 0.04;
    if (light.current) light.current.intensity = 3.5 * flicker;
    if (flame.current) flame.current.scale.y = flicker;
  });

  return (
    <group position={[item.position[0], height, item.position[2] + frontOffset]}>
      <pointLight
        ref={light}
        color="#ff9a52"
        intensity={3.5}
        distance={7.5}
        decay={1.7}
        castShadow={false}
      />
      <mesh ref={flame} position={[0, 0.04, 0]} scale={[0.17, 0.34, 0.12]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial color="#ffb052" transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 0.09, 0]} scale={[0.075, 0.22, 0.065]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial color="#fff1b0" />
      </mesh>
    </group>
  );
}

function StoryEffects({
  layout,
  portalDestination,
  onLocationRequest,
}: {
  layout: WorldLayout;
  portalDestination?: Location;
  onLocationRequest?: (locationId: string) => void;
}) {
  const litItems = layout.items.filter((item) => item.entity.state?.lit === true);
  const hiddenDoor = layout.items.find((item) => item.asset.key === "hidden-door");

  return (
    <>
      {litItems.map((item) => (
        <Firelight key={`firelight-${item.entity.id}`} item={item} />
      ))}
      {hiddenDoor && (
        <group position={hiddenDoor.position}>
          <mesh position={[-hiddenDoor.dimensions[0] / 2 - 0.05, 0, 0.17]}>
            <boxGeometry args={[0.06, hiddenDoor.dimensions[1] + 0.16, 0.06]} />
            <meshBasicMaterial color="#d79855" transparent opacity={0.72} />
          </mesh>
          <mesh position={[hiddenDoor.dimensions[0] / 2 + 0.05, 0, 0.17]}>
            <boxGeometry args={[0.06, hiddenDoor.dimensions[1] + 0.16, 0.06]} />
            <meshBasicMaterial color="#d79855" transparent opacity={0.72} />
          </mesh>
          <mesh position={[0, hiddenDoor.dimensions[1] / 2 + 0.05, 0.17]}>
            <boxGeometry args={[hiddenDoor.dimensions[0] + 0.16, 0.06, 0.06]} />
            <meshBasicMaterial color="#d79855" transparent opacity={0.72} />
          </mesh>
          {portalDestination && onLocationRequest && (
            <Html
              center
              position={[0, hiddenDoor.dimensions[1] / 2 + 0.52, 0.28]}
              distanceFactor={8}
            >
              <button
                type="button"
                className="world-portal-action"
                onClick={(event) => {
                  event.stopPropagation();
                  onLocationRequest(portalDestination.id);
                }}
              >
                Enter {portalDestination.name}
              </button>
            </Html>
          )}
        </group>
      )}
    </>
  );
}

function SceneCamera({
  layout,
  command,
}: {
  layout: WorldLayout;
  command: CameraCommand | null;
}) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null);
  const bounds = layout.location.bounds ?? [12, 4.5, 10];

  useEffect(() => {
    const overview = createOverviewCameraPose(bounds);
    const currentControls = controls.current;
    if (!currentControls) return;

    currentControls.cancel();
    currentControls.setBoundary(
      new THREE.Box3(
        new THREE.Vector3(-bounds[0] / 2 + 0.45, 0.35, -bounds[2] / 2 + 0.45),
        new THREE.Vector3(bounds[0] / 2 - 0.45, bounds[1] - 0.35, bounds[2] / 2 - 0.45),
      ),
    );
    void currentControls.setLookAt(
      ...overview.position,
      ...overview.target,
      false,
    );
    currentControls.saveState();
  }, [bounds[0], bounds[1], bounds[2], layout.location.id]);

  useEffect(() => {
    const currentControls = controls.current;
    if (!command || !currentControls) return;
    const currentPosition = currentControls.getPosition(new THREE.Vector3(), true);
    const currentTarget = currentControls.getTarget(new THREE.Vector3(), true);
    const pose =
      command.kind === "reset"
        ? createOverviewCameraPose(bounds)
        : createTravelCameraPose(
            [currentPosition.x, currentPosition.y, currentPosition.z],
            [currentTarget.x, currentTarget.y, currentTarget.z],
            command.target,
            bounds,
          );
    currentControls.cancel();
    void currentControls.setLookAt(...pose.position, ...pose.target, true);
  }, [bounds[0], bounds[1], bounds[2], command]);

  return (
    <CameraControls
      ref={controls}
      key={layout.location.id}
      makeDefault
      smoothTime={0.22}
      draggingSmoothTime={0.08}
      boundaryFriction={0.18}
      dollyToCursor
      truckSpeed={2.2}
      minDistance={1.1}
      maxDistance={Math.max(48, Math.max(bounds[0], bounds[2]) * 6)}
      maxPolarAngle={Math.PI / 2.02}
      mouseButtons={{
        left: CameraControlsImpl.ACTION.TRUCK,
        middle: CameraControlsImpl.ACTION.DOLLY,
        right: CameraControlsImpl.ACTION.ROTATE,
        wheel: CameraControlsImpl.ACTION.DOLLY,
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
  presentation,
  exitingItems,
  selectedEntityId,
  changes,
  onEntitySelect,
  cameraCommand,
  onCameraCommand,
  relationEdges,
  openConflicts,
  enableShadows,
  portalDestination,
  onLocationRequest,
}: {
  layout: WorldLayout;
  presentation: ScenePresentation;
  exitingItems: readonly LayoutItem[];
  selectedEntityId?: string | null;
  changes: ReadonlyMap<string, ChangeKind>;
  onEntitySelect?: (entityId: string | null) => void;
  cameraCommand: CameraCommand | null;
  onCameraCommand: (kind: "travel" | "focus", target: Vector3Tuple) => void;
  relationEdges: readonly VisibleRelationEdge[];
  openConflicts: readonly Conflict[];
  enableShadows: boolean;
  portalDestination?: Location;
  onLocationRequest?: (locationId: string) => void;
}) {
  const bounds = layout.location.bounds ?? [12, 4.5, 10];

  return (
    <>
      <color attach="background" args={[presentation.palette.background]} />
      <fog attach="fog" args={[presentation.palette.fog, 10, 29]} />
      <hemisphereLight
        color={presentation.palette.keyLight}
        groundColor={presentation.palette.timber}
        intensity={presentation.location.lighting.contrast === "high" ? 0.78 : 0.95}
      />
      <ambientLight
        color={presentation.palette.ambient}
        intensity={presentation.location.lighting.ambientIntensity}
      />
      <directionalLight
        castShadow={enableShadows}
        color={presentation.palette.keyLight}
        position={[5, 8, 4]}
        intensity={presentation.location.lighting.keyIntensity}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
      />
      {presentation.atmosphere.coolWindowLight && (
        <pointLight
          color="#aacfd7"
          position={[bounds[0] * 0.3, bounds[1] * 0.62, -bounds[2] * 0.38]}
          intensity={2.1}
          distance={9}
          decay={1.8}
        />
      )}
      <Room
        layout={layout}
        presentation={presentation}
        onGroundNavigate={(target) => onCameraCommand("travel", target)}
      />
      {presentation.atmosphere.dust && <DustMotes bounds={bounds} />}
      <StoryEffects
        layout={layout}
        portalDestination={portalDestination}
        onLocationRequest={onLocationRequest}
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
          onActivate={
            item.asset.key === "hidden-door" && portalDestination && onLocationRequest
              ? (event) => {
                  event.stopPropagation();
                  onLocationRequest(portalDestination.id);
                }
              : undefined
          }
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
  visualPlan,
  selectedEntityId,
  onEntitySelect,
  onRuntimeError,
  onPatchApplied,
  onLocationRequest,
  activeLocationId,
  assetRegistry = defaultAssetRegistry,
  className,
}: WorldViewerProps) {
  const [viewer, setViewer] = useState(() =>
    createViewerState(snapshot, assetRegistry, activeLocationId),
  );
  const [cameraCommand, setCameraCommand] = useState<CameraCommand | null>(null);
  const [renderQuality, setRenderQuality] = useState<RenderQuality>("balanced");
  const cameraCommandId = useRef(0);
  const appliedPatch = useRef<string | null>(null);
  const appliedPatchValue = useRef<ScenePatch | null>(null);
  const notifiedPatch = useRef<string | null>(null);

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
    appliedPatchValue.current = null;
    notifiedPatch.current = null;
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
        appliedPatchValue.current = validatedPatch;
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
    const applied = appliedPatchValue.current;
    if (!applied || !viewer.runtime || viewer.runtime.snapshot.version !== applied.toVersion) {
      return;
    }
    if (!onPatchApplied) return;
    const patchKey = `${applied.fromVersion}:${applied.toVersion}`;
    if (notifiedPatch.current === patchKey) return;
    notifiedPatch.current = patchKey;
    onPatchApplied(viewer.runtime.snapshot, applied);
  }, [onPatchApplied, viewer.runtime?.snapshot]);

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
  const qualityProfile = renderQualityProfiles[renderQuality];
  const presentation = useMemo(() => {
    if (!runtime) return null;
    if (!visualPlan) {
      return createFallbackScenePresentation(
        runtime.snapshot,
        runtime.layout.location.id,
      );
    }
    return compileScenePresentation(
      visualPlan,
      runtime.snapshot,
      runtime.layout.location.id,
    );
  }, [runtime?.layout.location.id, runtime?.snapshot, visualPlan]);
  const portalDestination =
    runtime && presentation?.portalTargetLocationId
      ? runtime.snapshot.locations.find(
          (location) => location.id === presentation.portalTargetLocationId,
        )
      : undefined;

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
      data-render-quality={renderQuality}
      data-visual-plan-version={presentation?.planVersion ?? 0}
      data-visual-style={presentation?.styleLabel ?? "unavailable"}
      data-asset-requests={presentation?.assetRequests.length ?? 0}
      style={{ width: "100%", height: "100%", minHeight: 360 }}
    >
      {runtime && presentation ? (
        <Canvas
          shadows={qualityProfile.shadows}
          dpr={qualityProfile.dpr}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.08,
          }}
          camera={{ position: [8, 7, 9], fov: 48, near: 0.1, far: 100 }}
          style={{ touchAction: "none" }}
          onPointerMissed={() => onEntitySelect?.(null)}
        >
          <WorldScene
            layout={runtime.layout}
            presentation={presentation}
            exitingItems={runtime.exitingItems}
            selectedEntityId={selectedEntityId}
            changes={changes}
            onEntitySelect={onEntitySelect}
            cameraCommand={cameraCommand}
            onCameraCommand={requestCamera}
            relationEdges={relationEdges}
            openConflicts={openConflicts}
            enableShadows={qualityProfile.shadows}
            portalDestination={portalDestination}
            onLocationRequest={onLocationRequest}
          />
          <PerformanceMonitor
            ms={250}
            iterations={6}
            flipflops={3}
            onChange={({ factor }) =>
              setRenderQuality(qualityForPerformanceFactor(factor))
            }
            onFallback={() => setRenderQuality("low")}
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
