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
import { Bloom, EffectComposer, N8AO, Vignette } from "@react-three/postprocessing";
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
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import bushSafeMesh from "../data/converted/nature/bush-safe.mesh.json";
import fallenLogSafeMesh from "../data/converted/nature/fallen-log-safe.mesh.json";
import grassTuftSafeMesh from "../data/converted/nature/grass-tuft-safe.mesh.json";
import pineRoundSafeMesh from "../data/converted/nature/pine-round-safe.mesh.json";
import pineTallSafeMesh from "../data/converted/nature/pine-tall-safe.mesh.json";
import redMushroomsSafeMesh from "../data/converted/nature/red-mushrooms-safe.mesh.json";
import rockSafeMesh from "../data/converted/nature/rock-safe.mesh.json";
import treeOakSafeMesh from "../data/converted/nature/tree-oak-safe.mesh.json";
import {
  SAFE_MESH_CENTER_OFFSET,
  validateSafeMeshAsset,
} from "../runtime/safeMeshAsset";
import {
  ContractValidationError,
  validateScenePatch,
  validateWorldSnapshot,
} from "../contracts/validation";
import type {
  Conflict,
  Entity,
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
import {
  ARCHIVE_SHELF_LEVELS,
  createArchiveShelfBookSlots,
  createWornBookshelfBookSlots,
} from "../runtime/shelfComposition";
import { PatchVersionError } from "../runtime/applyScenePatch";
import {
  createExteriorNavigationLimits,
  createExteriorPovCameraPose,
  createOverviewCameraPose,
  createPovCameraPose,
  createTravelCameraPose,
  createWalkCameraPose,
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
  compileGhibliWoodlandLayout,
  woodlandPathCenter,
  type WoodlandGroundVariant,
  type WoodlandMood,
  type WoodlandTreeVariant,
} from "../runtime/ghibliWoodlandKit";
import { designedFallbackKind } from "../runtime/designedFallback";
import {
  IndustrialInteriorKit,
  UniversalNarrativeEnvironmentKit,
  UniversalLandscapeKit,
  UrbanStreetKit,
} from "./UniversalEnvironmentKits";

const bundledSafeMeshes: Readonly<Record<string, unknown>> = {
  "/models/converted/nature/tree-oak-safe.mesh.json": treeOakSafeMesh,
  "/models/converted/nature/bush-safe.mesh.json": bushSafeMesh,
  "/models/converted/nature/rock-safe.mesh.json": rockSafeMesh,
  "/models/converted/nature/pine-tall-safe.mesh.json": pineTallSafeMesh,
  "/models/converted/nature/pine-round-safe.mesh.json": pineRoundSafeMesh,
  "/models/converted/nature/fallen-log-safe.mesh.json": fallenLogSafeMesh,
  "/models/converted/nature/grass-tuft-safe.mesh.json": grassTuftSafeMesh,
  "/models/converted/nature/red-mushrooms-safe.mesh.json": redMushroomsSafeMesh,
};
import {
  compileScenePresentation,
  createFallbackScenePresentation,
  type ScenePresentation,
} from "../runtime/sceneCompiler";
import {
  createSceneAtmosphereProfile,
  type SceneAtmosphereProfile,
} from "../runtime/sceneAtmosphere";
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
  /** Optional reader action shown while the viewer owns the fullscreen surface. */
  onPassageAdvance?: () => void;
  passageActionLabel?: string;
  passageActionDisabled?: boolean;
  /** Optional room selection; defaults to the snapshot's first location. */
  activeLocationId?: string;
  assetRegistry?: AssetRegistry;
  className?: string;
}

type ChangeKind = "added" | "moved" | "changed" | "removed" | undefined;

type CameraCommand =
  | { id: number; kind: "pov" }
  | { id: number; kind: "overview" }
  | { id: number; kind: "travel"; target: Vector3Tuple }
  | { id: number; kind: "focus"; target: Vector3Tuple };
type CameraViewMode = "pov" | "overview";

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

function LoadedModel({
  url,
  draftGenerated = false,
  tint,
  foliageColor,
  shadows = true,
}: {
  url: string;
  draftGenerated?: boolean;
  tint?: string;
  foliageColor?: string;
  shadows?: boolean;
}) {
  const model = useGLTF(url);
  const renderedScene = useMemo(() => {
    if (!draftGenerated && !tint && !foliageColor) return model.scene;
    const clone = model.scene.clone(true);
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (draftGenerated) {
        const hasVertexColors = Boolean(object.geometry.getAttribute("color"));
        object.material = new THREE.MeshBasicMaterial({
          color: hasVertexColors ? "#ffffff" : "#a77a55",
          vertexColors: hasVertexColors,
          side: THREE.DoubleSide,
        });
      } else {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        const tinted = materials.map((material) => {
          const copy = material.clone();
          const isFoliage = /(?:leaf|leaves|foliage|needle|pine)/i.test(copy.name);
          if (foliageColor && isFoliage && "color" in copy && copy.color instanceof THREE.Color) {
            copy.color.set(foliageColor);
            if ("vertexColors" in copy) copy.vertexColors = false;
          } else if (tint && "color" in copy && copy.color instanceof THREE.Color) {
            copy.color.multiply(new THREE.Color(tint));
          }
          return copy;
        });
        object.material = Array.isArray(object.material) ? tinted : tinted[0]!;
      }
      object.castShadow = shadows;
      object.receiveShadow = true;
    });
    return clone;
  }, [draftGenerated, foliageColor, model.scene, shadows, tint]);
  useEffect(() => {
    if (!draftGenerated && !tint && !foliageColor) return;
    return () => {
      renderedScene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
    };
  }, [draftGenerated, foliageColor, renderedScene, tint]);
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
      {draftGenerated || tint ? (
        <primitive object={renderedScene} position={normalization.offset} />
      ) : (
        <Clone
          object={model.scene}
          position={normalization.offset}
          castShadow={shadows}
          receiveShadow
        />
      )}
    </group>
  );
}

function AdaptiveLoadedModel({ asset }: { asset: AssetDefinition }) {
  const group = useRef<THREE.Group>(null);
  const levels = useMemo(
    () => asset.lods ?? (asset.modelUrl ? [{ modelUrl: asset.modelUrl, minimumDistance: 0 }] : []),
    [asset.lods, asset.modelUrl],
  );
  const [modelUrl, setModelUrl] = useState(levels[0]?.modelUrl ?? asset.modelUrl ?? "");
  const activeUrl = useRef(modelUrl);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);
  const tint = asset.key === "storybook-lounge-chair"
    ? "#a94f49"
    : asset.key === "story-door"
      ? "#80583e"
      : undefined;

  useFrame(({ camera }) => {
    if (!group.current || levels.length < 2) return;
    group.current.getWorldPosition(worldPosition);
    const distance = camera.position.distanceTo(worldPosition);
    const selected = [...levels]
      .reverse()
      .find((level) => distance >= level.minimumDistance) ?? levels[0]!;
    if (selected.modelUrl === activeUrl.current) return;
    activeUrl.current = selected.modelUrl;
    setModelUrl(selected.modelUrl);
  });

  return (
    <group ref={group}>
      <LoadedModel
        key={modelUrl}
        url={modelUrl}
        draftGenerated={asset.key.startsWith("generated:")}
        tint={asset.key === "authored-birch-tree" ? "#73906d" : tint}
      />
      {asset.key === "worn-story-bookshelf" && <BookcaseContents />}
    </group>
  );
}

function BookcaseContents() {
  const colors = ["#7b443d", "#42605d", "#aa8751", "#5d5474", "#8c6a45", "#485f48"];
  // Measured shelf-top sockets from the approved normalized Poly Haven mesh.
  // Keeping these explicit prevents decorative books from intersecting a
  // different model's timber or leaving its lowest shelf mysteriously empty.
  const shelfRows = createWornBookshelfBookSlots();
  return (
    <group position={[0, 0, 0.39]} userData={{ decorativeOnly: true }}>
      {shelfRows.flatMap((row, shelfIndex) =>
        row.map((slot, bookIndex) => {
          return (
            <mesh
              key={`shelf-book-${shelfIndex}-${bookIndex}`}
              position={[slot.x, slot.y, 0]}
              rotation={[0, 0, bookIndex % 5 === 0 ? -0.055 : 0]}
              castShadow
            >
              <boxGeometry args={[slot.width, slot.height, slot.depth]} />
              <meshStandardMaterial color={colors[(bookIndex + shelfIndex * 2) % colors.length]} roughness={0.91} />
            </mesh>
          );
        }),
      )}
    </group>
  );
}

function StoryDoorAsset({ highlighted, highlightColor }: { highlighted: boolean; highlightColor: string }) {
  const wood = highlighted ? highlightColor : "#5d3929";
  const frame = highlighted ? highlightColor : "#34251f";
  return (
    <group>
      <RoundedBox args={[0.76, 0.91, 0.16]} radius={0.018} smoothness={3} position={[0, -0.035, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={wood} roughness={0.82} />
      </RoundedBox>
      {[-0.27, 0.27].flatMap((x) => [-0.24, 0.2].map((y) => (
        <group key={`${x}:${y}`} position={[x, y, 0.087]}>
          <mesh castShadow><boxGeometry args={[0.2, 0.29, 0.025]} /><meshStandardMaterial color="#3f291f" roughness={0.86} /></mesh>
          <mesh position={[0, 0, 0.016]}><boxGeometry args={[0.15, 0.235, 0.012]} /><meshStandardMaterial color="#714a34" roughness={0.8} /></mesh>
        </group>
      )))}
      {[-0.43, 0.43].map((x) => (
        <mesh key={x} position={[x, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.09, 1, 0.22]} />
          <meshStandardMaterial color={frame} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.455, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.95, 0.09, 0.22]} />
        <meshStandardMaterial color={frame} roughness={0.9} />
      </mesh>
      <mesh position={[0.25, -0.02, 0.12]} castShadow>
        <sphereGeometry args={[0.038, 16, 12]} />
        <meshStandardMaterial color="#b48a4b" metalness={0.72} roughness={0.32} />
      </mesh>
    </group>
  );
}

const safeMeshTemplates = new WeakMap<object, THREE.Group>();

function safeMeshTemplate(payload: unknown): THREE.Group {
  if (!payload || typeof payload !== "object") throw new Error("Safe mesh payload must be an object.");
  const cached = safeMeshTemplates.get(payload);
  if (cached) return cached;
  const asset = validateSafeMeshAsset(payload);
  const template = new THREE.Group();
  template.name = asset.label;
  template.userData = { sourceSha256: asset.sourceSha256, safeMesh: true };
  asset.meshes.forEach((entry) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(entry.positions, 3));
    if (entry.normals.length) {
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(entry.normals, 3));
    } else {
      geometry.computeVertexNormals();
    }
    if (entry.indices) geometry.setIndex(entry.indices);
    geometry.clearGroups();
    entry.groups.forEach((group) => geometry.addGroup(group.start, group.count, group.materialIndex));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const materials = entry.materials.map((material) => new THREE.MeshStandardMaterial({
      color: material.color,
      roughness: material.roughness,
      metalness: material.metalness,
      side: material.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    }));
    const mesh = new THREE.Mesh(geometry, materials.length === 1 ? materials[0] : materials);
    mesh.name = entry.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    template.add(mesh);
  });
  safeMeshTemplates.set(payload, template);
  return template;
}

function SafeMeshModel({ payload }: { payload: unknown }) {
  const template = useMemo(() => safeMeshTemplate(payload), [payload]);

  return (
    <group position={SAFE_MESH_CENTER_OFFSET}>
      <Clone object={template} castShadow receiveShadow />
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
    shape.moveTo(-0.48, -0.5);
    shape.lineTo(0.48, -0.5);
    shape.lineTo(0.48, 0.08);
    shape.absarc(0, 0.08, 0.48, 0, Math.PI, false);
    shape.lineTo(-0.5, -0.5);

    const opening = new THREE.Path();
    opening.moveTo(-0.28, -0.43);
    opening.lineTo(0.28, -0.43);
    opening.lineTo(0.28, 0.04);
    opening.absarc(0, 0.04, 0.28, 0, Math.PI, false);
    opening.lineTo(-0.28, -0.43);
    shape.holes.push(opening);
    return shape;
  }, []);
  const archExtrusion = useMemo(() => ({
    depth: 0.25,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.022,
    bevelThickness: 0.022,
    curveSegments: 18,
  }), []);

  return (
    <group>
      <mesh position={[0, -0.02, -0.14]} castShadow receiveShadow>
        <extrudeGeometry args={[archShape, archExtrusion]} />
        {stoneMaterial}
      </mesh>
      <mesh position={[0, -0.08, -0.155]} receiveShadow>
        <planeGeometry args={[0.54, 0.78]} />
        <meshStandardMaterial color="#211713" roughness={1} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      {[-0.275, 0.275].map((x) => (
        <mesh key={`firebox-cheek-${x}`} position={[x, -0.18, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.045, 0.5, 0.32]} />
          <meshStandardMaterial color="#49372f" roughness={1} />
        </mesh>
      ))}
      <RoundedBox
        args={[1.02, 0.09, 0.42]}
        radius={0.025}
        smoothness={3}
        position={[0, 0.53, 0.015]}
        castShadow
        receiveShadow
      >
        {stoneMaterial}
      </RoundedBox>
      <RoundedBox
        args={[0.96, 0.09, 0.58]}
        radius={0.018}
        smoothness={3}
        position={[0, -0.455, 0.14]}
        castShadow
        receiveShadow
      >
        {stoneMaterial}
      </RoundedBox>
      <mesh position={[0, -0.39, 0.12]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.5, 0.38]} />
        <meshStandardMaterial color="#251812" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {[-0.14, 0.14].map((x) => (
        <mesh key={x} position={[x, -0.34, 0.17]} rotation={[Math.PI / 2, 0, x * 1.5]} castShadow>
          <cylinderGeometry args={[0.045, 0.06, 0.38, 10]} />
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
  const frameDepths = Array.from(
    { length: 7 },
    (_, index) => -bounds[2] / 2 + 0.3 + ((bounds[2] - 0.6) / 6) * index,
  );

  return (
    <group>
      {frameDepths.map((z, index) => (
        <group key={`attic-truss-${index}`}>
          <TimberBeam
            start={[-halfWidth, eaveY, z]}
            end={[0, ridgeY, z]}
            color={timberColor}
            thickness={0.14}
            depth={0.16}
          />
          <TimberBeam
            start={[0, ridgeY, z]}
            end={[halfWidth, eaveY, z]}
            color={timberColor}
            thickness={0.14}
            depth={0.16}
          />
        </group>
      ))}
      {[0, -halfWidth, halfWidth].map((x) => (
        <mesh
          key={`attic-longitudinal-${x}`}
          position={[x, x === 0 ? ridgeY - 0.05 : eaveY - 0.02, 0]}
          castShadow
        >
          <boxGeometry args={[0.16, 0.16, bounds[2] - 0.3]} />
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
  const panelDepth = bounds[2] + 0.18;
  const panelZ = 0;
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
  entity,
  active,
  highlighted,
  highlightColor,
}: {
  entity: Entity;
  active: boolean;
  highlighted: boolean;
  highlightColor: string;
}) {
  const kind = designedFallbackKind(entity);
  const glow = highlighted ? highlightColor : "#000000";
  const glowIntensity = highlighted ? 0.3 : 0;

  if (kind === "light") {
    return (
      <StoryLanternAsset
        lit={active}
        highlighted={highlighted}
        highlightColor={highlightColor}
      />
    );
  }

  if (kind === "document") {
    return (
      <group>
        <RoundedBox args={[1, 0.32, 0.98]} radius={0.06} smoothness={3} castShadow receiveShadow>
          <meshStandardMaterial
            color="#6f3f2c"
            emissive={glow}
            emissiveIntensity={glowIntensity}
            roughness={0.8}
          />
        </RoundedBox>
        <RoundedBox
          args={[0.9, 0.18, 0.88]}
          radius={0.035}
          smoothness={2}
          position={[0.02, 0.2, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#d2b983" roughness={0.98} />
        </RoundedBox>
        <mesh position={[-0.38, 0.31, 0]} castShadow>
          <boxGeometry args={[0.065, 0.08, 0.9]} />
          <meshStandardMaterial color="#b58a4a" roughness={0.54} metalness={0.26} />
        </mesh>
      </group>
    );
  }

  if (kind === "table") {
    return (
      <group>
        <RoundedBox args={[1, 0.16, 0.82]} radius={0.035} smoothness={3} position={[0, 0.39, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#765039" emissive={glow} emissiveIntensity={glowIntensity} roughness={0.76} />
        </RoundedBox>
        {([-0.4, 0.4] as const).flatMap((x) => ([-0.3, 0.3] as const).map((z) => (
          <mesh key={`${x}:${z}`} position={[x, -0.06, z]} castShadow receiveShadow>
            <cylinderGeometry args={[0.055, 0.075, 0.78, 10]} />
            <meshStandardMaterial color="#4b3228" roughness={0.84} />
          </mesh>
        )))}
        <mesh position={[0, 0.22, 0.34]} castShadow>
          <boxGeometry args={[0.7, 0.16, 0.06]} />
          <meshStandardMaterial color="#5b3b2c" roughness={0.82} />
        </mesh>
      </group>
    );
  }

  if (kind === "seat") {
    return (
      <group>
        <RoundedBox args={[0.78, 0.13, 0.76]} radius={0.045} smoothness={3} position={[0, -0.03, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#765039" emissive={glow} emissiveIntensity={glowIntensity} roughness={0.78} />
        </RoundedBox>
        <RoundedBox args={[0.72, 0.7, 0.12]} radius={0.045} smoothness={3} position={[0, 0.28, 0.33]} castShadow receiveShadow>
          <meshStandardMaterial color="#5b3a2c" roughness={0.82} />
        </RoundedBox>
        {([-0.3, 0.3] as const).flatMap((x) => ([-0.28, 0.28] as const).map((z) => (
          <mesh key={`${x}:${z}`} position={[x, -0.3, z]} castShadow>
            <cylinderGeometry args={[0.035, 0.05, 0.5, 9]} />
            <meshStandardMaterial color="#3d2922" roughness={0.86} />
          </mesh>
        )))}
      </group>
    );
  }

  if (kind === "container") {
    return (
      <group>
        <RoundedBox args={[0.96, 0.68, 0.9]} radius={0.055} smoothness={3} position={[0, -0.12, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#745039" emissive={glow} emissiveIntensity={glowIntensity} roughness={0.82} />
        </RoundedBox>
        <RoundedBox args={[1, 0.18, 0.94]} radius={0.055} smoothness={3} position={[0, 0.32, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#8a6243" roughness={0.76} />
        </RoundedBox>
        {[-0.34, 0.34].map((x) => (
          <mesh key={x} position={[x, 0, 0]} castShadow>
            <boxGeometry args={[0.07, 0.92, 0.94]} />
            <meshStandardMaterial color="#8c6b3b" roughness={0.5} metalness={0.46} />
          </mesh>
        ))}
        <mesh position={[0, 0.08, 0.48]} castShadow>
          <boxGeometry args={[0.15, 0.22, 0.05]} />
          <meshStandardMaterial color="#b28a47" roughness={0.42} metalness={0.68} />
        </mesh>
      </group>
    );
  }

  if (kind === "portal") {
    return (
      <group>
        <RoundedBox args={[0.94, 1, 0.5]} radius={0.045} smoothness={3} castShadow receiveShadow>
          <meshStandardMaterial color="#624331" emissive={glow} emissiveIntensity={glowIntensity} roughness={0.79} />
        </RoundedBox>
        {[-0.26, 0.26].flatMap((x) => [-0.25, 0.24].map((y) => (
          <RoundedBox key={`${x}:${y}`} args={[0.38, 0.36, 0.06]} radius={0.02} smoothness={2} position={[x, y, 0.28]} castShadow>
            <meshStandardMaterial color="#79543b" roughness={0.76} />
          </RoundedBox>
        )))}
        <mesh position={[0.34, 0, 0.34]} castShadow>
          <sphereGeometry args={[0.055, 14, 10]} />
          <meshStandardMaterial color="#c49a4f" roughness={0.34} metalness={0.78} />
        </mesh>
      </group>
    );
  }

  if (kind === "person") {
    return (
      <group>
        {[-0.16, 0.16].map((x) => (
          <mesh key={x} position={[x, -0.33, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.34, 6, 10]} />
            <meshStandardMaterial color="#273b3c" roughness={0.88} />
          </mesh>
        ))}
        <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.25, 0.44, 8, 14]} />
          <meshStandardMaterial color="#496064" emissive={glow} emissiveIntensity={glowIntensity} roughness={0.72} />
        </mesh>
        <mesh position={[0, 0.41, 0]} castShadow>
          <sphereGeometry args={[0.16, 20, 14]} />
          <meshStandardMaterial color="#a98a70" roughness={0.8} />
        </mesh>
      </group>
    );
  }

  if (kind === "plant") {
    return <BotanicalPlanter position={[0, -0.5, 0]} scale={0.72} variant={2} />;
  }

  if (kind === "vessel") {
    return (
      <group>
        <mesh position={[0, -0.12, 0]} castShadow receiveShadow>
          <sphereGeometry args={[0.4, 24, 18]} />
          <meshStandardMaterial color="#6d7770" emissive={glow} emissiveIntensity={glowIntensity} roughness={0.68} metalness={0.12} />
        </mesh>
        <mesh position={[0, 0.27, 0]} castShadow>
          <cylinderGeometry args={[0.17, 0.26, 0.34, 22]} />
          <meshStandardMaterial color="#7f8a81" roughness={0.66} metalness={0.1} />
        </mesh>
        <mesh position={[0, 0.45, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.18, 0.035, 8, 24]} />
          <meshStandardMaterial color="#b18b54" roughness={0.48} metalness={0.5} />
        </mesh>
      </group>
    );
  }

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

function StoryLanternAsset({
  lit,
  highlighted,
  highlightColor,
}: {
  lit: boolean;
  highlighted: boolean;
  highlightColor: string;
}) {
  const brassEmissive = highlighted ? highlightColor : lit ? "#5b3216" : "#000000";
  const brassIntensity = highlighted ? 0.24 : lit ? 0.08 : 0;
  const glassMaterial = (
    <meshStandardMaterial
      color="#c2d5cf"
      emissive={lit ? "#8b542c" : "#17211f"}
      emissiveIntensity={lit ? 0.16 : 0.025}
      roughness={0.14}
      metalness={0}
      transparent
      opacity={0.09}
      depthWrite={false}
      side={THREE.DoubleSide}
    />
  );

  return (
    <group>
      <mesh position={[0, -0.43, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.34, 0.41, 0.12, 16]} />
        <meshStandardMaterial
          color="#8d642d"
          emissive={brassEmissive}
          emissiveIntensity={brassIntensity}
          roughness={0.48}
          metalness={0.68}
        />
      </mesh>
      <mesh position={[0, -0.345, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.31, 0.028, 7, 30]} />
        <meshStandardMaterial color="#b5873d" roughness={0.42} metalness={0.74} />
      </mesh>
      {([[-0.29, -0.29], [-0.29, 0.29], [0.29, -0.29], [0.29, 0.29]] as const).map(
        ([x, z]) => (
          <mesh key={`lantern-post-${x}-${z}`} position={[x, -0.03, z]} castShadow>
            <boxGeometry args={[0.045, 0.59, 0.045]} />
            <meshStandardMaterial
              color="#a97935"
              emissive={brassEmissive}
              emissiveIntensity={brassIntensity}
              roughness={0.43}
              metalness={0.76}
            />
          </mesh>
        ),
      )}
      {[-0.272, 0.272].map((z) => (
        <mesh key={`lantern-glass-z-${z}`} position={[0, -0.03, z]} renderOrder={3}>
          <planeGeometry args={[0.53, 0.52]} />
          {glassMaterial}
        </mesh>
      ))}
      {[-0.272, 0.272].map((x) => (
        <mesh
          key={`lantern-glass-x-${x}`}
          position={[x, -0.03, 0]}
          rotation={[0, Math.PI / 2, 0]}
          renderOrder={3}
        >
          <planeGeometry args={[0.53, 0.52]} />
          {glassMaterial}
        </mesh>
      ))}
      <mesh position={[0, -0.275, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.19, 0.24, 0.16, 18]} />
        <meshStandardMaterial
          color="#93672d"
          emissive={lit ? "#402511" : "#000000"}
          emissiveIntensity={lit ? 0.1 : 0}
          roughness={0.5}
          metalness={0.62}
        />
      </mesh>
      <mesh position={[0, -0.13, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.105, 0.16, 14]} />
        <meshStandardMaterial color="#b17e35" roughness={0.44} metalness={0.7} />
      </mesh>
      <mesh position={[0, -0.035, 0]}>
        <cylinderGeometry args={[0.019, 0.026, 0.08, 8]} />
        <meshStandardMaterial color="#2c2118" roughness={0.96} />
      </mesh>
      <mesh position={[0, 0.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.39, 0.13, 4]} />
        <meshStandardMaterial
          color="#a87832"
          emissive={brassEmissive}
          emissiveIntensity={brassIntensity}
          roughness={0.44}
          metalness={0.73}
        />
      </mesh>
      <mesh position={[0, 0.405, 0]} castShadow>
        <cylinderGeometry args={[0.105, 0.145, 0.1, 12]} />
        <meshStandardMaterial color="#765126" roughness={0.5} metalness={0.64} />
      </mesh>
      {[-0.19, 0.19].map((x) => (
        <mesh key={`lantern-handle-lug-${x}`} position={[x, 0.35, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.042, 0.042, 0.07, 12]} />
          <meshStandardMaterial color="#8e622b" roughness={0.46} metalness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 0.35, 0]}>
        <torusGeometry args={[0.19, 0.022, 8, 30, Math.PI]} />
        <meshStandardMaterial color="#a97a36" roughness={0.44} metalness={0.72} />
      </mesh>
    </group>
  );
}

function StoryPortraitAsset({ highlighted, highlightColor }: { highlighted: boolean; highlightColor: string }) {
  const frameGlow = highlighted ? highlightColor : "#2b170c";
  return (
    <group>
      <RoundedBox args={[0.98, 1, 0.2]} radius={0.035} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial color="#4b2d20" roughness={0.72} metalness={0.12} />
      </RoundedBox>
      <RoundedBox args={[0.79, 0.82, 0.22]} radius={0.025} smoothness={3} position={[0, 0, 0.04]} castShadow>
        <meshStandardMaterial color="#182c30" emissive="#101e22" emissiveIntensity={0.16} roughness={0.84} />
      </RoundedBox>
      {[-0.44, 0.44].map((x) => (
        <RoundedBox key={`portrait-side-${x}`} args={[0.105, 0.93, 0.24]} radius={0.022} smoothness={3} position={[x, 0, 0.08]} castShadow>
          <meshStandardMaterial color="#9b7140" emissive={frameGlow} emissiveIntensity={highlighted ? 0.22 : 0.03} roughness={0.48} metalness={0.42} />
        </RoundedBox>
      ))}
      {[-0.45, 0.45].map((y) => (
        <RoundedBox key={`portrait-cap-${y}`} args={[0.9, 0.105, 0.24]} radius={0.022} smoothness={3} position={[0, y, 0.08]} castShadow>
          <meshStandardMaterial color="#aa7d46" emissive={frameGlow} emissiveIntensity={highlighted ? 0.22 : 0.03} roughness={0.46} metalness={0.45} />
        </RoundedBox>
      ))}
      <mesh position={[0, 0.15, 0.18]} castShadow>
        <sphereGeometry args={[0.12, 24, 18]} />
        <meshStandardMaterial color="#b5967d" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.255, 0.16]} scale={[0.14, 0.11, 0.08]} castShadow>
        <sphereGeometry args={[1, 18, 12]} />
        <meshStandardMaterial color="#392a27" roughness={0.88} />
      </mesh>
      <mesh position={[0, -0.14, 0.17]} scale={[0.31, 0.34, 0.09]} castShadow>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial color="#342b3d" emissive="#17111d" emissiveIntensity={0.12} roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.3, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.17, 0.012, 8, 28, Math.PI]} />
        <meshStandardMaterial color="#bd965e" roughness={0.42} metalness={0.54} />
      </mesh>
    </group>
  );
}

function StoryBayWindowAsset({ highlighted, highlightColor }: { highlighted: boolean; highlightColor: string }) {
  const glassColor = highlighted ? highlightColor : "#8fc1ce";
  return (
    <group>
      <RoundedBox args={[1, 1, 0.32]} radius={0.025} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial color="#45372d" roughness={0.88} />
      </RoundedBox>
      <mesh position={[0, 0, 0.18]}>
        <planeGeometry args={[0.84, 0.82]} />
        <meshPhysicalMaterial color="#89aeb9" emissive={glassColor} emissiveIntensity={0.18} roughness={0.14} transmission={0.24} transparent opacity={0.72} depthWrite={false} />
      </mesh>
      {[-0.42, 0, 0.42].map((x) => (
        <RoundedBox key={`window-mullion-${x}`} args={[0.055, 0.88, 0.12]} radius={0.012} smoothness={2} position={[x, 0, 0.27]} castShadow>
          <meshStandardMaterial color="#75583d" roughness={0.78} />
        </RoundedBox>
      ))}
      {[-0.42, 0, 0.42].map((y) => (
        <RoundedBox key={`window-rail-${y}`} args={[0.9, 0.055, 0.12]} radius={0.012} smoothness={2} position={[0, y, 0.27]} castShadow>
          <meshStandardMaterial color="#75583d" roughness={0.78} />
        </RoundedBox>
      ))}
      <RoundedBox args={[1.12, 0.11, 0.58]} radius={0.02} smoothness={3} position={[0, -0.5, 0.12]} castShadow receiveShadow>
        <meshStandardMaterial color="#684c36" roughness={0.82} />
      </RoundedBox>
    </group>
  );
}

function StorySilverKeyAsset({ highlighted, highlightColor }: { highlighted: boolean; highlightColor: string }) {
  const glow = highlighted ? highlightColor : "#263238";
  return (
    <group rotation={[0, 0, -0.08]}>
      <mesh position={[-0.28, 0, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <torusGeometry args={[0.19, 0.045, 10, 36]} />
        <meshStandardMaterial color="#aab5b5" emissive={glow} emissiveIntensity={highlighted ? 0.28 : 0.04} roughness={0.34} metalness={0.88} />
      </mesh>
      <mesh position={[0.13, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.045, 0.055, 0.62, 12]} />
        <meshStandardMaterial color="#9fa9aa" roughness={0.38} metalness={0.9} />
      </mesh>
      <mesh position={[0.39, -0.11, 0]} castShadow>
        <boxGeometry args={[0.18, 0.2, 0.12]} />
        <meshStandardMaterial color="#9ca6a7" roughness={0.4} metalness={0.88} />
      </mesh>
      <mesh position={[0.48, 0.03, 0]} castShadow>
        <boxGeometry args={[0.12, 0.14, 0.12]} />
        <meshStandardMaterial color="#b5bfc0" roughness={0.36} metalness={0.9} />
      </mesh>
    </group>
  );
}

function StoryAmberPendantAsset({ highlighted, highlightColor }: { highlighted: boolean; highlightColor: string }) {
  return (
    <group>
      <mesh position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.32, 0.018, 8, 42]} />
        <meshStandardMaterial color="#b58a43" roughness={0.38} metalness={0.82} />
      </mesh>
      <mesh position={[0, -0.25, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.12, 0.025, 8, 28]} />
        <meshStandardMaterial color="#c29a52" roughness={0.34} metalness={0.84} />
      </mesh>
      <mesh position={[0, -0.06, 0]} scale={[0.33, 0.46, 0.28]} castShadow>
        <dodecahedronGeometry args={[1, 1]} />
        <meshPhysicalMaterial
          color="#d78524"
          emissive={highlighted ? highlightColor : "#6f2f0d"}
          emissiveIntensity={highlighted ? 0.42 : 0.22}
          roughness={0.16}
          metalness={0.08}
          transmission={0.22}
          thickness={0.8}
          transparent
          opacity={0.92}
        />
      </mesh>
      <pointLight position={[0, -0.02, 0.22]} color="#e89b3b" intensity={0.34} distance={1.4} decay={2} />
    </group>
  );
}

function StoryCanalAsset({ highlighted, highlightColor }: { highlighted: boolean; highlightColor: string }) {
  const water = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((state) => {
    if (!water.current) return;
    water.current.emissiveIntensity = 0.2 + Math.sin(state.clock.elapsedTime * 0.72) * 0.035;
  });
  return (
    <group>
      <mesh position={[0, -0.3, 0]} receiveShadow>
        <boxGeometry args={[0.78, 0.4, 1]} />
        <meshStandardMaterial color="#243f44" roughness={0.96} />
      </mesh>
      <mesh position={[0, -0.42, 0]} receiveShadow>
        <boxGeometry args={[0.78, 0.1, 1]} />
        <meshPhysicalMaterial
          ref={water}
          color="#3f7e88"
          emissive={highlighted ? highlightColor : "#1a505d"}
          emissiveIntensity={0.2}
          roughness={0.12}
          metalness={0.08}
          transmission={0.06}
          transparent
          opacity={0.88}
        />
      </mesh>
      {[-0.45, 0.45].map((x) => (
        <group key={`canal-bank-${x}`} position={[x, 0, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.16, 0.56, 1]} />
            <meshStandardMaterial color="#77766e" roughness={0.96} />
          </mesh>
          {Array.from({ length: 18 }, (_, index) => (
            <mesh key={`canal-cap-${index}`} position={[0, 0.095, -0.47 + index * 0.055]} rotation={[0, (index % 3 - 1) * 0.03, 0]} castShadow>
              <boxGeometry args={[0.19, 0.1, 0.05]} />
              <meshStandardMaterial color={index % 2 ? "#99978c" : "#85857d"} roughness={0.94} />
            </mesh>
          ))}
        </group>
      ))}
      {Array.from({ length: 11 }, (_, index) => (
        <mesh key={`canal-glint-${index}`} position={[(index % 3 - 1) * 0.18, -0.365, -0.45 + index * 0.09]} rotation={[-Math.PI / 2, 0, index * 0.21]}>
          <planeGeometry args={[0.16, 0.012]} />
          <meshBasicMaterial color="#b6e2df" transparent opacity={0.28} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function EntityAsset({
  asset,
  entity,
  active = false,
  highlighted,
  highlightColor,
}: {
  asset: AssetDefinition;
  entity?: Entity;
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

  if (asset.proceduralModel === "portrait") {
    return <StoryPortraitAsset highlighted={highlighted} highlightColor={highlightColor} />;
  }
  if (asset.proceduralModel === "bay-window") {
    return <StoryBayWindowAsset highlighted={highlighted} highlightColor={highlightColor} />;
  }
  if (asset.proceduralModel === "silver-key") {
    return <StorySilverKeyAsset highlighted={highlighted} highlightColor={highlightColor} />;
  }
  if (asset.proceduralModel === "amber-pendant") {
    return <StoryAmberPendantAsset highlighted={highlighted} highlightColor={highlightColor} />;
  }
  if (asset.proceduralModel === "canal") {
    return <StoryCanalAsset highlighted={highlighted} highlightColor={highlightColor} />;
  }
  if (asset.proceduralModel === "door") {
    return <StoryDoorAsset highlighted={highlighted} highlightColor={highlightColor} />;
  }

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
    const fallbackEntity = entity ?? {
      id: asset.key,
      name: asset.key.replace(/^fallback:/, ""),
      kind: asset.key.replace(/^fallback:/, ""),
      locationId: "presentation-only",
    };
    return (
      <DesignedFallbackAsset
        entity={fallbackEntity}
        active={active}
        highlighted={highlighted}
        highlightColor={highlightColor}
      />
    );
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

  if (asset.key === "lantern") {
    return (
      <StoryLanternAsset
        lit={active}
        highlighted={highlighted}
        highlightColor={highlightColor}
      />
    );
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

  if (asset.safeMeshUrl) {
    const payload = bundledSafeMeshes[asset.safeMeshUrl];
    if (!payload) return fallback;
    return (
      <ModelErrorBoundary key={asset.safeMeshUrl} fallback={fallback}>
        <SafeMeshModel payload={payload} />
      </ModelErrorBoundary>
    );
  }

  if (!asset.modelUrl) return fallback;

  return (
    <ModelErrorBoundary key={asset.modelUrl} fallback={fallback}>
      <Suspense fallback={null}>
        <AdaptiveLoadedModel asset={asset} />
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
      onClick={onActivate ?? onSelect}
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
          entity={item.entity}
          active={item.entity.state?.active === true || item.entity.state?.lit === true}
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
  overview,
}: {
  bounds: Vector3Tuple;
  presentation: ScenePresentation;
  overview: boolean;
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
    ...(!overview
      ? [[0, 0.34, bounds[2] / 2 - 0.1, bounds[0], 0.68, 0.2] as [number, number, number, number, number, number]]
      : []),
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
          {!overview && (
            <mesh position={[0, (eaveY + 0.68) / 2, bounds[2] / 2 - 0.115]}>
              <planeGeometry args={[bounds[0] - 0.25, eaveY - 0.68]} />
              {glassMaterial(0.2)}
            </mesh>
          )}
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
          {!overview && rearPosts.map((x, index) => (
            <mesh key={`glasshouse-front-post-${index}`} position={[x, eaveY / 2, bounds[2] / 2 - 0.08]}>
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
              {!overview && (
                <mesh position={[0, height, bounds[2] / 2 - 0.08]}>
                  <boxGeometry args={[bounds[0], 0.1, 0.12]} />
                  <meshStandardMaterial color={frameColor} roughness={0.56} metalness={0.58} />
                </mesh>
              )}
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

function CourtyardBeyond({
  bounds,
  pavement,
}: {
  bounds: Vector3Tuple;
  pavement: ReturnType<typeof usePbrSurface>;
}) {
  const approachDepth = bounds[2] * 1.8;
  const approachCenter = bounds[2] / 2 + approachDepth / 2;
  const roadWidth = Math.max(8, bounds[0] * 0.3);
  const vergeWidth = (bounds[0] * 2.2 - roadWidth) / 2;

  return (
    <group>
      <mesh position={[0, -0.09, approachCenter]} receiveShadow>
        <boxGeometry args={[roadWidth, 0.12, approachDepth]} />
        <meshStandardMaterial
          color="#8d918b"
          map={pavement.color}
          normalMap={pavement.normal}
          normalScale={new THREE.Vector2(0.28, 0.28)}
          roughnessMap={pavement.arm}
          roughness={0.78}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={`courtyard-verge-${side}`}
          position={[
            side * (roadWidth / 2 + vergeWidth / 2),
            -0.14,
            approachCenter,
          ]}
          receiveShadow
        >
          <boxGeometry args={[vergeWidth, 0.16, approachDepth]} />
          <meshStandardMaterial color="#26382e" roughness={1} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh
          key={`courtyard-distant-rise-${side}`}
          position={[side * bounds[0] * 0.58, -4.7, bounds[2] * 2.05]}
          scale={[bounds[0] * 0.72, 5.2, bounds[2] * 0.58]}
        >
          <sphereGeometry args={[1, 28, 14]} />
          <meshStandardMaterial color={side < 0 ? "#1d3028" : "#24382d"} roughness={1} />
        </mesh>
      ))}
    </group>
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

function CourtyardSideWall({
  bounds,
  side,
  wallHeight,
  surface,
}: {
  bounds: Vector3Tuple;
  side: -1 | 1;
  wallHeight: number;
  surface: ReturnType<typeof usePbrSurface>;
}) {
  const geometry = useMemo(() => {
    const depth = bounds[2];
    const taperLength = depth * 0.3;
    const shape = new THREE.Shape();
    shape.moveTo(-depth / 2, 0);
    shape.lineTo(depth / 2, 0);
    shape.lineTo(depth / 2, 0.16);
    shape.lineTo(depth / 2 - taperLength, wallHeight);
    shape.lineTo(-depth / 2, wallHeight);
    shape.closePath();

    const result = new THREE.ExtrudeGeometry(shape, {
      depth: 0.2,
      bevelEnabled: false,
      curveSegments: 1,
    });
    result.translate(0, 0, -0.1);
    result.computeVertexNormals();
    return result;
  }, [bounds[2], wallHeight]);

  return (
    <mesh
      geometry={geometry}
      position={[side * (bounds[0] / 2 - 0.08), 0, 0]}
      rotation={[0, -Math.PI / 2, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={side < 0 ? "#c9bda5" : "#c6baa2"}
        map={surface.color}
        normalMap={surface.normal}
        normalScale={new THREE.Vector2(0.38, 0.38)}
        roughnessMap={surface.arm}
        roughness={0.99}
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
  const genericGround = useMemo(() => {
    const base = new THREE.Color(presentation.palette.floor);
    const dark = base.clone().offsetHSL(-0.02, 0.02, -0.1).getStyle();
    const light = base.clone().offsetHSL(0.02, -0.02, 0.1).getStyle();
    const accent = base.clone().offsetHSL(0.08, 0.04, -0.04).getStyle();
    const texture = paintedGroundTexture(base.getStyle(), [dark, light, accent], 71237);
    texture.repeat.set(9, 9);
    return texture;
  }, [presentation.palette.floor]);
  useEffect(() => () => genericGround.dispose(), [genericGround]);
  const arcadeCenters = [-bounds[0] * 0.36, -bounds[0] * 0.18, bounds[0] * 0.18, bounds[0] * 0.36];
  const wallHeight = bounds[1] * 0.8;
  const wallSections: Array<[Vector3Tuple, Vector3Tuple, string]> = [
    [[0, wallHeight / 2, -bounds[2] / 2 + 0.08], [bounds[0], wallHeight, 0.2], "#d2c6ac"],
  ];
  const puddles: Array<{ position: Vector3Tuple; scale: Vector3Tuple }> = [
    { position: [-bounds[0] * 0.28, 0.075, bounds[2] * 0.22], scale: [1.25, 0.7, 1] },
    { position: [bounds[0] * 0.18, 0.075, bounds[2] * 0.06], scale: [0.82, 0.48, 1] },
    { position: [bounds[0] * 0.32, 0.075, -bounds[2] * 0.22], scale: [1.05, 0.55, 1] },
  ];

  return (
    <group>
      {!presentation.architecture.cobblestone && (
        <>
          <mesh position={[0, 0.018, 0]} receiveShadow>
            <boxGeometry args={[bounds[0], 0.08, bounds[2]]} />
            <meshStandardMaterial
              color="#d3d6cb"
              map={genericGround}
              roughness={0.98}
            />
          </mesh>
          <mesh position={[0, -0.09, 0]} receiveShadow>
            <boxGeometry args={[bounds[0] * 4, 0.12, bounds[2] * 4]} />
            <meshStandardMaterial
              color="#8f998c"
              map={genericGround}
              roughness={1}
            />
          </mesh>
        </>
      )}
      {presentation.architecture.cobblestone && (
        <>
          <CourtyardCobblestones bounds={bounds} pavement={pavement} />
          <CourtyardBeyond bounds={bounds} pavement={pavement} />
        </>
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
          <CourtyardSideWall bounds={bounds} side={-1} wallHeight={wallHeight} surface={wall} />
          <CourtyardSideWall bounds={bounds} side={1} wallHeight={wallHeight} surface={wall} />
          {[
            [[0, wallHeight + 0.08, -bounds[2] / 2 + 0.1], [bounds[0] + 0.18, 0.18, 0.46]],
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
      placementRegion: instance.placementRegion,
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
        {/lamp|light|chandelier/.test(instance.asset.key) && (
          <pointLight
            position={[0, 0.32, 0.08]}
            color="#f3b96d"
            intensity={1.1}
            distance={5.5}
            decay={2}
          />
        )}
      </group>
    );
  });
}

function paintedGroundTexture(
  base: string,
  flecks: readonly string[],
  seed: number,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable.");
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let index = 0; index < 1550; index += 1) {
    context.fillStyle = flecks[index % flecks.length]!;
    context.globalAlpha = 0.12 + random() * 0.28;
    const size = 0.7 + random() * 3.2;
    context.beginPath();
    context.ellipse(
      random() * canvas.width,
      random() * canvas.height,
      size * (0.7 + random()),
      size * 0.45,
      random() * Math.PI,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function WoodlandKit({
  bounds,
  presentation,
  renderQuality,
}: {
  bounds: Vector3Tuple;
  presentation: ScenePresentation;
  renderQuality: RenderQuality;
}) {
  const layout = useMemo(() => compileGhibliWoodlandLayout({
    locationId: presentation.location.locationId,
    bounds,
    archetype: presentation.location.archetype,
    visualDescription: presentation.location.visualDescription,
    mood: presentation.location.mood,
    timeOfDay: presentation.location.timeOfDay,
    architectureTags: presentation.location.architectureTags,
    dressingTags: presentation.location.dressingTags,
    dressingDensity: presentation.location.dressingDensity,
    quality: renderQuality,
  }), [bounds, presentation, renderQuality]);
  const moodColors: Record<WoodlandMood, {
    floor: string;
    floorFlecks: string[];
    path: string;
    pathFlecks: string[];
    horizon: string;
    glow: string;
  }> = {
    misty: {
      floor: "#354b38",
      floorFlecks: ["#1d3028", "#6d744b", "#765a38"],
      path: "#806b49",
      pathFlecks: ["#4e3d2d", "#aa9363", "#59634c"],
      horizon: "#2d493c",
      glow: "#bddab9",
    },
    sunlit: {
      floor: "#55753a",
      floorFlecks: ["#304f2d", "#8ca84d", "#8c6a38"],
      path: "#a38250",
      pathFlecks: ["#6f5535", "#d0ad68", "#718155"],
      horizon: "#5d813f",
      glow: "#ffe5a0",
    },
    autumn: {
      floor: "#685331",
      floorFlecks: ["#433324", "#a87934", "#91472c"],
      path: "#9b7447",
      pathFlecks: ["#5c3d29", "#c79a55", "#743f2b"],
      horizon: "#74542e",
      glow: "#ffd08a",
    },
    moonlit: {
      floor: "#263f3c",
      floorFlecks: ["#182b2b", "#415d53", "#544c3b"],
      path: "#655f55",
      pathFlecks: ["#3f4140", "#8b8171", "#485b56"],
      horizon: "#264847",
      glow: "#9dcbd2",
    },
    neutral: {
      floor: "#48613a",
      floorFlecks: ["#293f2d", "#77834c", "#765d38"],
      path: "#8e754c",
      pathFlecks: ["#57422e", "#baa06a", "#5d6b4f"],
      horizon: "#426040",
      glow: "#d5dcaa",
    },
  };
  const colors = moodColors[layout.mood];
  const textures = useMemo(() => {
    const floor = paintedGroundTexture(colors.floor, colors.floorFlecks, layout.seed);
    floor.repeat.set(8, 10);
    const path = paintedGroundTexture(colors.path, colors.pathFlecks, layout.seed ^ 0x85ebca6b);
    path.repeat.set(2.4, 8);
    return { floor, path };
  }, [layout.mood, layout.seed]);
  useEffect(() => () => {
    textures.floor.dispose();
    textures.path.dispose();
  }, [textures]);
  const trailShape = useMemo(() => {
    const shape = new THREE.Shape();
    const left: Array<[number, number]> = [];
    const right: Array<[number, number]> = [];
    for (let index = 0; index <= 28; index += 1) {
      const progress = index / 28;
      const z = -bounds[2] / 2 + progress * bounds[2];
      const center = woodlandPathCenter(z, bounds, layout.pathPhase, layout.pathAmplitude);
      const width = layout.pathWidth + Math.sin(progress * Math.PI * 3.1 + layout.pathPhase) * 0.28;
      left.push([center - width, z]);
      right.push([center + width, z]);
    }
    shape.moveTo(...left[0]!);
    left.slice(1).forEach((point) => shape.lineTo(...point));
    right.reverse().forEach((point) => shape.lineTo(...point));
    shape.closePath();
    return shape;
  }, [bounds, layout.pathAmplitude, layout.pathPhase, layout.pathWidth]);

  const treeUrls: Record<WoodlandTreeVariant, string> = {
    "broadleaf-1": "/models/optimized/quaternius/stylized-nature/commontree_1.glb",
    "broadleaf-3": "/models/optimized/quaternius/stylized-nature/commontree_3.glb",
    "broadleaf-5": "/models/optimized/quaternius/stylized-nature/commontree_5.glb",
    "pine-1": "/models/optimized/quaternius/stylized-nature/pine_1.glb",
    "pine-3": "/models/optimized/quaternius/stylized-nature/pine_3.glb",
    "pine-5": "/models/optimized/quaternius/stylized-nature/pine_5.glb",
    "twisted-2": "/models/optimized/quaternius/stylized-nature/twistedtree_2.glb",
  };
  const groundUrls: Record<WoodlandGroundVariant, string> = {
    "flower-bush": "/models/optimized/quaternius/stylized-nature/bush_common_flowers.glb",
    fern: "/models/optimized/quaternius/stylized-nature/fern_1.glb",
    flowers: "/models/optimized/quaternius/stylized-nature/flower_3_group.glb",
    "wispy-grass": "/models/optimized/quaternius/stylized-nature/grass_wispy_tall.glb",
    mushrooms: "/models/optimized/quaternius/stylized-nature/mushroom_common.glb",
    "rock-1": "/models/optimized/quaternius/stylized-nature/rock_medium_1.glb",
    "rock-2": "/models/optimized/quaternius/stylized-nature/rock_medium_2.glb",
    "rock-3": "/models/optimized/quaternius/stylized-nature/rock_medium_3.glb",
  };
  return (
    <group name="ghibli-woodland-kit" userData={{ decorativeOnly: true, grammarSeed: layout.seed }}>
      <mesh position={[0, -0.08, 0]} receiveShadow>
        <boxGeometry args={[bounds[0] * 3.2, 0.1, bounds[2] * 3.2]} />
        <meshStandardMaterial map={textures.floor} color="#98aa83" roughness={1} />
      </mesh>
      {presentation.architecture.forestFloor && (
        <mesh position={[0, 0.015, 0]} receiveShadow>
          <boxGeometry args={[bounds[0], 0.08, bounds[2]]} />
          <meshStandardMaterial map={textures.floor} color="#c1ccae" roughness={1} />
        </mesh>
      )}
      {presentation.architecture.earthTrail && (
        <mesh position={[0, 0.072, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <shapeGeometry args={[trailShape, 24]} />
          <meshStandardMaterial map={textures.path} color="#d1b581" roughness={0.98} />
        </mesh>
      )}
      {layout.trees.map((tree, index) => {
        const foliageColors: Record<WoodlandMood, readonly string[]> = {
          misty: ["#3f7046", "#527f4a", "#315c42", "#648b50"],
          sunlit: ["#62a844", "#84bd4a", "#4f913a", "#99c85a"],
          autumn: ["#cf6138", "#e18b3d", "#b84a35", "#e4ae4c"],
          moonlit: ["#35635d", "#47756b", "#2d5655", "#527d6f"],
          neutral: ["#4e8342", "#6b9848", "#3d713e", "#7aa451"],
        };
        return (
        <group
          key={`woodland-tree-${index}`}
          position={tree.position}
          rotation={[0, tree.rotationY, 0]}
          scale={tree.scale}
          userData={{ decorativeOnly: true, foreground: tree.foreground }}
        >
          <Suspense fallback={null}>
            <LoadedModel
              url={treeUrls[tree.variant]}
              foliageColor={foliageColors[layout.mood][index % 4]}
              shadows={tree.foreground}
            />
          </Suspense>
        </group>
        );
      })}
      {layout.groundCover.map((item, index) => (
        <group
          key={`woodland-ground-cover-${index}`}
          position={item.position}
          rotation={[0, item.rotationY, 0]}
          scale={item.scale}
          userData={{ decorativeOnly: true, foreground: item.foreground }}
        >
          <Suspense fallback={null}>
            <LoadedModel
              url={groundUrls[item.variant]}
              foliageColor={layout.mood === "sunlit" ? "#69a943" : "#52734a"}
              shadows={item.foreground}
            />
          </Suspense>
        </group>
      ))}
      {presentation.architecture.woodlandEdge && [-1, 1].flatMap((side) =>
        Array.from({ length: 5 }, (_, index) => (
          <mesh
            key={`woodland-bank-${side}-${index}`}
            position={[
              side * bounds[0] * (0.62 + (index % 2) * 0.06),
              -2.2,
              -bounds[2] * 0.58 + index * (bounds[2] * 0.29),
            ]}
            rotation={[0, index * 0.42, 0]}
            scale={[7.8, 2.6 + (index % 3) * 0.36, 8.4]}
            receiveShadow
          >
            <dodecahedronGeometry args={[1, 2]} />
            <meshStandardMaterial color={colors.horizon} roughness={1} />
          </mesh>
        )),
      )}
      <pointLight
        position={[0, 4.8, -bounds[2] * 0.42]}
        color={colors.glow}
        intensity={layout.mood === "sunlit" ? 2.4 : 1.35}
        distance={Math.max(bounds[0], bounds[2]) * 0.75}
        decay={1.7}
      />
    </group>
  );
}

function HistoricalInteriorDetails({
  bounds,
  presentation,
  overview,
}: {
  bounds: Vector3Tuple;
  presentation: ScenePresentation;
  overview: boolean;
}) {
  const timber = presentation.palette.timber;
  const rearPanels = Array.from({ length: 9 }, (_, index) => -bounds[0] / 2 + bounds[0] * ((index + 0.5) / 9));
  const sidePanels = Array.from({ length: 10 }, (_, index) => -bounds[2] / 2 + bounds[2] * ((index + 0.5) / 10));
  const panelWidth = bounds[0] / 9 - 0.12;
  const sidePanelWidth = bounds[2] / 10 - 0.12;
  const panelHeight = Math.min(1.55, bounds[1] * 0.24);

  const panel = (key: string, position: Vector3Tuple, width: number, yaw = 0) => (
    <group key={key} position={position} rotation={[0, yaw, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, panelHeight, 0.055]} />
        <meshStandardMaterial color="#4a3327" roughness={0.9} />
      </mesh>
      {[-width / 2 + 0.045, width / 2 - 0.045].map((x) => (
        <mesh key={`${key}-stile-${x}`} position={[x, 0, 0.042]} castShadow>
          <boxGeometry args={[0.07, panelHeight - 0.08, 0.065]} />
          <meshStandardMaterial color={timber} roughness={0.82} />
        </mesh>
      ))}
      {[-panelHeight / 2 + 0.055, panelHeight / 2 - 0.055].map((y) => (
        <mesh key={`${key}-rail-${y}`} position={[0, y, 0.042]} castShadow>
          <boxGeometry args={[width - 0.08, 0.075, 0.065]} />
          <meshStandardMaterial color={timber} roughness={0.82} />
        </mesh>
      ))}
    </group>
  );

  return (
    <group userData={{ decorativeOnly: true, module: "historical-interior-details" }}>
      {rearPanels.map((x, index) => panel(`rear-panel-${index}`, [x, panelHeight / 2 + 0.12, -bounds[2] / 2 + 0.095], panelWidth))}
      {sidePanels.map((z, index) => panel(`left-panel-${index}`, [-bounds[0] / 2 + 0.095, panelHeight / 2 + 0.12, z], sidePanelWidth, Math.PI / 2))}
      {!overview && rearPanels.map((x, index) => panel(`front-panel-${index}`, [x, panelHeight / 2 + 0.12, bounds[2] / 2 - 0.095], panelWidth, Math.PI))}
      {!overview && sidePanels.map((z, index) => panel(`right-panel-${index}`, [bounds[0] / 2 - 0.095, panelHeight / 2 + 0.12, z], sidePanelWidth, -Math.PI / 2))}
      {[
        [[0, panelHeight + 0.16, -bounds[2] / 2 + 0.12], [bounds[0], 0.12, 0.14]],
        [[-bounds[0] / 2 + 0.12, panelHeight + 0.16, 0], [0.14, 0.12, bounds[2]]],
        [[0, bounds[1] - 0.18, -bounds[2] / 2 + 0.13], [bounds[0], 0.2, 0.18]],
        [[-bounds[0] / 2 + 0.13, bounds[1] - 0.18, 0], [0.18, 0.2, bounds[2]]],
      ].map(([position, dimensions], index) => (
        <mesh key={`estate-moulding-${index}`} position={position as Vector3Tuple} castShadow>
          <boxGeometry args={dimensions as Vector3Tuple} />
          <meshStandardMaterial color={index < 2 ? timber : "#8d765e"} roughness={0.84} />
        </mesh>
      ))}
      {!overview && Array.from({ length: 6 }, (_, index) => (
        <mesh
          key={`estate-ceiling-beam-${index}`}
          position={[0, bounds[1] - 0.12, -bounds[2] * 0.4 + index * (bounds[2] * 0.16)]}
          castShadow
        >
          <boxGeometry args={[bounds[0], 0.18, 0.22]} />
          <meshStandardMaterial color={timber} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Room({
  layout,
  presentation,
  onGroundNavigate,
  overview,
  renderQuality,
}: {
  layout: WorldLayout;
  presentation: ScenePresentation;
  onGroundNavigate: (target: Vector3Tuple) => void;
  overview: boolean;
  renderQuality: RenderQuality;
}) {
  const bounds = layout.location.bounds ?? [12, 4.5, 10];
  const wallThickness = 0.12;
  const environmentModules = new Set(
    presentation.modules.environment.map((module) => module.moduleId),
  );
  const usesAtticKit = environmentModules.has("structure:timber-frame");
  const usesArchiveKit = environmentModules.has("structure:archive-shelves");
  const usesConservatoryKit = environmentModules.has("shell:glasshouse");
  const hasWoodlandSurface = environmentModules.has("surface:forest-floor");
  const usesNarrativeTerrain = presentation.semanticProfile.domain === "subterranean" ||
    (["volcanic", "aquatic"].includes(presentation.semanticProfile.domain) &&
      presentation.semanticProfile.enclosure !== "interior");
  const landscapeFamily = usesNarrativeTerrain
    ? null
    : presentation.architecture.alpineTerrain
    ? "alpine"
    : presentation.architecture.aridTerrain
      ? "arid"
      : presentation.architecture.coastalTerrain
        ? "coastal"
        : presentation.architecture.grassland
          ? "grassland"
          : null;
  const usesLandscapeKit = landscapeFamily !== null;
  const usesWoodlandKit = hasWoodlandSurface && !usesLandscapeKit;
  const usesUrbanKit = presentation.architecture.urbanStreet;
  const usesCourtyardKit = environmentModules.has("shell:open-air") && !usesWoodlandKit && !usesLandscapeKit && !usesUrbanKit && !usesNarrativeTerrain;
  const usesGenericKit = !usesAtticKit && !usesConservatoryKit && !usesCourtyardKit && !usesWoodlandKit && !usesLandscapeKit && !usesUrbanKit && !usesNarrativeTerrain;
  const texturedGenericFloor = usesGenericKit && presentation.architecture.floorboards;
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
  const archiveShelfCenters = [-0.42, -0.28, -0.14, 0, 0.14, 0.28, 0.42]
    .map((factor) => bounds[0] * factor);
  const archiveShelfLevels = ARCHIVE_SHELF_LEVELS;
  const atticGableShape = useMemo(() => {
    const eaveY = bounds[1] * 0.72;
    const ridgeY = bounds[1] - 0.16;
    const halfWidth = bounds[0] / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, 0);
    shape.lineTo(halfWidth, 0);
    shape.lineTo(halfWidth, eaveY);
    shape.lineTo(0, ridgeY);
    shape.lineTo(-halfWidth, eaveY);
    shape.closePath();
    return shape;
  }, [bounds[0], bounds[1]]);

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
        <meshStandardMaterial
          color={presentation.palette.floor}
          map={texturedGenericFloor ? roomTextures.floorColor : undefined}
          normalMap={texturedGenericFloor ? roomTextures.floorNormal : undefined}
          normalScale={new THREE.Vector2(0.5, 0.5)}
          roughnessMap={texturedGenericFloor ? roomTextures.floorArm : undefined}
          roughness={0.96}
        />
      </mesh>
      {usesGenericKit && <mesh position={[0, bounds[1] / 2, -bounds[2] / 2]} receiveShadow>
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
      {usesGenericKit && <mesh position={[-bounds[0] / 2, bounds[1] / 2, 0]} receiveShadow>
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
      {!overview && usesGenericKit && (
        <>
          <mesh position={[0, bounds[1] / 2, bounds[2] / 2]} receiveShadow>
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
          <mesh position={[bounds[0] / 2, bounds[1] / 2, 0]} receiveShadow>
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
          <mesh position={[0, bounds[1] - wallThickness / 2, 0]} receiveShadow>
            <boxGeometry args={[bounds[0], wallThickness, bounds[2]]} />
            <meshStandardMaterial
              color={presentation.architecture.plasterWalls ? "#d3c5aa" : presentation.palette.wall}
              map={presentation.architecture.plasterWalls ? roomTextures.wallColor : undefined}
              normalMap={presentation.architecture.plasterWalls ? roomTextures.wallNormal : undefined}
              normalScale={new THREE.Vector2(0.36, 0.36)}
              roughnessMap={presentation.architecture.plasterWalls ? roomTextures.wallArm : undefined}
              roughness={0.98}
              side={THREE.DoubleSide}
            />
          </mesh>
        </>
      )}
      {usesGenericKit && (
        <group>
          <mesh position={[0, 0.12, -bounds[2] / 2 + 0.09]} castShadow receiveShadow>
            <boxGeometry args={[bounds[0] - 0.18, 0.24, 0.12]} />
            <meshStandardMaterial color={presentation.palette.timber} roughness={0.78} />
          </mesh>
          <mesh position={[-bounds[0] / 2 + 0.09, 0.12, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.12, 0.24, bounds[2] - 0.18]} />
            <meshStandardMaterial color={presentation.palette.timber} roughness={0.78} />
          </mesh>
          {!overview && (
            <>
              <mesh position={[0, 0.12, bounds[2] / 2 - 0.09]} castShadow receiveShadow>
                <boxGeometry args={[bounds[0] - 0.18, 0.24, 0.12]} />
                <meshStandardMaterial color={presentation.palette.timber} roughness={0.78} />
              </mesh>
              <mesh position={[bounds[0] / 2 - 0.09, 0.12, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.12, 0.24, bounds[2] - 0.18]} />
                <meshStandardMaterial color={presentation.palette.timber} roughness={0.78} />
              </mesh>
            </>
          )}
        </group>
      )}
      {usesGenericKit && presentation.location.architectureTags.includes("estate-paneling") && (
        <HistoricalInteriorDetails bounds={bounds} presentation={presentation} overview={overview} />
      )}
      {presentation.architecture.industrialShell && (
        <IndustrialInteriorKit bounds={bounds} presentation={presentation} />
      )}
      <UniversalNarrativeEnvironmentKit bounds={bounds} presentation={presentation} />
      {usesAtticKit ? (
        <>
          <mesh position={[0, 0, -bounds[2] / 2 + 0.015]} receiveShadow>
            <shapeGeometry args={[atticGableShape]} />
            <meshStandardMaterial
              color="#d3c5aa"
              map={roomTextures.wallColor}
              normalMap={roomTextures.wallNormal}
              normalScale={new THREE.Vector2(0.48, 0.48)}
              roughnessMap={roomTextures.wallArm}
              roughness={0.98}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh
            position={[-bounds[0] / 2 + wallThickness / 2, wallTop / 2, 0]}
            receiveShadow
          >
            <boxGeometry args={[wallThickness, wallTop, bounds[2]]} />
            <meshStandardMaterial
              color="#d3c5aa"
              map={roomTextures.wallColor}
              normalMap={roomTextures.wallNormal}
              normalScale={new THREE.Vector2(0.48, 0.48)}
              roughnessMap={roomTextures.wallArm}
              roughness={0.98}
            />
          </mesh>
          {!overview && (
            <>
              <mesh
                position={[0, 0, bounds[2] / 2 - 0.015]}
                rotation={[0, Math.PI, 0]}
                receiveShadow
              >
                <shapeGeometry args={[atticGableShape]} />
                <meshStandardMaterial
                  color="#d3c5aa"
                  map={roomTextures.wallColor}
                  normalMap={roomTextures.wallNormal}
                  normalScale={new THREE.Vector2(0.48, 0.48)}
                  roughnessMap={roomTextures.wallArm}
                  roughness={0.98}
                  side={THREE.DoubleSide}
                />
              </mesh>
              <mesh
                position={[bounds[0] / 2 - wallThickness / 2, wallTop / 2, 0]}
                receiveShadow
              >
                <boxGeometry args={[wallThickness, wallTop, bounds[2]]} />
                <meshStandardMaterial
                  color="#d3c5aa"
                  map={roomTextures.wallColor}
                  normalMap={roomTextures.wallNormal}
                  normalScale={new THREE.Vector2(0.48, 0.48)}
                  roughnessMap={roomTextures.wallArm}
                  roughness={0.98}
                />
              </mesh>
            </>
          )}
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
          {!overview && (
            <AtticRoofShell
              bounds={bounds}
              colorMap={roomTextures.floorColor}
              normalMap={roomTextures.floorNormal}
              roughnessMap={roomTextures.floorArm}
            />
          )}
          {!overview && (
            <AtticRoofFrame bounds={bounds} timberColor={presentation.palette.timber} />
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
          {!overview && (
            <>
              {rearStuds.map((x, index) => (
                <mesh
                  key={`front-stud-${index}`}
                  position={[x, wallTop / 2, bounds[2] / 2 - 0.055]}
                  castShadow
                >
                  <boxGeometry args={[0.16, wallTop, 0.18]} />
                  <meshStandardMaterial color={presentation.palette.timber} roughness={0.94} />
                </mesh>
              ))}
              {sideStuds.map((z, index) => (
                <mesh
                  key={`right-stud-${index}`}
                  position={[bounds[0] / 2 - 0.055, wallTop / 2, z]}
                  castShadow
                >
                  <boxGeometry args={[0.18, wallTop, 0.16]} />
                  <meshStandardMaterial color={presentation.palette.timber} roughness={0.94} />
                </mesh>
              ))}
              {[
                [[0, 0.18, bounds[2] / 2 - 0.1], [bounds[0], 0.34, 0.18]],
                [[bounds[0] / 2 - 0.1, 0.18, 0], [0.18, 0.34, bounds[2]]],
                [[0, wallTop, bounds[2] / 2 - 0.04], [bounds[0], 0.2, 0.22]],
                [[bounds[0] / 2 - 0.04, wallTop, 0], [0.22, 0.2, bounds[2]]],
                [[0, 1.12, bounds[2] / 2 - 0.075], [bounds[0], 0.14, 0.16]],
                [[bounds[0] / 2 - 0.075, 1.12, 0], [0.16, 0.14, bounds[2]]],
              ].map(([position, dimensions], index) => (
                <mesh key={`attic-enclosure-beam-${index}`} position={position as Vector3Tuple} castShadow>
                  <boxGeometry args={dimensions as Vector3Tuple} />
                  <meshStandardMaterial color={presentation.palette.timber} roughness={0.94} />
                </mesh>
              ))}
            </>
          )}
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
              <mesh position={[0, 2.28, -0.05]} castShadow receiveShadow>
                <boxGeometry args={[2.55, 4.56, 0.16]} />
                <meshStandardMaterial color="#253633" roughness={0.96} />
              </mesh>
              <mesh position={[-1.21, 2.28, 0.12]} castShadow>
                <boxGeometry args={[0.14, 4.7, 0.54]} />
                <meshStandardMaterial color="#3a2920" roughness={0.92} />
              </mesh>
              <mesh position={[1.21, 2.28, 0.12]} castShadow>
                <boxGeometry args={[0.14, 4.7, 0.54]} />
                <meshStandardMaterial color="#3a2920" roughness={0.92} />
              </mesh>
              <mesh position={[0, 4.58, 0.14]} castShadow>
                <boxGeometry args={[2.58, 0.18, 0.58]} />
                <meshStandardMaterial color="#60452f" roughness={0.84} />
              </mesh>
              {archiveShelfLevels.map((level, levelIndex) => (
                <group key={`archive-shelf-level-${levelIndex}`}>
                  <mesh position={[0, level, 0.12]} castShadow>
                    <boxGeometry args={[2.55, 0.11, 0.56]} />
                    <meshStandardMaterial color="#4b3326" roughness={0.9} />
                  </mesh>
                  {createArchiveShelfBookSlots(level, levelIndex).map((slot, bookIndex) => {
                    return (
                      <mesh
                        key={`archive-book-${bookIndex}`}
                        position={[
                          slot.x,
                          slot.y,
                          0.17,
                        ]}
                        rotation={[0, 0, bookIndex % 4 === 0 ? -0.045 : 0]}
                        castShadow
                      >
                        <boxGeometry args={[slot.width, slot.height, slot.depth]} />
                        <meshStandardMaterial
                          color={["#78594a", "#657165", "#6f4a45", "#88714c"][
                            (bookIndex + levelIndex) % 4
                          ]}
                          roughness={0.94}
                        />
                      </mesh>
                    );
                  })}
                  <mesh position={[0, level - 0.085, 0.41]} castShadow>
                    <boxGeometry args={[0.36, 0.11, 0.025]} />
                    <meshStandardMaterial color="#b1884c" roughness={0.46} metalness={0.55} />
                  </mesh>
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
        <ConservatoryKit bounds={bounds} presentation={presentation} overview={overview} />
      ) : usesWoodlandKit ? (
        <WoodlandKit bounds={bounds} presentation={presentation} renderQuality={renderQuality} />
      ) : usesLandscapeKit && landscapeFamily ? (
        <UniversalLandscapeKit bounds={bounds} family={landscapeFamily} presentation={presentation} />
      ) : usesUrbanKit ? (
        <UrbanStreetKit
          bounds={bounds}
          presentation={presentation}
          hasCanal={layout.items.some((item) => item.asset.proceduralModel === "canal")}
        />
      ) : usesCourtyardKit ? (
        <CourtyardKit bounds={bounds} presentation={presentation} />
      ) : (
        null
      )}
    </group>
  );
}

function WeatherSky({
  bounds,
  profile,
}: {
  bounds: Vector3Tuple;
  profile: SceneAtmosphereProfile;
}) {
  const sky = useRef<THREE.Mesh>(null);
  const { topColor, horizonColor, cloudColor, cloudiness } = profile.sky;
  const uniforms = useMemo(() => ({
    topColor: { value: new THREE.Color(topColor) },
    horizonColor: { value: new THREE.Color(horizonColor) },
    cloudColor: { value: new THREE.Color(cloudColor) },
    cloudiness: { value: cloudiness },
  }), [cloudColor, cloudiness, horizonColor, topColor]);
  const radius = Math.min(80, Math.max(bounds[0], bounds[2]) * 2.1);

  useFrame(({ camera }) => {
    sky.current?.position.copy(camera.position);
  });

  return (
    <mesh ref={sky} renderOrder={-100} frustumCulled={false}>
      <sphereGeometry args={[radius, 48, 24]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
        uniforms={uniforms}
        vertexShader={`
          varying vec3 vSkyPosition;
          void main() {
            vSkyPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform vec3 topColor;
          uniform vec3 horizonColor;
          uniform vec3 cloudColor;
          uniform float cloudiness;
          varying vec3 vSkyPosition;
          void main() {
            vec3 direction = normalize(vSkyPosition);
            float heightMix = smoothstep(-0.08, 0.82, direction.y);
            vec3 sky = mix(horizonColor, topColor, heightMix);
            float cloudBands = sin(direction.x * 31.0 + direction.z * 8.0)
              + sin(direction.z * 24.0 - direction.x * 5.0)
              + sin((direction.x + direction.z) * 17.0);
            float clouds = smoothstep(0.45, 1.8, cloudBands) * cloudiness;
            clouds *= smoothstep(-0.05, 0.32, direction.y);
            sky = mix(sky, cloudColor, clouds * 0.14);
            gl_FragColor = vec4(sky, 1.0);
          }
        `}
      />
    </mesh>
  );
}

function GroundMist({ bounds, color }: { bounds: Vector3Tuple; color: string }) {
  const group = useRef<THREE.Group>(null);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context is unavailable.");
    const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62);
    gradient.addColorStop(0, "rgba(255,255,255,0.72)");
    gradient.addColorStop(0.42, "rgba(255,255,255,0.34)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    return result;
  }, []);
  const patches = useMemo(
    () => Array.from({ length: 12 }, (_, index) => {
      const seed = index + 1;
      return {
        position: [
          Math.sin(seed * 12.17) * bounds[0] * 0.42,
          0.5 + (index % 4) * 0.14,
          Math.cos(seed * 8.73) * bounds[2] * 0.43,
        ] as Vector3Tuple,
        scale: [
          6.8 + (index % 5) * 1.25,
          1.15 + (index % 3) * 0.28,
          1,
        ] as Vector3Tuple,
        opacity: 0.075 + (index % 4) * 0.018,
      };
    }),
    [bounds],
  );

  useEffect(() => () => texture.dispose(), [texture]);
  useFrame((state) => {
    if (!group.current) return;
    group.current.position.x = Math.sin(state.clock.elapsedTime * 0.035) * 0.45;
    group.current.position.z = Math.cos(state.clock.elapsedTime * 0.028) * 0.32;
  });

  return (
    <group ref={group} renderOrder={-2}>
      {patches.map((patch, index) => (
        <sprite key={`ground-mist-${index}`} position={patch.position} scale={patch.scale}>
          <spriteMaterial
            map={texture}
            color={color}
            transparent
            opacity={patch.opacity}
            depthWrite={false}
            fog
          />
        </sprite>
      ))}
    </group>
  );
}

function SceneToneMapping({ exposure }: { exposure: number }) {
  const { gl } = useThree();
  useEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [exposure, gl]);
  return null;
}

/** Adds a local, network-free reflection/light probe for every PBR material. */
function SceneImageLighting({ intensity }: { intensity: number }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const previousEnvironment = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    const generator = new THREE.PMREMGenerator(gl);
    const environment = new RoomEnvironment();
    const target = generator.fromScene(environment, 0.04);
    scene.environment = target.texture;

    return () => {
      if (scene.environment === target.texture) scene.environment = previousEnvironment;
      scene.environmentIntensity = previousIntensity;
      target.dispose();
      environment.dispose();
      generator.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    scene.environmentIntensity = intensity;
  }, [intensity, scene]);

  return null;
}

function ObjectContactShadows({
  layout,
  color,
  opacity,
}: {
  layout: WorldLayout;
  color: string;
  opacity: number;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context is unavailable.");
    const gradient = context.createRadialGradient(48, 48, 2, 48, 48, 46);
    gradient.addColorStop(0, "rgba(255,255,255,0.82)");
    gradient.addColorStop(0.58, "rgba(255,255,255,0.38)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 96, 96);
    return new THREE.CanvasTexture(canvas);
  }, []);
  const groundedItems = layout.items.filter((item) => {
    const bottom = item.position[1] - item.dimensions[1] / 2;
    return Math.abs(bottom) < 0.13 && item.dimensions[1] >= 0.14;
  });

  useEffect(() => () => texture.dispose(), [texture]);

  return groundedItems.map((item) => (
    <mesh
      key={`contact-shadow-${item.entity.id}`}
      position={[item.position[0], 0.026, item.position[2]]}
      rotation={[-Math.PI / 2, 0, item.rotation[1]]}
      scale={[
        Math.max(0.42, item.dimensions[0] * 1.08),
        Math.max(0.38, item.dimensions[2] * 1.08),
        1,
      ]}
      renderOrder={1}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={texture}
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </mesh>
  ));
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
  const outerFlameScale: Vector3Tuple = isFireplace ? [0.17, 0.34, 0.12] : [0.042, 0.08, 0.038];
  const innerFlameScale: Vector3Tuple = isFireplace ? [0.075, 0.22, 0.065] : [0.02, 0.048, 0.016];

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
      <mesh ref={flame} position={[0, isFireplace ? 0.04 : -0.015, 0]} scale={outerFlameScale}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial color="#ffb052" transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, isFireplace ? 0.09 : -0.005, 0]} scale={innerFlameScale}>
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

  return (
    <>
      {litItems.map((item) => (
        <Firelight key={`firelight-${item.entity.id}`} item={item} />
      ))}
      {portalItem && (
        <group position={portalItem.position} rotation={portalItem.rotation}>
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
  walkMode,
  openAir,
}: {
  layout: WorldLayout;
  command: CameraCommand | null;
  walkMode: boolean;
  openAir: boolean;
}) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null);
  const walkInput = useRef({ forward: false, backward: false, left: false, right: false });
  const walkLook = useRef({ yaw: 0, pitch: 0, pointerId: null as number | null });
  const bounds = layout.location.bounds ?? [12, 4.5, 10];
  const { camera, gl } = useThree();
  const initialPov = useCallback(
    () => openAir ? createExteriorPovCameraPose(bounds) : createPovCameraPose(bounds),
    [bounds[0], bounds[1], bounds[2], openAir],
  );
  const walkLimits = useMemo(
    () => openAir ? createExteriorNavigationLimits(bounds) : undefined,
    [bounds[0], bounds[1], bounds[2], openAir],
  );

  useEffect(() => {
    if (walkMode) return;
    const pov = initialPov();
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
      ...pov.position,
      ...pov.target,
      false,
    );
    currentControls.saveState();
  }, [bounds[0], bounds[1], bounds[2], initialPov, layout.location.id, walkMode]);

  useEffect(() => {
    if (!walkMode) {
      walkInput.current = { forward: false, backward: false, left: false, right: false };
      return;
    }

    const pose = initialPov();
    const direction = new THREE.Vector3(...pose.target)
      .sub(new THREE.Vector3(...pose.position))
      .normalize();
    walkLook.current.yaw = Math.atan2(direction.x, -direction.z);
    walkLook.current.pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);

    const setKey = (event: KeyboardEvent, pressed: boolean) => {
      const key = event.key.toLowerCase();
      if (key === "w") walkInput.current.forward = pressed;
      else if (key === "s") walkInput.current.backward = pressed;
      else if (key === "a") walkInput.current.left = pressed;
      else if (key === "d") walkInput.current.right = pressed;
      else return;
      event.preventDefault();
    };
    const onKeyDown = (event: KeyboardEvent) => setKey(event, true);
    const onKeyUp = (event: KeyboardEvent) => setKey(event, false);
    const stopWalking = () => {
      walkInput.current = { forward: false, backward: false, left: false, right: false };
      walkLook.current.pointerId = null;
    };
    const onPointerDown = (event: PointerEvent) => {
      walkLook.current.pointerId = event.pointerId;
      gl.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (walkLook.current.pointerId !== event.pointerId) return;
      walkLook.current.yaw -= event.movementX * 0.0026;
      walkLook.current.pitch = THREE.MathUtils.clamp(
        walkLook.current.pitch - event.movementY * 0.0022,
        -1.25,
        1.25,
      );
    };
    const onPointerUp = (event: PointerEvent) => {
      if (walkLook.current.pointerId !== event.pointerId) return;
      walkLook.current.pointerId = null;
      if (gl.domElement.hasPointerCapture(event.pointerId)) {
        gl.domElement.releasePointerCapture(event.pointerId);
      }
    };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", stopWalking);
    gl.domElement.addEventListener("pointerdown", onPointerDown);
    gl.domElement.addEventListener("pointermove", onPointerMove);
    gl.domElement.addEventListener("pointerup", onPointerUp);
    gl.domElement.addEventListener("pointercancel", onPointerUp);
    gl.domElement.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", stopWalking);
      gl.domElement.removeEventListener("pointerdown", onPointerDown);
      gl.domElement.removeEventListener("pointermove", onPointerMove);
      gl.domElement.removeEventListener("pointerup", onPointerUp);
      gl.domElement.removeEventListener("pointercancel", onPointerUp);
      gl.domElement.removeEventListener("contextmenu", onContextMenu);
      stopWalking();
    };
  }, [bounds[0], bounds[1], bounds[2], camera, gl, initialPov, walkMode]);

  useFrame((_, delta) => {
    if (!walkMode) return;
    const { yaw, pitch } = walkLook.current;
    const direction = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    const currentPosition: Vector3Tuple = [camera.position.x, camera.position.y, camera.position.z];
    const currentTarget: Vector3Tuple = [
      camera.position.x + direction.x,
      camera.position.y + direction.y,
      camera.position.z + direction.z,
    ];
    const pose = createWalkCameraPose(
      currentPosition,
      currentTarget,
      walkInput.current,
      Math.min(delta, 0.05),
      bounds,
      walkLimits,
    );
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
  });

  useEffect(() => {
    const currentControls = controls.current;
    if (walkMode || !command || !currentControls) return;
    const currentPosition = currentControls.getPosition(new THREE.Vector3(), true);
    const currentTarget = currentControls.getTarget(new THREE.Vector3(), true);
    let pose;
    if (command.kind === "pov") {
      pose = initialPov();
    } else if (command.kind === "overview") {
      pose = createOverviewCameraPose(bounds);
    } else {
      pose = createTravelCameraPose(
        [currentPosition.x, currentPosition.y, currentPosition.z],
        [currentTarget.x, currentTarget.y, currentTarget.z],
        command.target,
        bounds,
      );
    }
    currentControls.cancel();
    void currentControls.setLookAt(...pose.position, ...pose.target, true);
  }, [bounds[0], bounds[1], bounds[2], command, initialPov, walkMode]);

  if (walkMode) return null;

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
  cameraView,
  walkMode,
  renderQuality,
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
  cameraView: CameraViewMode;
  walkMode: boolean;
  renderQuality: RenderQuality;
}) {
  const bounds = layout.location.bounds ?? [12, 4.5, 10];
  const isGlasshouse = presentation.modules.environment.some(
    (module) => module.moduleId === "shell:glasshouse",
  );
  const atmosphereProfile = useMemo(
    () => createSceneAtmosphereProfile(presentation, bounds),
    [bounds, presentation],
  );
  const usesGhibliWoodland = presentation.architecture.forestFloor
    && !presentation.architecture.alpineTerrain
    && !presentation.architecture.aridTerrain
    && !presentation.architecture.coastalTerrain
    && !presentation.architecture.grassland;

  return (
    <>
      <color attach="background" args={[presentation.palette.background]} />
      <SceneToneMapping exposure={atmosphereProfile.exposure} />
      <SceneImageLighting intensity={atmosphereProfile.environmentIntensity} />
      {(atmosphereProfile.openAir || isGlasshouse) && (
        <WeatherSky bounds={bounds} profile={atmosphereProfile} />
      )}
      <fog
        attach="fog"
        args={[
          atmosphereProfile.family === "woodland"
            ? atmosphereProfile.sky.horizonColor
            : presentation.palette.fog,
          atmosphereProfile.fogNear,
          atmosphereProfile.fogFar,
        ]}
      />
      <hemisphereLight
        color={presentation.palette.keyLight}
        groundColor={presentation.palette.timber}
        intensity={atmosphereProfile.hemisphereIntensity}
      />
      <ambientLight
        color={presentation.palette.ambient}
        intensity={
          presentation.location.lighting.ambientIntensity *
          atmosphereProfile.ambientScale
        }
      />
      <directionalLight
        castShadow={enableShadows}
        color={presentation.palette.keyLight}
        position={atmosphereProfile.keyPosition}
        intensity={presentation.location.lighting.keyIntensity * atmosphereProfile.keyScale}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
        shadow-radius={atmosphereProfile.openAir ? 3 : 1}
      />
      <directionalLight
        color={presentation.palette.ambient}
        position={atmosphereProfile.fillPosition}
        intensity={atmosphereProfile.fillIntensity}
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
        overview={cameraView === "overview"}
        renderQuality={renderQuality}
      />
      {!usesGhibliWoodland && <DressingAssets instances={dressingInstances} />}
      {presentation.atmosphere.dust && (
        <DustMotes bounds={bounds} color={isGlasshouse ? "#b6e4dc" : "#f1d5ad"} />
      )}
      {presentation.atmosphere.rain && atmosphereProfile.openAir && <RainStreaks bounds={bounds} />}
      {presentation.atmosphere.groundMist && cameraView !== "overview" && (
        <GroundMist bounds={bounds} color={presentation.palette.fog} />
      )}
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
      {enableShadows && (
        <ObjectContactShadows
          layout={layout}
          color={presentation.palette.background}
          opacity={atmosphereProfile.contactShadow.opacity * 0.52}
        />
      )}
      <RelationAwareness edges={relationEdges} />
      {renderQuality !== "low" && !usesGhibliWoodland && (
        <EffectComposer multisampling={renderQuality === "high" ? 4 : 0}>
          <N8AO
            aoRadius={atmosphereProfile.openAir ? 2.2 : 1.35}
            distanceFalloff={0.72}
            intensity={renderQuality === "high" ? 2.15 : 1.65}
            quality={renderQuality === "high" ? "high" : "medium"}
            halfRes={renderQuality !== "high"}
            color="#14201e"
          />
          <Bloom
            mipmapBlur
            luminanceThreshold={1.05}
            luminanceSmoothing={0.28}
            intensity={0.34}
            radius={0.55}
          />
          <Vignette offset={0.22} darkness={0.34} />
        </EffectComposer>
      )}
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
      <SceneCamera
        layout={layout}
        command={cameraCommand}
        walkMode={walkMode}
        openAir={atmosphereProfile.openAir}
      />
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
  onPassageAdvance,
  passageActionLabel = "Next passage",
  passageActionDisabled = false,
  activeLocationId,
  assetRegistry = defaultAssetRegistry,
  className,
}: WorldViewerProps) {
  const [viewer, setViewer] = useState(() =>
    createViewerState(snapshot, assetRegistry, activeLocationId),
  );
  const [visiblePatchKey, setVisiblePatchKey] = useState("");
  const [cameraCommand, setCameraCommand] = useState<CameraCommand | null>(null);
  const [cameraView, setCameraView] = useState<CameraViewMode>("pov");
  const [walkMode, setWalkMode] = useState(false);
  const [renderQuality, setRenderQuality] = useState<RenderQuality>("balanced");
  const viewerElement = useRef<HTMLDivElement>(null);
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

  const requestCameraView = useCallback((view: CameraViewMode) => {
    cameraCommandId.current += 1;
    setCameraView(view);
    setCameraCommand({ id: cameraCommandId.current, kind: view });
  }, []);

  const enterWalkMode = useCallback(async () => {
    const element = viewerElement.current;
    if (!element) return;
    requestCameraView("pov");
    try {
      await element.requestFullscreen();
      setWalkMode(true);
    } catch {
      setWalkMode(false);
    }
  }, [requestCameraView]);

  const leaveWalkMode = useCallback(() => {
    if (document.fullscreenElement === viewerElement.current) {
      void document.exitFullscreen();
    } else {
      setWalkMode(false);
    }
  }, []);

  useEffect(() => {
    const syncFullscreenState = () => {
      setWalkMode(document.fullscreenElement === viewerElement.current);
    };
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    setViewer(createViewerState(snapshot, assetRegistry, activeLocationId));
    appliedPatch.current = null;
    appliedPatchValue.current = null;
    notifiedPatch.current = null;
    setCameraView("pov");
    setCameraCommand(null);
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
    setCameraView("pov");
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
      ref={viewerElement}
      className={["world-viewer", className].filter(Boolean).join(" ")}
      data-runtime-status={viewer.error ? "error" : "ready"}
      data-story-id={runtime?.snapshot.storyId ?? "invalid"}
      data-world-version={runtime?.snapshot.version ?? "invalid"}
      data-location-id={runtime?.layout.location.id ?? "invalid"}
      data-navigation-mode={walkMode ? "walk" : "map"}
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
            cameraView={cameraView}
            walkMode={walkMode}
            renderQuality={renderQuality}
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
        <div className="world-camera-modes" role="group" aria-label="Camera view">
          <button
            type="button"
            aria-pressed={cameraView === "pov"}
            onClick={() => {
              requestCameraView("pov");
              onEntitySelect?.(null);
            }}
          >
            POV
          </button>
          <button
            type="button"
            aria-pressed={cameraView === "overview"}
            onClick={() => {
              if (walkMode) leaveWalkMode();
              requestCameraView("overview");
              onEntitySelect?.(null);
            }}
          >
            Overview
          </button>
          <button
            type="button"
            aria-pressed={walkMode}
            onClick={() => {
              if (walkMode) leaveWalkMode();
              else void enterWalkMode();
              onEntitySelect?.(null);
            }}
          >
            {walkMode ? "Exit walk" : "Walk fullscreen"}
          </button>
        </div>
      )}
      {walkMode && (
        <div className="world-walk-footer">
          <div className="world-walk-hint" role="status">
            <strong>WASD</strong> move <span aria-hidden="true">·</span> drag to look <span aria-hidden="true">·</span> click doors to enter <span aria-hidden="true">·</span> Esc exits
          </div>
          {onPassageAdvance && (
            <button
              type="button"
              className="world-walk-passage"
              disabled={passageActionDisabled}
              onClick={onPassageAdvance}
            >
              {passageActionLabel}
            </button>
          )}
        </div>
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
