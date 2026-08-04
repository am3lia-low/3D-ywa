import {
  CameraControls,
  CameraControlsImpl,
  Clone,
  Html,
  Line,
  PerformanceMonitor,
  RoundedBox,
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
import type { CompiledSceneRecipe } from "../runtime/sceneRecipeCompiler";
import {
  resolveDressingInstances,
  type ResolvedDressingInstance,
} from "../runtime/dressingResolver";
import {
  advanceSpatialRuntime,
  clearSpatialRuntimeExits,
  createSpatialRuntime,
  refreshSpatialRuntimeAssets,
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
  /** Optional precompiled visual/asset recipe for production integrations. */
  sceneRecipe?: CompiledSceneRecipe;
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

function LoadedModel({ url, draftGenerated = false }: { url: string; draftGenerated?: boolean }) {
  const model = useGLTF(url);
  const renderedScene = useMemo(() => {
    if (!draftGenerated) return model.scene;
    const clone = model.scene.clone(true);
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const hasVertexColors = Boolean(object.geometry.getAttribute("color"));
      object.material = new THREE.MeshBasicMaterial({
        color: hasVertexColors ? "#ffffff" : "#a77a55",
        vertexColors: hasVertexColors,
        side: THREE.DoubleSide,
      });
      object.castShadow = true;
      object.receiveShadow = true;
    });
    return clone;
  }, [draftGenerated, model.scene]);
  useEffect(() => {
    if (!draftGenerated) return;
    return () => {
      renderedScene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
    };
  }, [draftGenerated, renderedScene]);
  const normalization = useMemo(() => {
    renderedScene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(renderedScene);
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
  }, [renderedScene]);

  return (
    <group scale={normalization.scale}>
      {draftGenerated ? (
        <primitive object={renderedScene} position={normalization.offset} />
      ) : (
        <Clone
          object={model.scene}
          position={normalization.offset}
          castShadow
          receiveShadow
        />
      )}
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

function useStoryTexture(
  path: string,
  crop?: [number, number, number, number],
) {
  const texture = useMemo(() => {
    const loaded = new THREE.TextureLoader().load(path);
    loaded.colorSpace = THREE.SRGBColorSpace;
    loaded.wrapS = THREE.ClampToEdgeWrapping;
    loaded.wrapT = THREE.ClampToEdgeWrapping;
    loaded.anisotropy = 8;
    if (crop) {
      const [left, top, right, bottom] = crop;
      loaded.repeat.set(right - left, bottom - top);
      loaded.offset.set(left, 1 - bottom);
    }
    return loaded;
  }, [crop, path]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function StorySurfaceAsset({
  asset,
  highlighted,
  highlightColor,
}: {
  asset: AssetDefinition;
  highlighted: boolean;
  highlightColor: string;
}) {
  const texture = useStoryTexture(asset.surfaceTextureUrl!, asset.surfaceCrop);
  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={asset.color} roughness={asset.roughness ?? 0.9} />
      </mesh>
      <mesh position={[0, 0, 0.501]} castShadow receiveShadow>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial
          map={texture}
          roughness={asset.roughness ?? 0.9}
          emissive={highlighted ? highlightColor : "#000000"}
          emissiveIntensity={highlighted ? 0.24 : 0}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
    </group>
  );
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
      <RoundedBox
        args={[1, 0.09, 1]}
        radius={0.028}
        smoothness={3}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#b99055" roughness={0.98} />
      </RoundedBox>
      <mesh position={[0, 0.048, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.965, 0.965, 8, 6]} />
        <meshStandardMaterial
          map={mapTexture}
          roughness={0.96}
          emissive={highlighted ? highlightColor : "#000000"}
          emissiveIntensity={highlighted ? 0.2 : 0}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
      {[-0.25, 0, 0.25].map((x) => (
        <mesh key={`map-fold-${x}`} position={[x, 0.052, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.006, 0.92]} />
          <meshBasicMaterial color="#6d4b2d" transparent opacity={0.22} />
        </mesh>
      ))}
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
  const archShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, -0.5);
    shape.lineTo(0.5, -0.5);
    shape.lineTo(0.5, 0.12);
    shape.absarc(0, 0.12, 0.5, 0, Math.PI, false);
    shape.lineTo(-0.5, -0.5);

    const opening = new THREE.Path();
    opening.moveTo(-0.27, -0.42);
    opening.lineTo(0.27, -0.42);
    opening.lineTo(0.27, 0.08);
    opening.absarc(0, 0.08, 0.27, 0, Math.PI, false);
    opening.lineTo(-0.27, -0.42);
    shape.holes.push(opening);
    return shape;
  }, []);
  const archExtrusion = useMemo(() => ({
    depth: 0.27,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.022,
    bevelThickness: 0.022,
    curveSegments: 18,
  }), []);

  return (
    <group>
      <mesh position={[0, -0.02, -0.13]} castShadow receiveShadow>
        <extrudeGeometry args={[archShape, archExtrusion]} />
        {stoneMaterial}
      </mesh>
      <mesh position={[0, -0.13, 0.02]}>
        <planeGeometry args={[0.5, 0.54]} />
        <meshStandardMaterial color="#100b08" roughness={1} />
      </mesh>
      <mesh position={[0, 0.48, 0.06]} castShadow receiveShadow>
        <boxGeometry args={[1.12, 0.14, 0.52]} />
        {stoneMaterial}
      </mesh>
      <mesh position={[0, -0.45, 0.18]} castShadow receiveShadow>
        <boxGeometry args={[1.08, 0.12, 0.7]} />
        {stoneMaterial}
      </mesh>
      <mesh position={[0, -0.34, 0.18]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <planeGeometry args={[0.48, 0.38]} />
        <meshStandardMaterial color="#2a1a13" roughness={1} />
      </mesh>
      {[-0.14, 0.14].map((x) => (
        <mesh key={x} position={[x, -0.31, 0.29]} rotation={[0, 0, x * 1.6]} castShadow>
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

function TimberBeam({
  start,
  end,
  color,
  thickness = 0.2,
  depth = 0.22,
}: {
  start: Vector3Tuple;
  end: Vector3Tuple;
  color: string;
  thickness?: number;
  depth?: number;
}) {
  const transform = useMemo(() => {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    return {
      length: Math.hypot(dx, dy),
      position: [
        (start[0] + end[0]) / 2,
        (start[1] + end[1]) / 2,
        (start[2] + end[2]) / 2,
      ] as Vector3Tuple,
      angle: Math.atan2(dy, dx),
    };
  }, [end, start]);

  return (
    <mesh position={transform.position} rotation={[0, 0, transform.angle]} castShadow receiveShadow>
      <boxGeometry args={[transform.length, thickness, depth]} />
      <meshStandardMaterial color={color} roughness={0.88} metalness={0.02} />
    </mesh>
  );
}

function AtticRoofFrame({ bounds, timberColor }: { bounds: Vector3Tuple; timberColor: string }) {
  const eaveY = bounds[1] * 0.72;
  const ridgeY = bounds[1] - 0.14;
  const halfWidth = bounds[0] / 2 - 0.14;
  const frameDepths = [-bounds[2] / 2 + 0.18, -bounds[2] * 0.24, bounds[2] * 0.04];
  const purlinDepth = bounds[2] * 0.58;
  const purlinZ = -bounds[2] * 0.2;
  const roofY = (x: number) =>
    eaveY + (ridgeY - eaveY) * (1 - Math.abs(x) / halfWidth);

  return (
    <group>
      {frameDepths.map((z, index) => (
        <group key={`attic-truss-${index}`}>
          <TimberBeam
            start={[-halfWidth, eaveY, z]}
            end={[0, ridgeY, z]}
            color={timberColor}
            thickness={0.22}
            depth={0.24}
          />
          <TimberBeam
            start={[0, ridgeY, z]}
            end={[halfWidth, eaveY, z]}
            color={timberColor}
            thickness={0.22}
            depth={0.24}
          />
          <mesh position={[0, (ridgeY + eaveY) / 2 - 0.08, z]} castShadow>
            <boxGeometry args={[0.16, ridgeY - eaveY + 0.12, 0.2]} />
            <meshStandardMaterial color={timberColor} roughness={0.9} />
          </mesh>
          <mesh position={[0, eaveY + 0.42, z]} castShadow>
            <boxGeometry args={[bounds[0] * 0.58, 0.15, 0.18]} />
            <meshStandardMaterial color={timberColor} roughness={0.9} />
          </mesh>
        </group>
      ))}
      {[-halfWidth * 0.58, 0, halfWidth * 0.58].map((x) => (
        <mesh key={`attic-purlin-${x}`} position={[x, roofY(x), purlinZ]} castShadow>
          <boxGeometry args={[0.18, 0.18, purlinDepth]} />
          <meshStandardMaterial color={timberColor} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function AtticRoofShell({
  bounds,
  colorMap,
  normalMap,
  roughnessMap,
}: {
  bounds: Vector3Tuple;
  colorMap: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}) {
  const eaveY = bounds[1] * 0.72;
  const ridgeY = bounds[1] - 0.16;
  const halfWidth = bounds[0] / 2 - 0.12;
  const rise = ridgeY - eaveY;
  const slopeLength = Math.hypot(halfWidth, rise);
  const angle = Math.atan2(rise, halfWidth);
  const panelDepth = bounds[2] * 0.58;
  const panelZ = -bounds[2] * 0.21;
  const material = (
    <meshStandardMaterial
      color="#6f5947"
      map={colorMap}
      normalMap={normalMap}
      normalScale={new THREE.Vector2(0.32, 0.32)}
      roughnessMap={roughnessMap}
      roughness={0.96}
      side={THREE.DoubleSide}
    />
  );

  return (
    <group>
      <mesh
        position={[-halfWidth / 2, (eaveY + ridgeY) / 2 + 0.05, panelZ]}
        rotation={[0, 0, angle]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[slopeLength, 0.085, panelDepth]} />
        {material}
      </mesh>
      <mesh
        position={[halfWidth / 2, (eaveY + ridgeY) / 2 + 0.05, panelZ]}
        rotation={[0, 0, -angle]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[slopeLength, 0.085, panelDepth]} />
        {material}
      </mesh>
    </group>
  );
}

function AtticWindow({ position }: { position: Vector3Tuple }) {
  const panePositions: Vector3Tuple[] = [
    [-0.48, 0.36, 0.035],
    [0.48, 0.36, 0.035],
    [-0.48, -0.36, 0.035],
    [0.48, -0.36, 0.035],
  ];
  return (
    <group position={position}>
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[2.05, 1.56]} />
        <meshStandardMaterial
          color="#6f909d"
          emissive="#8ec5d4"
          emissiveIntensity={0.58}
          roughness={0.22}
        />
      </mesh>
      {panePositions.map((pane, index) => (
        <mesh key={`attic-window-pane-${index}`} position={pane}>
          <planeGeometry args={[0.87, 0.62]} />
          <meshPhysicalMaterial
            color={index % 2 ? "#a9ced5" : "#87afb9"}
            emissive="#7bb4c2"
            emissiveIntensity={0.34}
            roughness={0.18}
            transmission={0.08}
            transparent
            opacity={0.84}
          />
        </mesh>
      ))}
      {[-1.08, 0, 1.08].map((x) => (
        <mesh key={`attic-window-vertical-${x}`} position={[x, 0, 0.1]} castShadow>
          <boxGeometry args={[0.12, 1.78, 0.13]} />
          <meshStandardMaterial color="#2c1e18" roughness={0.86} />
        </mesh>
      ))}
      {[-0.83, 0, 0.83].map((y) => (
        <mesh key={`attic-window-horizontal-${y}`} position={[0, y, 0.1]} castShadow>
          <boxGeometry args={[2.26, 0.12, 0.13]} />
          <meshStandardMaterial color="#2c1e18" roughness={0.86} />
        </mesh>
      ))}
      <mesh position={[0, -0.98, 0.22]} castShadow receiveShadow>
        <boxGeometry args={[2.55, 0.18, 0.52]} />
        <meshStandardMaterial color="#3d2a20" roughness={0.9} />
      </mesh>
    </group>
  );
}

function DecorativeBook({
  position,
  size,
  color,
  rotation = [0, 0, 0],
}: {
  position: Vector3Tuple;
  size: Vector3Tuple;
  color: string;
  rotation?: Vector3Tuple;
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, size[2] / 2 + 0.003]}>
        <boxGeometry args={[size[0] * 0.72, size[1] * 0.82, 0.008]} />
        <meshStandardMaterial color="#c5a56d" roughness={0.96} />
      </mesh>
    </group>
  );
}

function AtticLibraryDressing({ rich }: { rich: boolean }) {
  const bookColors = ["#743f35", "#4f655b", "#80633d", "#4a5065", "#8b573f"];
  const booksPerShelf = rich ? 11 : 8;
  const shelfBases = rich ? [-1.08, -0.46, 0.16, 0.78] : [-1.08, -0.46, 0.16];
  const wood = usePbrSurface(
    "/textures/polyhaven/dark_wooden_planks_diff_1k.jpg",
    "/textures/polyhaven/dark_wooden_planks_nor_gl_1k.jpg",
    "/textures/polyhaven/dark_wooden_planks_arm_1k.jpg",
    [2.4, 3.2],
  );
  const woodMaterial = (
    <meshStandardMaterial
      color="#6b4935"
      map={wood.color}
      normalMap={wood.normal}
      normalScale={new THREE.Vector2(0.3, 0.3)}
      roughnessMap={wood.arm}
      roughness={0.9}
    />
  );
  return (
    <group>
      <mesh position={[0, 0, -0.23]} castShadow receiveShadow>
        <boxGeometry args={[2.48, 2.58, 0.1]} />
        {woodMaterial}
      </mesh>
      {[-1.28, 1.28].map((x) => (
        <mesh key={`attic-library-side-${x}`} position={[x, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.18, 2.72, 0.6]} />
          <meshStandardMaterial
            color="#60402f"
            map={wood.color}
            normalMap={wood.normal}
            normalScale={new THREE.Vector2(0.28, 0.28)}
            roughnessMap={wood.arm}
            roughness={0.92}
          />
        </mesh>
      ))}
      {[-1.35, 1.35].map((y) => (
        <mesh key={`attic-library-cap-${y}`} position={[0, y, 0.01]} castShadow receiveShadow>
          <boxGeometry args={[2.78, 0.18, 0.68]} />
          <meshStandardMaterial
            color="#654431"
            map={wood.color}
            normalMap={wood.normal}
            normalScale={new THREE.Vector2(0.28, 0.28)}
            roughnessMap={wood.arm}
            roughness={0.9}
          />
        </mesh>
      ))}
      {shelfBases.map((shelfBase, shelfIndex) => (
        <group key={`attic-library-shelf-${shelfIndex}`}>
          <mesh position={[0, shelfBase - 0.07, 0.02]} castShadow receiveShadow>
            <boxGeometry args={[2.5, 0.13, 0.58]} />
            <meshStandardMaterial
              color="#5e3d2d"
              map={wood.color}
              normalMap={wood.normal}
              normalScale={new THREE.Vector2(0.24, 0.24)}
              roughnessMap={wood.arm}
              roughness={0.92}
            />
          </mesh>
          {Array.from({ length: booksPerShelf }, (_, index) => {
            const width = 0.13 + (index % 3) * 0.022;
            const height = 0.38 + ((index + shelfIndex) % 4) * 0.045;
            return (
              <DecorativeBook
                key={`attic-detail-book-${shelfIndex}-${index}`}
                position={[-1.04 + index * (2.08 / Math.max(booksPerShelf - 1, 1)), shelfBase + height / 2, 0.2]}
                size={[width, height, 0.31 + (index % 2) * 0.03]}
                color={bookColors[(index + shelfIndex) % bookColors.length]!}
                rotation={[0, 0, index % 5 === 0 ? -0.08 : index % 7 === 0 ? 0.06 : 0]}
              />
            );
          })}
        </group>
      ))}
      {rich && (
        [0, 1, 2].map((index) => (
          <DecorativeBook
            key={`attic-horizontal-book-${index}`}
            position={[0.76, 1.17 + index * 0.09, 0.2]}
            size={[0.54 - index * 0.05, 0.08, 0.33]}
            color={bookColors[(index + 2) % bookColors.length]!}
          />
        ))
      )}
      {[-0.92, 0.92].map((x) => (
        <mesh key={`attic-library-foot-${x}`} position={[x, -1.49, 0.05]} castShadow>
          <boxGeometry args={[0.34, 0.18, 0.48]} />
          <meshStandardMaterial color="#3f291f" roughness={0.95} />
        </mesh>
      ))}
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

function DesignedFallbackAsset({
  highlighted,
  highlightColor,
}: {
  highlighted: boolean;
  highlightColor: string;
}) {
  return (
    <group>
      <mesh position={[0, -0.43, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.33, 0.4, 0.14, 16]} />
        <meshStandardMaterial color="#3f4f4b" roughness={0.82} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
        <icosahedronGeometry args={[0.34, 1]} />
        <meshStandardMaterial
          color="#9a7650"
          emissive={highlighted ? highlightColor : "#172a28"}
          emissiveIntensity={highlighted ? 0.32 : 0.12}
          roughness={0.62}
          metalness={0.48}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0.15, 0]} scale={[1, 0.72, 1]}>
        <torusGeometry args={[0.43, 0.018, 8, 42]} />
        <meshStandardMaterial color="#70b5a8" emissive="#244e48" emissiveIntensity={0.3} />
      </mesh>
      <mesh rotation={[0.28, Math.PI / 2, 0.35]} scale={[1, 0.74, 1]}>
        <torusGeometry args={[0.39, 0.014, 8, 38]} />
        <meshStandardMaterial color="#d2ab69" roughness={0.45} metalness={0.72} />
      </mesh>
    </group>
  );
}

function CelestialOrreryAsset({
  active,
  highlighted,
  highlightColor,
}: {
  active: boolean;
  highlighted: boolean;
  highlightColor: string;
}) {
  const mechanism = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!mechanism.current) return;
    const targetTilt = active ? Math.sin(state.clock.elapsedTime * 0.55) * 0.08 : 0;
    mechanism.current.rotation.y += delta * (active ? 0.24 : 0.035);
    mechanism.current.rotation.z = THREE.MathUtils.lerp(
      mechanism.current.rotation.z,
      targetTilt,
      1 - Math.exp(-delta * 2.5),
    );
  });
  const glow = highlighted ? highlightColor : active ? "#6fd8ca" : "#183b38";

  return (
    <group>
      <mesh position={[0, -0.43, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.4, 0.12, 24]} />
        <meshStandardMaterial color="#243c39" roughness={0.64} metalness={0.52} />
      </mesh>
      <mesh position={[0, -0.34, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.31, 0.035, 8, 32]} />
        <meshStandardMaterial color="#b48a45" roughness={0.42} metalness={0.82} />
      </mesh>
      <mesh position={[0, -0.15, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.085, 0.42, 12]} />
        <meshStandardMaterial color="#88653e" roughness={0.48} metalness={0.72} />
      </mesh>
      <group ref={mechanism} position={[0, 0.09, 0]}>
        {Array.from({ length: 8 }, (_, index) => {
          const angle = (index / 8) * Math.PI * 2;
          return (
            <group key={`orrery-petal-${index}`} rotation={[0, angle, 0]}>
              <mesh
                position={[0, active ? 0.02 : -0.035, active ? 0.27 : 0.18]}
                rotation={[active ? -0.55 : -1.05, 0, 0]}
                scale={[0.13, 0.055, active ? 0.32 : 0.22]}
                castShadow
              >
                <sphereGeometry args={[1, 16, 8]} />
                <meshStandardMaterial
                  color={index % 2 ? "#396d68" : "#b98945"}
                  emissive={glow}
                  emissiveIntensity={active ? 0.28 : highlighted ? 0.22 : 0.04}
                  roughness={0.48}
                  metalness={0.58}
                />
              </mesh>
            </group>
          );
        })}
        <mesh castShadow>
          <sphereGeometry args={[0.19, 24, 16]} />
          <meshStandardMaterial
            color="#263f66"
            emissive={glow}
            emissiveIntensity={active ? 0.55 : highlighted ? 0.3 : 0.08}
            roughness={0.34}
            metalness={0.32}
          />
        </mesh>
        {[
          [Math.PI / 2, 0.1, 0, 0.31, "#82c7b6"],
          [0.32, Math.PI / 2, 0.4, 0.37, "#d4a557"],
          [-0.4, 0.22, Math.PI / 2, 0.43, "#718fbc"],
        ].map(([x, y, z, radius, color], index) => (
          <mesh key={`orrery-ring-${index}`} rotation={[x as number, y as number, z as number]}>
            <torusGeometry args={[radius as number, 0.014, 7, 44]} />
            <meshStandardMaterial
              color={color as string}
              emissive={active ? (color as string) : "#132421"}
              emissiveIntensity={active ? 0.2 : 0.04}
              roughness={0.4}
              metalness={0.74}
            />
          </mesh>
        ))}
        {[
          [0.31, 0.08, 0.02, "#d69b50"],
          [-0.24, -0.12, 0.24, "#6ca98c"],
          [0.04, 0.28, -0.29, "#9a6c70"],
        ].map(([x, y, z, color], index) => (
          <mesh key={`orrery-planet-${index}`} position={[x as number, y as number, z as number]} castShadow>
            <sphereGeometry args={[0.045 + index * 0.009, 14, 10]} />
            <meshStandardMaterial color={color as string} roughness={0.52} metalness={0.2} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function EntityAsset({
  asset,
  active = false,
  highlighted,
  highlightColor,
}: {
  asset: AssetDefinition;
  active?: boolean;
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

  if (asset.key === "fallback:instrument") {
    return (
      <CelestialOrreryAsset
        active={active}
        highlighted={highlighted}
        highlightColor={highlightColor}
      />
    );
  }

  if (asset.key.startsWith("fallback:")) {
    return <DesignedFallbackAsset highlighted={highlighted} highlightColor={highlightColor} />;
  }

  if (asset.key === "rug") {
    return <StoryRug highlighted={highlighted} highlightColor={highlightColor} />;
  }

  if (asset.key === "fireplace") {
    return <StoryFireplace highlighted={highlighted} highlightColor={highlightColor} />;
  }

  if (asset.key === "map") {
    return <StoryMap highlighted={highlighted} highlightColor={highlightColor} />;
  }

  if (asset.surfaceTextureUrl) {
    return (
      <StorySurfaceAsset
        asset={asset}
        highlighted={highlighted}
        highlightColor={highlightColor}
      />
    );
  }

  if (!asset.modelUrl) return fallback;

  return (
    <ModelErrorBoundary key={asset.modelUrl} fallback={fallback}>
      <Suspense fallback={fallback}>
        <LoadedModel
          url={asset.modelUrl}
          draftGenerated={asset.key.startsWith("generated:")}
        />
      </Suspense>
    </ModelErrorBoundary>
  );
}

function ParcelCord({ axis }: { axis: "x" | "z" }) {
  const curve = useMemo(() => {
    const points = [
      -0.51, -0.37,
      -0.53, 0.39,
      -0.51, 0.485,
      0, 0.49,
      0.51, 0.485,
      0.53, 0.39,
      0.51, -0.37,
    ];
    return new THREE.CatmullRomCurve3(
      Array.from({ length: points.length / 2 }, (_, index) => {
        const across = points[index * 2]!;
        const height = points[index * 2 + 1]!;
        return axis === "x"
          ? new THREE.Vector3(across, height, 0)
          : new THREE.Vector3(0, height, across);
      }),
      false,
      "catmullrom",
      0.16,
    );
  }, [axis]);

  return (
    <mesh castShadow>
      <tubeGeometry args={[curve, 56, 0.009, 7, false]} />
      <meshStandardMaterial color="#b69a70" roughness={0.98} />
    </mesh>
  );
}

function ParcelWaxSeal({ xzCompensation }: { xzCompensation: number }) {
  const waxShape = useMemo(() => {
    const shape = new THREE.Shape();
    const pointCount = 28;
    for (let index = 0; index < pointCount; index += 1) {
      const angle = (index / pointCount) * Math.PI * 2;
      const irregularity = 1 + Math.sin(index * 2.37) * 0.065 + Math.cos(index * 1.73) * 0.035;
      const radius = 0.057 * irregularity;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * xzCompensation;
      if (index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
  }, [xzCompensation]);
  const extrusion = useMemo(
    () => ({
      depth: 0.018,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.006,
      bevelThickness: 0.004,
      curveSegments: 24,
    }),
    [],
  );

  return (
    <group position={[0, 0.5, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <extrudeGeometry args={[waxShape, extrusion]} />
        <meshPhysicalMaterial
          color="#8f2430"
          roughness={0.48}
          clearcoat={0.28}
          clearcoatRoughness={0.42}
        />
      </mesh>
      <mesh position={[0, 0.022, 0]} scale={[1, 1, xzCompensation]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.004, 28]} />
        <meshStandardMaterial color="#651722" roughness={0.66} />
      </mesh>
    </group>
  );
}

function StoryParcelAsset({
  highlighted,
  highlightColor,
  xzCompensation,
}: {
  highlighted: boolean;
  highlightColor: string;
  xzCompensation: number;
}) {
  const wood = usePbrSurface(
    "/textures/polyhaven/dark_wooden_planks_diff_1k.jpg",
    "/textures/polyhaven/dark_wooden_planks_nor_gl_1k.jpg",
    "/textures/polyhaven/dark_wooden_planks_arm_1k.jpg",
    [1.6, 1.25],
  );
  return (
    <group>
      <RoundedBox args={[1, 0.82, 1]} radius={0.035} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial
          color="#b28a66"
          map={wood.color}
          normalMap={wood.normal}
          normalScale={new THREE.Vector2(0.18, 0.18)}
          roughnessMap={wood.arm}
          emissive={highlighted ? highlightColor : "#000000"}
          emissiveIntensity={highlighted ? 0.24 : 0}
          roughness={0.88}
        />
      </RoundedBox>
      <RoundedBox
        args={[1.03, 0.075, 1.03]}
        radius={0.018}
        smoothness={3}
        position={[0, 0.435, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color="#9d7453"
          map={wood.color}
          normalMap={wood.normal}
          normalScale={new THREE.Vector2(0.14, 0.14)}
          roughnessMap={wood.arm}
          roughness={0.9}
        />
      </RoundedBox>
      <ParcelCord axis="x" />
      <ParcelCord axis="z" />
      <ParcelWaxSeal xzCompensation={xzCompensation} />
    </group>
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
  const isParcel =
    item.asset.key === "crate" &&
    /\bparcel\b/i.test([item.entity.name, ...(item.entity.aliases ?? [])].join(" "));
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
      {isParcel ? (
        <StoryParcelAsset
          highlighted={highlighted}
          highlightColor={emissive}
          xzCompensation={resolvedScale.x / Math.max(resolvedScale.z, 0.001)}
        />
      ) : (
        <EntityAsset
          asset={item.asset}
          active={item.entity.state?.active === true}
          highlighted={highlighted}
          highlightColor={emissive}
        />
      )}
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

function BotanicalPlanter({
  position,
  scale = 1,
  variant = 0,
}: {
  position: Vector3Tuple;
  scale?: number;
  variant?: number;
}) {
  const potColors = ["#9b684d", "#58736d", "#81624f"];
  const leafColors = ["#315f45", "#477a55", "#608c61", "#3f6b50"];
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.34, 0.24, 0.56, 18]} />
        <meshStandardMaterial color={potColors[variant % potColors.length]} roughness={0.83} />
      </mesh>
      <mesh position={[0, 0.56, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.3, 0.045, 8, 24]} />
        <meshStandardMaterial color={potColors[variant % potColors.length]} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.555, 0]}>
        <cylinderGeometry args={[0.285, 0.285, 0.025, 20]} />
        <meshStandardMaterial color="#241e18" roughness={1} />
      </mesh>
      {[-0.09, 0, 0.1].map((x, index) => (
        <mesh
          key={`planter-stem-${index}`}
          position={[x, 0.88 + index * 0.07, (index - 1) * 0.035]}
          rotation={[0, 0, (index - 1) * 0.14]}
        >
          <cylinderGeometry args={[0.025, 0.045, 0.72 + index * 0.16, 8]} />
          <meshStandardMaterial color="#294c3a" roughness={0.94} />
        </mesh>
      ))}
      {Array.from({ length: 9 }, (_, index) => {
        const side = index % 2 ? 1 : -1;
        const tier = Math.floor(index / 2);
        const angle = variant * 0.52 + index * 1.73;
        return (
        <mesh
          key={`planter-leaf-${index}`}
          position={[
            side * (0.14 + (tier % 3) * 0.045),
            0.72 + tier * 0.17,
            Math.sin(angle) * 0.16,
          ]}
          rotation={[0.28 + (index % 3) * 0.12, angle, side * 0.72]}
          scale={[0.3 + (index % 3) * 0.035, 0.105, 0.16]}
        >
          <sphereGeometry args={[1, 16, 8]} />
          <meshStandardMaterial
            color={leafColors[(index + variant) % leafColors.length]}
            roughness={0.82}
            side={THREE.DoubleSide}
          />
        </mesh>
        );
      })}
      {variant % 3 === 2 && [0, 1, 2].map((index) => (
        <mesh
          key={`planter-bloom-${index}`}
          position={[
            (index - 1) * 0.16,
            1.22 + (index % 2) * 0.12,
            index === 1 ? 0.08 : -0.02,
          ]}
          castShadow
        >
          <sphereGeometry args={[0.075, 12, 8]} />
          <meshStandardMaterial
            color={index === 1 ? "#c9a7c5" : "#8eb8ad"}
            emissive="#365f58"
            emissiveIntensity={0.12}
            roughness={0.68}
          />
        </mesh>
      ))}
    </group>
  );
}

function ConservatoryKit({
  bounds,
  presentation,
}: {
  bounds: Vector3Tuple;
  presentation: ScenePresentation;
}) {
  const stone = usePbrSurface(
    "/textures/polyhaven/castle_wall_slates_diff_1k.jpg",
    "/textures/polyhaven/castle_wall_slates_nor_gl_1k.jpg",
    "/textures/polyhaven/castle_wall_slates_arm_1k.jpg",
    [5, 4],
  );
  const frameColor = "#27473f";
  const eaveY = bounds[1] * 0.7;
  const ridgeY = bounds[1] - 0.1;
  const halfWidth = bounds[0] / 2 - 0.1;
  const roofRise = ridgeY - eaveY;
  const roofSlope = Math.hypot(halfWidth, roofRise);
  const roofAngle = Math.atan2(roofRise, halfWidth);
  const rearPosts = Array.from({ length: 9 }, (_, index) =>
    -bounds[0] / 2 + (bounds[0] / 8) * index,
  );
  const sidePosts = Array.from({ length: 7 }, (_, index) =>
    -bounds[2] / 2 + (bounds[2] / 6) * index,
  );
  const roofRibs = Array.from({ length: 7 }, (_, index) =>
    -bounds[2] / 2 + (bounds[2] / 6) * index,
  );
  const glassMaterial = (opacity: number) => (
    <meshStandardMaterial
      color="#7db9b3"
      emissive="#1a4b49"
      emissiveIntensity={0.12}
      transparent
      opacity={opacity}
      roughness={0.38}
      metalness={0.08}
      side={THREE.DoubleSide}
      depthWrite={false}
    />
  );
  const plinths: Array<[number, number, number, number, number, number]> = [
    [0, 0.34, -bounds[2] / 2 + 0.1, bounds[0], 0.68, 0.2],
    [-bounds[0] / 2 + 0.1, 0.34, 0, 0.2, 0.68, bounds[2]],
    [bounds[0] / 2 - 0.1, 0.34, 0, 0.2, 0.68, bounds[2]],
  ];

  return (
    <>
      {presentation.architecture.stoneTileFloor && (
        <group>
          <mesh position={[0, 0.018, 0]} receiveShadow>
            <boxGeometry args={[bounds[0], 0.036, bounds[2]]} />
            <meshStandardMaterial
              color="#385349"
              map={stone.color}
              normalMap={stone.normal}
              normalScale={new THREE.Vector2(0.32, 0.32)}
              roughnessMap={stone.arm}
              roughness={0.94}
            />
          </mesh>
          {Array.from({ length: 9 }, (_, index) => (
            <mesh
              key={`glasshouse-floor-row-${index}`}
              position={[0, 0.044, -bounds[2] / 2 + (bounds[2] / 8) * index]}
            >
              <boxGeometry args={[bounds[0], 0.012, 0.022]} />
              <meshStandardMaterial color="#172d2b" roughness={0.94} />
            </mesh>
          ))}
          {Array.from({ length: 11 }, (_, index) => (
            <mesh
              key={`glasshouse-floor-column-${index}`}
              position={[-bounds[0] / 2 + (bounds[0] / 10) * index, 0.045, 0]}
            >
              <boxGeometry args={[0.022, 0.012, bounds[2]]} />
              <meshStandardMaterial color="#172d2b" roughness={0.94} />
            </mesh>
          ))}
          {[-1.12, 1.12].map((x) => (
            <mesh key={`glasshouse-walkway-inlay-${x}`} position={[x, 0.052, 0]}>
              <boxGeometry args={[0.025, 0.014, bounds[2] * 0.88]} />
              <meshStandardMaterial color="#9b7445" roughness={0.5} metalness={0.62} />
            </mesh>
          ))}
        </group>
      )}
      {plinths.map(([x, y, z, width, height, depth], index) => (
        <mesh key={`glasshouse-stone-plinth-${index}`} position={[x, y, z]} receiveShadow castShadow>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial
            color="#426057"
            map={stone.color}
            normalMap={stone.normal}
            normalScale={new THREE.Vector2(0.28, 0.28)}
            roughnessMap={stone.arm}
            roughness={0.96}
          />
        </mesh>
      ))}
      <group position={[bounds[0] * 0.22, bounds[1] * 0.72, -bounds[2] / 2 - 0.22]}>
        <mesh>
          <circleGeometry args={[0.62, 48]} />
          <meshBasicMaterial color="#d9f0ed" transparent opacity={0.88} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0, -0.02]} scale={1.38}>
          <circleGeometry args={[0.62, 48]} />
          <meshBasicMaterial color="#8ec9c5" transparent opacity={0.14} depthWrite={false} />
        </mesh>
      </group>
      {presentation.architecture.glasshousePanels && (
        <>
          <mesh position={[0, (eaveY + 0.68) / 2, -bounds[2] / 2 + 0.115]}>
            <planeGeometry args={[bounds[0] - 0.25, eaveY - 0.68]} />
            {glassMaterial(0.24)}
          </mesh>
          <mesh
            position={[-bounds[0] / 2 + 0.115, (eaveY + 0.68) / 2, 0]}
            rotation={[0, Math.PI / 2, 0]}
          >
            <planeGeometry args={[bounds[2] - 0.25, eaveY - 0.68]} />
            {glassMaterial(0.2)}
          </mesh>
          <mesh
            position={[bounds[0] / 2 - 0.115, (eaveY + 0.68) / 2, 0]}
            rotation={[0, -Math.PI / 2, 0]}
          >
            <planeGeometry args={[bounds[2] - 0.25, eaveY - 0.68]} />
            {glassMaterial(0.18)}
          </mesh>
          <mesh
            position={[-halfWidth / 2, (eaveY + ridgeY) / 2, 0]}
            rotation={[0, 0, roofAngle]}
          >
            <boxGeometry args={[roofSlope, 0.025, bounds[2] - 0.2]} />
            {glassMaterial(0.17)}
          </mesh>
          <mesh
            position={[halfWidth / 2, (eaveY + ridgeY) / 2, 0]}
            rotation={[0, 0, -roofAngle]}
          >
            <boxGeometry args={[roofSlope, 0.025, bounds[2] - 0.2]} />
            {glassMaterial(0.17)}
          </mesh>
        </>
      )}
      {presentation.architecture.ironFrame && (
        <>
          {rearPosts.map((x, index) => (
            <mesh key={`glasshouse-rear-post-${index}`} position={[x, eaveY / 2, -bounds[2] / 2 + 0.08]}>
              <boxGeometry args={[0.085, eaveY, 0.11]} />
              <meshStandardMaterial color={frameColor} roughness={0.58} metalness={0.56} />
            </mesh>
          ))}
          {[-1, 1].flatMap((side) => sidePosts.map((z, index) => (
            <mesh key={`glasshouse-side-post-${side}-${index}`} position={[side * (bounds[0] / 2 - 0.08), eaveY / 2, z]}>
              <boxGeometry args={[0.11, eaveY, 0.085]} />
              <meshStandardMaterial color={frameColor} roughness={0.58} metalness={0.56} />
            </mesh>
          )))}
          {[0.68, eaveY * 0.56, eaveY].map((height) => (
            <group key={`glasshouse-rail-${height}`}>
              <mesh position={[0, height, -bounds[2] / 2 + 0.08]}>
                <boxGeometry args={[bounds[0], 0.1, 0.12]} />
                <meshStandardMaterial color={frameColor} roughness={0.56} metalness={0.58} />
              </mesh>
              {[-1, 1].map((side) => (
                <mesh key={`glasshouse-side-rail-${side}-${height}`} position={[side * (bounds[0] / 2 - 0.08), height, 0]}>
                  <boxGeometry args={[0.12, 0.1, bounds[2]]} />
                  <meshStandardMaterial color={frameColor} roughness={0.56} metalness={0.58} />
                </mesh>
              ))}
            </group>
          ))}
          {roofRibs.flatMap((z, index) => ([-1, 1] as const).map((side) => (
            <mesh
              key={`glasshouse-roof-rib-${side}-${index}`}
              position={[side * halfWidth / 2, (eaveY + ridgeY) / 2 + 0.025, z]}
              rotation={[0, 0, side < 0 ? roofAngle : -roofAngle]}
              castShadow
            >
              <boxGeometry args={[roofSlope, 0.075, 0.095]} />
              <meshStandardMaterial color={frameColor} roughness={0.5} metalness={0.66} />
            </mesh>
          )))}
          <mesh position={[0, ridgeY + 0.02, 0]} castShadow>
            <boxGeometry args={[0.13, 0.13, bounds[2]]} />
            <meshStandardMaterial color="#355b51" roughness={0.48} metalness={0.68} />
          </mesh>
        </>
      )}
    </>
  );
}

function CourtyardArch({
  position,
  stone,
}: {
  position: Vector3Tuple;
  stone: ReturnType<typeof usePbrSurface>;
}) {
  const material = (
    <meshStandardMaterial
      color="#918a79"
      map={stone.color}
      normalMap={stone.normal}
      normalScale={new THREE.Vector2(0.42, 0.42)}
      roughnessMap={stone.arm}
      roughness={0.98}
    />
  );
  return (
    <group position={position}>
      {[-0.78, 0.78].map((x) => (
        <mesh key={`courtyard-arch-column-${x}`} position={[x, 0.95, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.28, 1.9, 0.38]} />
          {material}
        </mesh>
      ))}
      <mesh position={[0, 1.86, 0]} castShadow receiveShadow>
        <torusGeometry args={[0.78, 0.19, 8, 28, Math.PI]} />
        {material}
      </mesh>
      <mesh position={[0, 2.18, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.32, 0.42]} />
        {material}
      </mesh>
    </group>
  );
}

function CourtyardIvy({ position, height, seed }: {
  position: Vector3Tuple;
  height: number;
  seed: number;
}) {
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]} rotation={[0, 0, seed % 2 ? 0.08 : -0.1]}>
        <cylinderGeometry args={[0.018, 0.035, height, 7]} />
        <meshStandardMaterial color="#31513a" roughness={0.94} />
      </mesh>
      {Array.from({ length: 7 }, (_, index) => {
        const side = index % 2 ? 1 : -1;
        return (
          <mesh
            key={`courtyard-ivy-leaf-${seed}-${index}`}
            position={[side * (0.08 + (index % 3) * 0.025), 0.3 + index * (height / 8), 0.04]}
            rotation={[0.1, side * 0.36, side * 0.52]}
            scale={[0.13 + (index % 2) * 0.025, 0.055, 0.09]}
          >
            <sphereGeometry args={[1, 8, 5]} />
            <meshStandardMaterial color={index % 3 ? "#496a46" : "#647b4c"} roughness={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

function CourtyardCobblestones({
  bounds,
  pavement,
}: {
  bounds: Vector3Tuple;
  pavement: ReturnType<typeof usePbrSurface>;
}) {
  return (
    <mesh position={[0, 0.028, 0]} receiveShadow>
      <boxGeometry args={[bounds[0], 0.055, bounds[2]]} />
      <meshStandardMaterial
        color="#d8d2c4"
        map={pavement.color}
        normalMap={pavement.normal}
        normalScale={new THREE.Vector2(0.46, 0.46)}
        roughnessMap={pavement.arm}
        roughness={0.93}
        metalness={0}
      />
    </mesh>
  );
}

function CourtyardGateSurround({
  position,
  stone,
}: {
  position: Vector3Tuple;
  stone: ReturnType<typeof usePbrSurface>;
}) {
  const shape = useMemo(() => {
    const facade = new THREE.Shape();
    facade.moveTo(-1.65, 0);
    facade.lineTo(1.65, 0);
    facade.lineTo(1.65, 3);
    facade.absarc(0, 3, 1.65, 0, Math.PI, false);
    facade.lineTo(-1.65, 0);

    const opening = new THREE.Path();
    opening.moveTo(-1.28, 0.02);
    opening.lineTo(1.28, 0.02);
    opening.lineTo(1.28, 2.98);
    opening.absarc(0, 2.98, 1.28, 0, Math.PI, false);
    opening.lineTo(-1.28, 0.02);
    facade.holes.push(opening);
    return facade;
  }, []);
  const extrusion = useMemo(() => ({
    depth: 0.28,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    curveSegments: 24,
  }), []);

  return (
    <mesh position={position} castShadow receiveShadow>
      <extrudeGeometry args={[shape, extrusion]} />
      <meshStandardMaterial
        color="#9a9383"
        map={stone.color}
        normalMap={stone.normal}
        normalScale={new THREE.Vector2(0.34, 0.34)}
        roughnessMap={stone.arm}
        roughness={0.97}
      />
    </mesh>
  );
}

function CourtyardKit({
  bounds,
  presentation,
}: {
  bounds: Vector3Tuple;
  presentation: ScenePresentation;
}) {
  const stone = usePbrSurface(
    "/textures/polyhaven/castle_wall_slates_diff_1k.jpg",
    "/textures/polyhaven/castle_wall_slates_nor_gl_1k.jpg",
    "/textures/polyhaven/castle_wall_slates_arm_1k.jpg",
    [2.4, 1.6],
  );
  const pavement = usePbrSurface(
    "/textures/polyhaven/patterned_cobblestone_diff_1k.jpg",
    "/textures/polyhaven/patterned_cobblestone_nor_gl_1k.jpg",
    "/textures/polyhaven/patterned_cobblestone_arm_1k.jpg",
    [5.2, 4.4],
  );
  const wall = usePbrSurface(
    "/textures/polyhaven/plastered_wall_03_diff_1k.jpg",
    "/textures/polyhaven/plastered_wall_03_nor_gl_1k.jpg",
    "/textures/polyhaven/plastered_wall_03_arm_1k.jpg",
    [2.8, 1.45],
  );
  const arcadeCenters = [-bounds[0] * 0.36, -bounds[0] * 0.18, bounds[0] * 0.18, bounds[0] * 0.36];
  const wallHeight = bounds[1] * 0.8;
  const wallSections: Array<[Vector3Tuple, Vector3Tuple, string]> = [
    [[0, wallHeight / 2, -bounds[2] / 2 + 0.08], [bounds[0], wallHeight, 0.2], "#d2c6ac"],
    [[-bounds[0] / 2 + 0.08, wallHeight / 2, 0], [0.2, wallHeight, bounds[2]], "#c9bda5"],
    [[bounds[0] / 2 - 0.08, wallHeight / 2, 0], [0.2, wallHeight, bounds[2]], "#c6baa2"],
  ];
  const puddles: Array<{ position: Vector3Tuple; scale: Vector3Tuple }> = [
    { position: [-bounds[0] * 0.28, 0.075, bounds[2] * 0.22], scale: [1.25, 0.7, 1] },
    { position: [bounds[0] * 0.18, 0.075, bounds[2] * 0.06], scale: [0.82, 0.48, 1] },
    { position: [bounds[0] * 0.32, 0.075, -bounds[2] * 0.22], scale: [1.05, 0.55, 1] },
  ];

  return (
    <group>
      {presentation.architecture.cobblestone && (
        <CourtyardCobblestones bounds={bounds} pavement={pavement} />
      )}
      {presentation.architecture.courtyardWalls && (
        <>
          {wallSections.map(([position, dimensions, color], index) => (
            <mesh key={`courtyard-wall-${index}`} position={position} castShadow receiveShadow>
              <boxGeometry args={dimensions} />
              <meshStandardMaterial
                color={color}
                map={wall.color}
                normalMap={wall.normal}
                normalScale={new THREE.Vector2(0.38, 0.38)}
                roughnessMap={wall.arm}
                roughness={0.99}
              />
            </mesh>
          ))}
          {[
            [[0, wallHeight + 0.08, -bounds[2] / 2 + 0.1], [bounds[0] + 0.18, 0.18, 0.46]],
            [[-bounds[0] / 2 + 0.1, wallHeight + 0.08, 0], [0.46, 0.18, bounds[2]]],
            [[bounds[0] / 2 - 0.1, wallHeight + 0.08, 0], [0.46, 0.18, bounds[2]]],
          ].map(([position, dimensions], index) => (
            <mesh
              key={`courtyard-coping-${index}`}
              position={position as Vector3Tuple}
              castShadow
              receiveShadow
            >
              <boxGeometry args={dimensions as Vector3Tuple} />
              <meshStandardMaterial
                color="#817d73"
                map={stone.color}
                normalMap={stone.normal}
                normalScale={new THREE.Vector2(0.3, 0.3)}
                roughnessMap={stone.arm}
                roughness={0.94}
              />
            </mesh>
          ))}
          {[-1, 1].map((side) => (
            <group
              key={`courtyard-drainpipe-${side}`}
              position={[side * bounds[0] * 0.43, wallHeight * 0.5, -bounds[2] / 2 + 0.34]}
            >
              <mesh castShadow>
                <cylinderGeometry args={[0.045, 0.055, wallHeight * 0.86, 10]} />
                <meshStandardMaterial color="#3e4b48" roughness={0.52} metalness={0.72} />
              </mesh>
              <mesh position={[side * 0.13, -wallHeight * 0.42, 0.02]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.05, 0.05, 0.28, 10]} />
                <meshStandardMaterial color="#3e4b48" roughness={0.52} metalness={0.72} />
              </mesh>
            </group>
          ))}
        </>
      )}
      {presentation.architecture.stoneArcade && arcadeCenters.map((x, index) => (
        <CourtyardArch
          key={`courtyard-arcade-${index}`}
          position={[x, 0.12, -bounds[2] / 2 + 0.37]}
          stone={stone}
        />
      ))}
      {presentation.architecture.stoneArcade && (
        <CourtyardGateSurround
          position={[0, 0.08, -bounds[2] / 2 + 0.18]}
          stone={stone}
        />
      )}
      {presentation.dressing.wallIvy && (
        <>
          {[-0.4, -0.18, 0.22, 0.4].map((factor, index) => (
            <CourtyardIvy
              key={`courtyard-rear-ivy-${index}`}
              position={[bounds[0] * factor, 0.18, -bounds[2] / 2 + 0.52]}
              height={2.2 + (index % 2) * 0.7}
              seed={index}
            />
          ))}
          {[-0.32, 0.05, 0.34].map((factor, index) => (
            <group key={`courtyard-side-ivy-${index}`} position={[-bounds[0] / 2 + 0.52, 0, bounds[2] * factor]} rotation={[0, Math.PI / 2, 0]}>
              <CourtyardIvy position={[0, 0.18, 0]} height={2.15 + index * 0.28} seed={index + 7} />
            </group>
          ))}
        </>
      )}
      {presentation.dressing.rainPuddles && puddles.map((puddle, index) => (
        <group
          key={`courtyard-puddle-${index}`}
          position={puddle.position}
          rotation={[0, index * 0.42, 0]}
          scale={[puddle.scale[0], 1, puddle.scale[1]]}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.86, 32]} />
            <meshStandardMaterial
              color="#829b9c"
              emissive="#263f41"
              emissiveIntensity={0.12}
              roughness={0.22}
              metalness={0.24}
              transparent
              opacity={0.36}
              depthWrite={false}
            />
          </mesh>
          {[0.19, 0.34].map((radius, rippleIndex) => (
            <mesh
              key={`courtyard-puddle-ripple-${rippleIndex}`}
              position={[
                (rippleIndex ? 0.18 : -0.16) * (index % 2 ? -1 : 1),
                0.012,
                rippleIndex ? -0.08 : 0.15,
              ]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <torusGeometry args={[radius, 0.009, 6, 28]} />
              <meshBasicMaterial color="#c2d8d8" transparent opacity={0.34} depthWrite={false} />
            </mesh>
          ))}
        </group>
      ))}
      {presentation.dressing.fallenLeaves && Array.from({ length: 28 }, (_, index) => {
        const x = Math.sin((index + 1) * 7.31) * bounds[0] * 0.41;
        const z = Math.sin((index + 3) * 4.17) * bounds[2] * 0.41;
        return (
          <mesh
            key={`courtyard-leaf-${index}`}
            position={[x, 0.085, z]}
            rotation={[-Math.PI / 2, 0, index * 0.71]}
            scale={[0.13 + (index % 3) * 0.025, 0.055, 1]}
          >
            <circleGeometry args={[1, 5]} />
            <meshStandardMaterial
              color={["#9a673a", "#7c5232", "#b17b45", "#6e6438"][index % 4]!}
              roughness={0.96}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function TravelChestDressing({ dimensions }: { dimensions: Vector3Tuple }) {
  return (
    <group>
      <PeriodCrate position={[0, 0, 0]} scale={dimensions} />
      {[-0.58, 0.58].map((x) => (
        <mesh key={`travel-chest-strap-${x}`} position={[x, 0.02, 0.45]} castShadow>
          <boxGeometry args={[0.13, 0.74, 0.05]} />
          <meshStandardMaterial color="#2b1b16" roughness={0.74} />
        </mesh>
      ))}
      <mesh position={[0, -0.02, 0.5]} castShadow>
        <boxGeometry args={[0.24, 0.27, 0.09]} />
        <meshStandardMaterial color="#a57835" roughness={0.46} metalness={0.72} />
      </mesh>
    </group>
  );
}

function ClimbingVineDressing({ height, seed }: { height: number; seed: number }) {
  return (
    <group>
      <mesh rotation={[0, 0, seed % 2 ? 0.08 : -0.08]} castShadow>
        <cylinderGeometry args={[0.025, 0.04, height, 7]} />
        <meshStandardMaterial color="#315c42" roughness={0.92} />
      </mesh>
      {Array.from({ length: 8 }, (_, leafIndex) => {
        const side = leafIndex % 2 ? 1 : -1;
        const y = -height / 2 + 0.25 + leafIndex * ((height - 0.5) / 7);
        return (
          <group key={`vine-leaf-${leafIndex}`} position={[side * 0.12, y, 0.04]}>
            <mesh
              position={[side * 0.08, 0, 0]}
              rotation={[0.24, seed * 0.19 + leafIndex * 0.31, side * 0.62]}
              scale={[0.24 + (leafIndex % 3) * 0.025, 0.085, 0.13]}
              castShadow
            >
              <sphereGeometry args={[1, 12, 6]} />
              <meshStandardMaterial
                color={["#376b4b", "#4f7e57", "#66865d"][(leafIndex + seed) % 3]}
                roughness={0.88}
              />
            </mesh>
            <mesh position={[side * 0.02, 0, 0]} rotation={[0, 0, side * Math.PI / 2]}>
              <cylinderGeometry args={[0.009, 0.014, 0.18, 6]} />
              <meshStandardMaterial color="#31553d" roughness={0.94} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function DressingModule({ instance }: { instance: Extract<ResolvedDressingInstance, { renderKind: "module" }> }) {
  const seed = Array.from(instance.dressingId).reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  ) % 11;
  if (instance.moduleKey === "attic-library") {
    return <AtticLibraryDressing rich={instance.density === "rich"} />;
  }
  if (instance.moduleKey === "travel-chest") {
    return <TravelChestDressing dimensions={instance.dimensions} />;
  }
  if (instance.moduleKey === "botanical-planter") {
    const scale = instance.dimensions[1] / 1.28;
    return (
      <BotanicalPlanter
        position={[0, -instance.dimensions[1] / 2, 0]}
        scale={scale}
        variant={seed}
      />
    );
  }
  return <ClimbingVineDressing height={instance.dimensions[1]} seed={seed} />;
}

function DressingAssets({ instances }: { instances: readonly ResolvedDressingInstance[] }) {
  return instances.map((instance) => {
    const userData = {
      dressingId: instance.dressingId,
      decorativeOnly: true,
      placementStatus: instance.placementStatus,
      ...(instance.renderKind === "asset"
        ? { catalogId: instance.catalogId }
        : { moduleKey: instance.moduleKey }),
    };
    if (instance.renderKind === "module") {
      return (
        <group
          key={instance.dressingId}
          name={instance.dressingId}
          position={instance.position}
          rotation={instance.rotation}
          userData={userData}
        >
          <DressingModule instance={instance} />
        </group>
      );
    }
    return (
      <group
        key={instance.dressingId}
        name={instance.dressingId}
        position={instance.position}
        rotation={instance.rotation}
        scale={instance.dimensions}
        userData={userData}
      >
        <EntityAsset asset={instance.asset} highlighted={false} highlightColor="#000000" />
      </group>
    );
  });
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
  const environmentModules = new Set(
    presentation.modules.environment.map((module) => module.moduleId),
  );
  const usesAtticKit = environmentModules.has("structure:timber-frame");
  const usesArchiveKit = environmentModules.has("structure:archive-shelves");
  const usesConservatoryKit = environmentModules.has("shell:glasshouse");
  const usesCourtyardKit = environmentModules.has("shell:open-air");
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
      {!usesConservatoryKit && !usesCourtyardKit && <mesh position={[0, bounds[1] / 2, -bounds[2] / 2]} receiveShadow>
        <boxGeometry args={[bounds[0], bounds[1], wallThickness]} />
        <meshStandardMaterial
          color={presentation.architecture.plasterWalls ? "#d3c5aa" : presentation.palette.wall}
          map={presentation.architecture.plasterWalls ? roomTextures.wallColor : undefined}
          normalMap={presentation.architecture.plasterWalls ? roomTextures.wallNormal : undefined}
          normalScale={new THREE.Vector2(0.48, 0.48)}
          roughnessMap={presentation.architecture.plasterWalls ? roomTextures.wallArm : undefined}
          roughness={0.98}
        />
      </mesh>}
      {!usesConservatoryKit && !usesCourtyardKit && <mesh position={[-bounds[0] / 2, bounds[1] / 2, 0]} receiveShadow>
        <boxGeometry args={[wallThickness, bounds[1], bounds[2]]} />
        <meshStandardMaterial
          color={presentation.architecture.plasterWalls ? "#d3c5aa" : presentation.palette.wall}
          map={presentation.architecture.plasterWalls ? roomTextures.wallColor : undefined}
          normalMap={presentation.architecture.plasterWalls ? roomTextures.wallNormal : undefined}
          normalScale={new THREE.Vector2(0.48, 0.48)}
          roughnessMap={presentation.architecture.plasterWalls ? roomTextures.wallArm : undefined}
          roughness={0.98}
        />
      </mesh>}
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
          <AtticRoofShell
            bounds={bounds}
            colorMap={roomTextures.floorColor}
            normalMap={roomTextures.floorNormal}
            roughnessMap={roomTextures.floorArm}
          />
          <AtticRoofFrame bounds={bounds} timberColor={presentation.palette.timber} />
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
          <mesh position={[0, 1.12, -bounds[2] / 2 + 0.075]} castShadow>
            <boxGeometry args={[bounds[0], 0.14, 0.16]} />
            <meshStandardMaterial color={presentation.palette.timber} roughness={0.92} />
          </mesh>
          <mesh position={[-bounds[0] / 2 + 0.075, 1.12, 0]} castShadow>
            <boxGeometry args={[0.16, 0.14, bounds[2]]} />
            <meshStandardMaterial color={presentation.palette.timber} roughness={0.92} />
          </mesh>
          {presentation.architecture.window && (
            <AtticWindow
              position={[-bounds[0] * 0.31, bounds[1] * 0.61, -bounds[2] / 2 + 0.075]}
            />
          )}
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
      ) : usesConservatoryKit ? (
        <ConservatoryKit bounds={bounds} presentation={presentation} />
      ) : usesCourtyardKit ? (
        <CourtyardKit bounds={bounds} presentation={presentation} />
      ) : (
        <gridHelper args={[Math.max(bounds[0], bounds[2]), 16, "#637270", "#394746"]} />
      )}
    </group>
  );
}

function MoonlightShafts({ bounds }: { bounds: Vector3Tuple }) {
  const shafts: Array<[number, number, number, number, number]> = [
    [bounds[0] * 0.2, bounds[1] * 0.57, -bounds[2] * 0.22, -0.78, 0.18],
  ];
  return (
    <group>
      {shafts.map(([x, y, z, rotationX, rotationZ], index) => (
        <mesh
          key={`moonlight-shaft-${index}`}
          position={[x, y, z]}
          rotation={[rotationX, 0, rotationZ]}
          renderOrder={-1}
        >
          <coneGeometry args={[1.15 + index * 0.22, bounds[1] * 1.35, 24, 1, true]} />
          <meshBasicMaterial
            color={index ? "#8fcac3" : "#b9e3df"}
            transparent
            opacity={index ? 0.035 : 0.05}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

function DustMotes({ bounds, color = "#f1d5ad" }: { bounds: Vector3Tuple; color?: string }) {
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
        color={color}
        size={0.028}
        transparent
        opacity={0.48}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

function RainStreaks({ bounds }: { bounds: Vector3Tuple }) {
  const streaks = useRef<THREE.LineSegments>(null);
  const streakCount = 84;
  const positions = useMemo(() => {
    const values = new Float32Array(streakCount * 2 * 3);
    for (let index = 0; index < streakCount; index += 1) {
      const seed = index + 1;
      const base = index * 6;
      const x = Math.sin(seed * 12.731) * bounds[0] * 0.48;
      const y = 0.35 + Math.abs(Math.sin(seed * 5.117)) * bounds[1];
      const z = Math.sin(seed * 8.433) * bounds[2] * 0.48;
      const length = 0.16 + (index % 5) * 0.025;
      values[base] = x;
      values[base + 1] = y;
      values[base + 2] = z;
      values[base + 3] = x - 0.035;
      values[base + 4] = y - length;
      values[base + 5] = z + 0.012;
    }
    return values;
  }, [bounds, streakCount]);

  useFrame((_, delta) => {
    if (!streaks.current) return;
    const attribute = streaks.current.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < streakCount; index += 1) {
      const top = index * 2;
      const bottom = top + 1;
      const speed = 2.9 + (index % 5) * 0.32;
      const nextBottom = attribute.getY(bottom) - delta * speed;
      if (nextBottom < 0.12) {
        const nextTop = bounds[1] + (index % 7) * 0.16;
        const length = 0.16 + (index % 5) * 0.025;
        attribute.setY(top, nextTop);
        attribute.setY(bottom, nextTop - length);
      } else {
        attribute.setY(top, attribute.getY(top) - delta * speed);
        attribute.setY(bottom, nextBottom);
      }
    }
    attribute.needsUpdate = true;
  });

  return (
    <lineSegments ref={streaks}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        color="#bed6da"
        transparent
        opacity={0.42}
        depthWrite={false}
      />
    </lineSegments>
  );
}

function Firelight({ item }: { item: LayoutItem }) {
  const light = useRef<THREE.PointLight>(null);
  const flame = useRef<THREE.Mesh>(null);
  const isFireplace = item.asset.key === "fireplace";
  const frontOffset = isFireplace ? 0.38 : 0;
  const height = isFireplace ? 0.58 : item.position[1];
  const outerFlameScale: Vector3Tuple = isFireplace ? [0.17, 0.34, 0.12] : [0.045, 0.11, 0.04];
  const innerFlameScale: Vector3Tuple = isFireplace ? [0.075, 0.22, 0.065] : [0.022, 0.065, 0.018];

  useFrame((state) => {
    const flicker =
      0.88 +
      Math.sin(state.clock.elapsedTime * 9.1) * 0.08 +
      Math.sin(state.clock.elapsedTime * 15.7) * 0.04;
    if (light.current) light.current.intensity = 3.5 * flicker;
    if (flame.current) flame.current.scale.y = outerFlameScale[1] * flicker;
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
      <mesh ref={flame} position={[0, isFireplace ? 0.04 : 0, 0]} scale={outerFlameScale}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial color="#ffb052" transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, isFireplace ? 0.09 : 0.015, 0]} scale={innerFlameScale}>
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
  const portalItem = layout.items.find((item) => isPortalItem(item));
  const portalLocked = portalItem?.entity.state?.locked === true;
  const portalAccentColor = portalLocked ? "#596765" : "#d79855";
  const portalAccentOpacity = portalLocked ? 0.3 : 0.72;

  return (
    <>
      {litItems.map((item) => (
        <Firelight key={`firelight-${item.entity.id}`} item={item} />
      ))}
      {portalItem && (
        <group position={portalItem.position}>
          <mesh position={[-portalItem.dimensions[0] / 2 - 0.05, 0, 0.17]}>
            <boxGeometry args={[0.06, portalItem.dimensions[1] + 0.16, 0.06]} />
            <meshBasicMaterial color={portalAccentColor} transparent opacity={portalAccentOpacity} />
          </mesh>
          <mesh position={[portalItem.dimensions[0] / 2 + 0.05, 0, 0.17]}>
            <boxGeometry args={[0.06, portalItem.dimensions[1] + 0.16, 0.06]} />
            <meshBasicMaterial color={portalAccentColor} transparent opacity={portalAccentOpacity} />
          </mesh>
          <mesh position={[0, portalItem.dimensions[1] / 2 + 0.05, 0.17]}>
            <boxGeometry args={[portalItem.dimensions[0] + 0.16, 0.06, 0.06]} />
            <meshBasicMaterial color={portalAccentColor} transparent opacity={portalAccentOpacity} />
          </mesh>
          {portalDestination && onLocationRequest && (
            <Html
              center
              position={[0, portalItem.dimensions[1] / 2 + 0.52, 0.28]}
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

function isPortalItem(item: LayoutItem): boolean {
  return /\b(?:door|gate|portal|hatch)\b/i.test(
    `${item.asset.key} ${item.entity.kind} ${item.entity.name}`,
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
  dressingInstances,
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
  dressingInstances: readonly ResolvedDressingInstance[];
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
  const isGlasshouse = presentation.modules.environment.some(
    (module) => module.moduleId === "shell:glasshouse",
  );
  const isCourtyard = presentation.modules.environment.some(
    (module) => module.moduleId === "shell:open-air",
  );

  return (
    <>
      <color attach="background" args={[presentation.palette.background]} />
      <fog
        attach="fog"
        args={[presentation.palette.fog, isCourtyard ? 7.5 : 10, isCourtyard ? 24 : 29]}
      />
      <hemisphereLight
        color={presentation.palette.keyLight}
        groundColor={presentation.palette.timber}
        intensity={
          isGlasshouse
            ? 0.48
            : isCourtyard
              ? 0.68
              : presentation.location.lighting.contrast === "high"
                ? 0.78
                : 0.95
        }
      />
      <ambientLight
        color={presentation.palette.ambient}
        intensity={
          presentation.location.lighting.ambientIntensity *
          (isGlasshouse ? 0.72 : isCourtyard ? 0.82 : 1)
        }
      />
      <directionalLight
        castShadow={enableShadows}
        color={presentation.palette.keyLight}
        position={
          isGlasshouse ? [3.8, 8.5, -3.4] : isCourtyard ? [-4.5, 8, 2.5] : [5, 8, 4]
        }
        intensity={presentation.location.lighting.keyIntensity * (isCourtyard ? 0.84 : 1)}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
        shadow-radius={isCourtyard ? 3 : 1}
      />
      {presentation.atmosphere.coolWindowLight && (
        <>
          <rectAreaLight
            color="#b9dce3"
            position={[
              bounds[0] * (isGlasshouse ? 0.22 : -0.31),
              bounds[1] * (isGlasshouse ? 0.72 : 0.61),
              -bounds[2] / 2 + 0.28,
            ]}
            intensity={isGlasshouse ? 4.2 : 3.4}
            width={isGlasshouse ? 3.1 : 2.4}
            height={isGlasshouse ? 2.5 : 1.8}
          />
          <pointLight
            color="#aacfd7"
            position={[
              bounds[0] * (isGlasshouse ? 0.22 : -0.31),
              bounds[1] * (isGlasshouse ? 0.68 : 0.58),
              -bounds[2] * 0.38,
            ]}
            intensity={isGlasshouse ? 2.8 : 2.35}
            distance={isGlasshouse ? 12 : 9}
            decay={1.8}
          />
        </>
      )}
      {presentation.atmosphere.coolWindowLight && isGlasshouse && (
        <MoonlightShafts bounds={bounds} />
      )}
      <Room
        layout={layout}
        presentation={presentation}
        onGroundNavigate={(target) => onCameraCommand("travel", target)}
      />
      <DressingAssets instances={dressingInstances} />
      {presentation.atmosphere.dust && (
        <DustMotes bounds={bounds} color={isGlasshouse ? "#b6e4dc" : "#f1d5ad"} />
      )}
      {presentation.atmosphere.rain && <RainStreaks bounds={bounds} />}
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
            isPortalItem(item) && portalDestination && onLocationRequest
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
  sceneRecipe,
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
  const [visiblePatchKey, setVisiblePatchKey] = useState("");
  const [cameraCommand, setCameraCommand] = useState<CameraCommand | null>(null);
  const [renderQuality, setRenderQuality] = useState<RenderQuality>("balanced");
  const cameraCommandId = useRef(0);
  const appliedPatch = useRef<string | null>(null);
  const appliedPatchValue = useRef<ScenePatch | null>(null);
  const notifiedPatch = useRef<string | null>(null);
  const assetRegistryRef = useRef(assetRegistry);
  assetRegistryRef.current = assetRegistry;

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
  }, [snapshot.storyId, snapshot.version]);

  useEffect(() => {
    setViewer((current) =>
      current.runtime
        ? { ...current, runtime: refreshSpatialRuntimeAssets(current.runtime, assetRegistry) }
        : current,
    );
  }, [assetRegistry]);

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
            assetRegistryRef.current,
          ),
          error: null,
        };
      } catch (error) {
        return { ...current, error: runtimeErrorFrom(error, "INVALID_LOCATION") };
      }
    });
  }, [activeLocationId]);

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
        const runtime = advanceSpatialRuntime(
          current.runtime,
          validatedPatch,
          assetRegistryRef.current,
        );
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
  }, [patch]);

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
    if (!patch || viewer.error) {
      setVisiblePatchKey("");
      return;
    }
    const patchKey = `${patch.fromVersion}:${patch.toVersion}`;
    setVisiblePatchKey(patchKey);
    const timeout = window.setTimeout(() => {
      setVisiblePatchKey((current) => (current === patchKey ? "" : current));
    }, 1_800);
    return () => window.clearTimeout(timeout);
  }, [patch, viewer.error]);

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
    () => (viewer.error || !visiblePatchKey ? new Map<string, ChangeKind>() : changeMapFromPatch(patch)),
    [patch, viewer.error, visiblePatchKey],
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
    const compiled = sceneRecipe?.locations[runtime.layout.location.id]?.presentation;
    if (
      compiled &&
      sceneRecipe.storyId === runtime.snapshot.storyId &&
      sceneRecipe.snapshotVersion === runtime.snapshot.version
    ) {
      return compiled;
    }
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
  }, [runtime?.layout.location.id, runtime?.snapshot, sceneRecipe, visualPlan]);
  const portalDestination =
    runtime && presentation?.portalTargetLocationId
      ? runtime.snapshot.locations.find(
          (location) => location.id === presentation.portalTargetLocationId,
        )
      : undefined;
  const dressingInstances = useMemo(() => {
    if (!runtime || !presentation) return [];
    const compiledLocation = sceneRecipe?.locations[runtime.layout.location.id];
    if (
      compiledLocation &&
      sceneRecipe.storyId === runtime.snapshot.storyId &&
      sceneRecipe.snapshotVersion === runtime.snapshot.version
    ) {
      return compiledLocation.dressingInstances;
    }
    return resolveDressingInstances(
      runtime.layout,
      presentation,
      sceneRecipe?.styleKit.id ?? "generic-grounded",
    );
  }, [presentation, runtime?.layout, runtime?.snapshot.storyId, runtime?.snapshot.version, sceneRecipe]);

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
      data-dressing-instances={dressingInstances.length}
      data-environment-modules={presentation?.modules.environment
        .map((module) => module.moduleId)
        .join(",") ?? ""}
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
            dressingInstances={dressingInstances}
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
