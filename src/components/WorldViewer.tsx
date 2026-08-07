import {
  CameraControls,
  CameraControlsImpl,
  Clone,
  Html,
  Line,
  PerformanceMonitor,
  RoundedBox,
  useGLTF,
  useProgress,
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
  resolveAsset,
  type AssetDefinition,
  type AssetRegistry,
} from "../runtime/assetRegistry";
import type { LayoutItem, WorldLayout } from "../runtime/layoutEngine";
import {
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
import { WALL_COMPOSITION } from "../runtime/wallComposition";
import { URBAN_HUMAN_SCALE } from "../runtime/urbanComposition";
import { isPortalSourceEntity } from "../runtime/portalRouting";
import { createWallTrimSegments } from "../runtime/wallTrimLayout";
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
  /** Changes reset runtime state without destroying the mounted WebGL canvas. */
  resetToken?: string | number;
  visualPlan?: VisualScenePlan;
  /** Optional precompiled visual/asset recipe for production integrations. */
  sceneRecipe?: CompiledSceneRecipe;
  selectedEntityId?: string | null;
  onEntitySelect?: (entityId: string | null) => void;
  onRuntimeError?: (error: WorldViewerRuntimeError) => void;
  /** Fires only after the active location's loader queue has settled. */
  onSceneReady?: () => void;
  /** Use demand rendering while preloading off-screen so reading stays smooth. */
  renderMode?: "continuous" | "on-demand";
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

function AdaptiveLoadedModel({
  asset,
  reserveBookcasePortraitBay = false,
}: {
  asset: AssetDefinition;
  reserveBookcasePortraitBay?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const levels = useMemo(
    () => asset.lods ?? (asset.modelUrl ? [{ modelUrl: asset.modelUrl, minimumDistance: 0 }] : []),
    [asset.lods, asset.modelUrl],
  );
  const [modelUrl, setModelUrl] = useState(levels[0]?.modelUrl ?? asset.modelUrl ?? "");
  const activeUrl = useRef(modelUrl);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);
  const tint = asset.key === "storybook-lounge-chair" || asset.key === "victorian-armchair"
    ? "#a94f49"
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
      {asset.key === "worn-story-bookshelf" && (
        <BookcaseContents reservePortraitBay={reserveBookcasePortraitBay} />
      )}
    </group>
  );
}

function BookcaseContents({ reservePortraitBay = false }: { reservePortraitBay?: boolean }) {
  // Measured shelf-top sockets from the approved normalized Poly Haven mesh.
  // Keeping these explicit prevents decorative books from intersecting a
  // different model's timber or leaving its lowest shelf mysteriously empty.
  const shelfRows = createWornBookshelfBookSlots({ reserveTopLeft: reservePortraitBay });
  return (
    <group position={[0, 0, 0.39]} userData={{ decorativeOnly: true }}>
      {shelfRows.map((row, shelfIndex) => {
        const left = Math.min(...row.map((slot) => slot.x - slot.width / 2));
        const right = Math.max(...row.map((slot) => slot.x + slot.width / 2));
        const height = Math.max(...row.map((slot) => slot.height));
        const shelfTop = row[0]!.shelfTop;
        return (
          <group
            key={`shelf-book-row-${shelfIndex}`}
            position={[(left + right) / 2, shelfTop + 0.012 + height / 2, 0]}
            rotation={[0, shelfIndex % 2 ? 0.012 : -0.012, 0]}
            scale={[right - left, height, 0.13]}
            userData={{ decorativeOnly: true, placementValidated: true, support: "measured-shelf-socket" }}
          >
            <Suspense fallback={null}>
              <LoadedModel url="/models/optimized/polyhaven/book_encyclopedia_set_01/book_encyclopedia_set_01_lod1.glb" />
            </Suspense>
          </group>
        );
      })}
    </group>
  );
}

function StoryDoorAsset({ highlighted, highlightColor }: { highlighted: boolean; highlightColor: string }) {
  const timber = usePbrSurface(
    "/textures/polyhaven/dark_wooden_planks_diff_1k.jpg",
    "/textures/polyhaven/dark_wooden_planks_nor_gl_1k.jpg",
    "/textures/polyhaven/dark_wooden_planks_arm_1k.jpg",
    [1.15, 2.8],
  );
  const panelRows = [
    { y: 0.29, height: 0.2 },
    { y: 0.045, height: 0.17 },
    { y: -0.255, height: 0.27 },
  ] as const;
  return (
    <group scale={[0.98, 0.99, 1]} userData={{ module: "fitted-victorian-six-panel-door", state: "closed" }}>
      <RoundedBox args={[0.89, 0.94, 0.46]} radius={0.018} smoothness={6} position={[0, -0.01, 0.26]} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#6c432c"
          map={timber.color}
          normalMap={timber.normal}
          normalScale={new THREE.Vector2(0.38, 0.38)}
          roughnessMap={timber.arm}
          roughness={0.56}
          clearcoat={0.16}
          clearcoatRoughness={0.62}
        />
      </RoundedBox>
      {panelRows.flatMap((row, rowIndex) =>
        [-0.22, 0.22].map((x) => (
          <group key={`door-panel-${rowIndex}-${x}`} position={[x, row.y, 0.51]}>
            <RoundedBox args={[0.35, row.height, 0.085]} radius={0.018} smoothness={7} castShadow>
              <meshPhysicalMaterial
                color="#805438"
                map={timber.color}
                normalMap={timber.normal}
                normalScale={new THREE.Vector2(0.32, 0.32)}
                roughness={0.54}
                clearcoat={0.14}
              />
            </RoundedBox>
            <RoundedBox args={[0.275, row.height - 0.065, 0.095]} radius={0.014} smoothness={6} position={[0, 0, 0.055]} castShadow>
              <meshStandardMaterial color="#54321f" map={timber.color} normalMap={timber.normal} roughness={0.7} />
            </RoundedBox>
          </group>
        )),
      )}
      {[-0.51, 0.51].map((x) => (
        <group key={`door-casing-${x}`} position={[x, 0, 0.28]}>
          <RoundedBox args={[0.125, 1.06, 0.62]} radius={0.023} smoothness={7} castShadow receiveShadow>
            <meshPhysicalMaterial
              color="#5a3725"
              map={timber.color}
              normalMap={timber.normal}
              normalScale={new THREE.Vector2(0.3, 0.3)}
              roughnessMap={timber.arm}
              roughness={0.6}
              clearcoat={0.14}
            />
          </RoundedBox>
          <RoundedBox args={[0.045, 0.98, 0.68]} radius={0.012} smoothness={5} position={[-Math.sign(x) * 0.075, 0, 0.045]} castShadow>
            <meshStandardMaterial color="#8a5c3e" map={timber.color} normalMap={timber.normal} roughness={0.58} />
          </RoundedBox>
        </group>
      ))}
      <RoundedBox args={[1.145, 0.125, 0.62]} radius={0.025} smoothness={7} position={[0, 0.5, 0.28]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#5a3725" map={timber.color} normalMap={timber.normal} roughness={0.58} clearcoat={0.15} />
      </RoundedBox>
      <RoundedBox args={[1.23, 0.065, 0.68]} radius={0.018} smoothness={6} position={[0, 0.565, 0.3]} castShadow>
        <meshStandardMaterial color="#774d33" map={timber.color} normalMap={timber.normal} roughness={0.56} />
      </RoundedBox>
      {[-0.51, 0.51].map((x) => (
        <RoundedBox key={`door-plinth-${x}`} args={[0.17, 0.15, 0.68]} radius={0.02} smoothness={6} position={[x, -0.49, 0.3]} castShadow>
          <meshStandardMaterial color="#68422c" map={timber.color} normalMap={timber.normal} roughness={0.62} />
        </RoundedBox>
      ))}
      <RoundedBox args={[1.05, 0.055, 0.72]} radius={0.014} smoothness={5} position={[0, -0.535, 0.32]} castShadow receiveShadow>
        <meshStandardMaterial color="#3f2a20" map={timber.color} normalMap={timber.normal} roughness={0.7} />
      </RoundedBox>
      {[-0.39, 0.39].map((y) => (
        <RoundedBox key={`door-hinge-${y}`} args={[0.035, 0.12, 0.045]} radius={0.008} smoothness={4} position={[-0.425, y, 0.575]} castShadow>
          <meshStandardMaterial color="#3b3028" metalness={0.76} roughness={0.36} />
        </RoundedBox>
      ))}
      <group position={[0.34, -0.015, 0.59]} userData={{ role: "aged-brass-door-handle" }}>
        <mesh position={[0, 0.035, 0.018]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.058, 0.058, 0.025, 32]} />
          <meshPhysicalMaterial color="#9d7438" metalness={0.82} roughness={0.3} clearcoat={0.24} />
        </mesh>
        <mesh position={[0, 0.035, 0.062]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.022, 0.03, 0.07, 24]} />
          <meshPhysicalMaterial color="#b78b43" metalness={0.84} roughness={0.26} clearcoat={0.3} />
        </mesh>
        <mesh position={[0, 0.035, 0.115]} scale={[0.058, 0.058, 0.052]} castShadow>
          <sphereGeometry args={[1, 32, 20]} />
          <meshPhysicalMaterial color="#c39a50" metalness={0.86} roughness={0.22} clearcoat={0.38} clearcoatRoughness={0.25} />
        </mesh>
        <mesh position={[0, -0.09, 0.025]} scale={[0.032, 0.046, 0.016]} castShadow>
          <sphereGeometry args={[1, 24, 16]} />
          <meshStandardMaterial color="#96703a" metalness={0.78} roughness={0.34} />
        </mesh>
        <RoundedBox args={[0.009, 0.025, 0.01]} radius={0.003} smoothness={3} position={[0, -0.09, 0.044]}>
          <meshStandardMaterial color="#281d16" roughness={0.7} />
        </RoundedBox>
        <mesh position={[0, -0.102, 0.044]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.015, 0.015, 0.009]} />
          <meshStandardMaterial color="#281d16" roughness={0.7} />
        </mesh>
      </group>
      <group position={[-0.34, -0.015, -0.015]} rotation={[0, Math.PI, 0]} userData={{ role: "interior-brass-door-handle" }}>
        <mesh position={[0, 0.035, 0.02]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.052, 0.052, 0.025, 28]} />
          <meshPhysicalMaterial color="#9d7438" metalness={0.82} roughness={0.3} clearcoat={0.24} />
        </mesh>
        <mesh position={[0, 0.035, 0.075]} scale={[0.054, 0.054, 0.05]} castShadow>
          <sphereGeometry args={[1, 28, 18]} />
          <meshPhysicalMaterial color="#c39a50" metalness={0.86} roughness={0.22} clearcoat={0.34} />
        </mesh>
      </group>
      {highlighted && (
        <mesh position={[0, 0, 0.72]}>
          <planeGeometry args={[0.9, 0.94]} />
          <meshBasicMaterial color={highlightColor} transparent opacity={0.08} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function StoryStaircaseAsset({ highlighted, highlightColor }: { highlighted: boolean; highlightColor: string }) {
  const timber = usePbrSurface(
    "/textures/polyhaven/dark_wooden_planks_diff_1k.jpg",
    "/textures/polyhaven/dark_wooden_planks_nor_gl_1k.jpg",
    "/textures/polyhaven/dark_wooden_planks_arm_1k.jpg",
    [1.2, 2.8],
  );
  return (
    <group userData={{ module: "partial-story-staircase", supportSurface: "steps" }}>
      {Array.from({ length: 5 }, (_, index) => {
        const height = (index + 1) / 5;
        return (
          <RoundedBox
            key={`story-step-${index}`}
            args={[0.94, height, 0.2]}
            radius={0.018}
            smoothness={4}
            position={[0, -0.5 + height / 2, 0.4 - index * 0.2]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              color={index % 2 ? "#66452f" : "#755139"}
              map={timber.color}
              normalMap={timber.normal}
              normalScale={new THREE.Vector2(0.22, 0.22)}
              roughnessMap={timber.arm}
              roughness={0.86}
              emissive={highlighted ? highlightColor : "#000000"}
              emissiveIntensity={highlighted ? 0.18 : 0}
            />
          </RoundedBox>
        );
      })}
    </group>
  );
}

function StoryWritingDesk({ asset, compactSchoolroom = false }: { asset: AssetDefinition; compactSchoolroom?: boolean }) {
  return (
    <group>
      <AdaptiveLoadedModel asset={asset} />
      <RoundedBox args={[0.82, 0.018, 0.64]} radius={0.012} smoothness={3} position={[0, 0.506, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#4c281f" roughness={0.58} clearcoat={0.28} clearcoatRoughness={0.52} />
      </RoundedBox>
      {!compactSchoolroom && (
        <group
          position={[-0.18, 0.58, -0.08]}
          rotation={[0, -0.1, 0]}
          scale={[0.32, 0.13, 0.19]}
          userData={{ decorativeOnly: true, placementValidated: true, surface: "desk" }}
        >
          <Suspense fallback={null}>
            <LoadedModel url="/models/optimized/polyhaven/book_encyclopedia_set_01/book_encyclopedia_set_01_lod0.glb" />
          </Suspense>
        </group>
      )}
      {!compactSchoolroom && (
        <group
          position={[0.22, 0.528, 0.06]}
          rotation={[0, 0.18, 0]}
          scale={[0.22, 0.025, 0.26]}
          userData={{ decorativeOnly: true, placementValidated: true, surface: "desk" }}
        >
          <Suspense fallback={null}>
            <LoadedModel url="/models/optimized/polyhaven/binder_notebook/binder_notebook_lod1.glb" />
          </Suspense>
        </group>
      )}
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

function useRepeatingStoryTexture(path: string, repeat: [number, number]) {
  const texture = useMemo(() => {
    const loaded = new THREE.TextureLoader().load(path);
    loaded.colorSpace = THREE.SRGBColorSpace;
    loaded.wrapS = THREE.RepeatWrapping;
    loaded.wrapT = THREE.RepeatWrapping;
    loaded.repeat.set(...repeat);
    loaded.anisotropy = 8;
    return loaded;
  }, [path, repeat[0], repeat[1]]);
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
      <RoundedBox args={[1, 0.028, 1]} radius={0.012} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial
          color="#4f1f22"
          roughness={1}
          emissive={highlighted ? highlightColor : "#000000"}
          emissiveIntensity={highlighted ? 0.3 : 0}
        />
      </RoundedBox>
      <mesh position={[0, 0.021, 0]} receiveShadow>
        <boxGeometry args={[0.968, 0.016, 0.958]} />
        <meshStandardMaterial
          color="#ffffff"
          map={surface.color}
          emissive={highlighted ? highlightColor : "#5b181b"}
          emissiveMap={surface.color}
          emissiveIntensity={highlighted ? 0.48 : 0.42}
          normalMap={surface.normal}
          normalScale={new THREE.Vector2(0.72, 0.72)}
          roughnessMap={surface.arm}
          roughness={1}
        />
      </mesh>
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
    "/textures/polyhaven/marble_01_diff_1k.jpg",
    "/textures/polyhaven/marble_01_nor_gl_1k.jpg",
    "/textures/polyhaven/marble_01_arm_1k.jpg",
    [0.85, 1.35],
  );
  const timber = usePbrSurface(
    "/textures/polyhaven/dark_wooden_planks_diff_1k.jpg",
    "/textures/polyhaven/dark_wooden_planks_nor_gl_1k.jpg",
    "/textures/polyhaven/dark_wooden_planks_arm_1k.jpg",
    [1.4, 1.4],
  );
  const photoAtlas = useStoryTexture("/textures/story/ashwood-mantel-photos-v1.png");
  const tileTexture = useRepeatingStoryTexture(
    "/textures/story/ashwood-victorian-fireplace-tiles-v1.png",
    [1, 3.4],
  );
  const photoTextures = useMemo(() => [0, 1, 2].map((index) => {
    const texture = photoAtlas.clone();
    texture.repeat.set(1 / 3, 1);
    texture.offset.set(index / 3, 0);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }), [photoAtlas]);
  useEffect(() => () => photoTextures.forEach((texture) => texture.dispose()), [photoTextures]);
  const surroundMaterial = (
    <meshPhysicalMaterial
      color="#c9bda8"
      map={surface.color}
      normalMap={surface.normal}
      normalScale={new THREE.Vector2(0.38, 0.38)}
      roughnessMap={surface.arm}
      roughness={0.54}
      clearcoat={0.18}
      clearcoatRoughness={0.62}
      emissive={highlighted ? highlightColor : "#000000"}
      emissiveIntensity={highlighted ? 0.22 : 0}
    />
  );
  const mantelMaterial = (
    <meshStandardMaterial
      color="#5b3726"
      map={timber.color}
      normalMap={timber.normal}
      normalScale={new THREE.Vector2(0.32, 0.32)}
      roughnessMap={timber.arm}
      roughness={0.72}
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
  const openingShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.275, -0.43);
    shape.lineTo(0.275, -0.43);
    shape.lineTo(0.275, 0.04);
    shape.absarc(0, 0.04, 0.275, 0, Math.PI, false);
    shape.lineTo(-0.275, -0.43);
    shape.closePath();
    return shape;
  }, []);
  const archExtrusion = useMemo(() => ({
    depth: 0.34,
    bevelEnabled: true,
    bevelSegments: 6,
    bevelSize: 0.026,
    bevelThickness: 0.028,
    curveSegments: 48,
  }), []);
  const columnProfile = useMemo(() => [
    new THREE.Vector2(0.07, -0.37),
    new THREE.Vector2(0.082, -0.34),
    new THREE.Vector2(0.066, -0.29),
    new THREE.Vector2(0.052, -0.24),
    new THREE.Vector2(0.047, 0.24),
    new THREE.Vector2(0.058, 0.29),
    new THREE.Vector2(0.078, 0.33),
    new THREE.Vector2(0.086, 0.37),
  ], []);

  return (
    <group userData={{ module: "deep-victorian-chimney-piece" }}>
      <RoundedBox args={[1.04, 1.08, 0.46]} radius={0.04} smoothness={6} position={[0, 0.02, -0.26]} castShadow receiveShadow>
        {surroundMaterial}
      </RoundedBox>
      <mesh position={[0, -0.02, -0.15]} castShadow receiveShadow>
        <extrudeGeometry args={[archShape, archExtrusion]} />
        {surroundMaterial}
      </mesh>
      <mesh position={[0, -0.075, -0.085]} receiveShadow>
        <planeGeometry args={[0.52, 0.75]} />
        <meshStandardMaterial
          color="#0d0b0a"
          roughness={1}
          emissive="#030303"
          emissiveIntensity={0.04}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
      <mesh position={[0, -0.02, 0.19]} receiveShadow userData={{ layer: "firebox-soot-aperture" }}>
        <shapeGeometry args={[openingShape, 24]} />
        <meshStandardMaterial
          color="#100d0c"
          roughness={1}
          emissive="#050404"
          emissiveIntensity={0.06}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>
      {[-0.266, 0.266].map((x) => (
        <mesh key={`firebox-reveal-${x}`} position={[x, -0.18, 0.055]} castShadow receiveShadow>
          <boxGeometry args={[0.045, 0.49, 0.27]} />
          <meshStandardMaterial color="#29201b" roughness={0.94} />
        </mesh>
      ))}
      <mesh position={[0, 0.185, 0.055]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.275, 0.275, 0.27, 64, 1, true, 0, Math.PI]} />
        <meshStandardMaterial color="#29201b" roughness={0.94} side={THREE.DoubleSide} />
      </mesh>
      {[-0.318, 0.318].map((x) => (
        <mesh key={`fireplace-tile-band-${x}`} position={[x, -0.045, 0.225]} castShadow receiveShadow>
          <boxGeometry args={[0.105, 0.7, 0.028]} />
          <meshPhysicalMaterial
            map={tileTexture}
            color="#ffffff"
            roughness={0.34}
            clearcoat={0.48}
            clearcoatRoughness={0.28}
          />
        </mesh>
      ))}
      {[-0.41, 0.41].map((x) => (
        <group key={`fireplace-pilaster-${x}`} position={[x, -0.03, 0.25]}>
          <mesh castShadow receiveShadow>
            <latheGeometry args={[columnProfile, 64]} />
            {surroundMaterial}
          </mesh>
          {[0.33, -0.33].map((y) => (
            <mesh key={`pilaster-ring-${x}-${y}`} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <torusGeometry args={[0.073, 0.012, 10, 40]} />
              {surroundMaterial}
            </mesh>
          ))}
          <RoundedBox args={[0.19, 0.09, 0.29]} radius={0.024} smoothness={5} position={[0, 0.405, 0]} castShadow>
            {mantelMaterial}
          </RoundedBox>
          <RoundedBox args={[0.19, 0.09, 0.28]} radius={0.024} smoothness={5} position={[0, -0.41, 0]} castShadow>
            {surroundMaterial}
          </RoundedBox>
        </group>
      ))}
      <RoundedBox
        args={[1.12, 0.115, 0.52]}
        radius={0.035}
        smoothness={6}
        position={[0, 0.53, 0.12]}
        castShadow
        receiveShadow
      >
        {mantelMaterial}
      </RoundedBox>
      <RoundedBox args={[1.02, 0.065, 0.43]} radius={0.022} smoothness={5} position={[0, 0.445, 0.095]} castShadow>
        {surroundMaterial}
      </RoundedBox>
      <RoundedBox args={[0.9, 0.055, 0.34]} radius={0.018} smoothness={5} position={[0, 0.39, 0.105]} castShadow>
        {mantelMaterial}
      </RoundedBox>
      <RoundedBox
        args={[1.02, 0.075, 0.76]}
        radius={0.026}
        smoothness={5}
        position={[0, -0.47, 0.28]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#302d2a" roughness={0.62} metalness={0.12} />
      </RoundedBox>
      {[-0.41, -0.27].map((x, index) => (
        <group key={`mantel-photo-${x}`} position={[x, 0.65 + index * 0.012, 0.13]} rotation={[0, 0, (index - 1) * 0.045]}>
          <RoundedBox args={[index === 2 ? 0.17 : 0.14, index === 2 ? 0.23 : 0.19, 0.035]} radius={0.012} smoothness={2} castShadow>
            <meshStandardMaterial color={index === 1 ? "#79613f" : "#aa8950"} roughness={0.5} metalness={0.34} />
          </RoundedBox>
          <mesh position={[0, 0, 0.024]}>
            <planeGeometry args={[index === 2 ? 0.125 : 0.098, index === 2 ? 0.18 : 0.142]} />
            <meshStandardMaterial map={photoTextures[index]} roughness={0.92} />
          </mesh>
        </group>
      ))}
      <group position={[0.035, 0.658, 0.19]} scale={[0.22, 0.16, 0.24]} userData={{ role: "mantel-clock-mantel-mounted" }}>
        <Suspense fallback={null}>
          {defaultAssetRegistry["victorian-mantel-clock"] && (
            <AdaptiveLoadedModel asset={defaultAssetRegistry["victorian-mantel-clock"]} />
          )}
        </Suspense>
      </group>
      <group
        position={[0.355, 0.72, 0.19]}
        rotation={[0, -0.22, 0]}
        scale={[0.17, 0.26, 0.13]}
        userData={{ decorativeOnly: true, placementValidated: true, surface: "mantel" }}
      >
        <Suspense fallback={null}>
          <LoadedModel url="/models/optimized/polyhaven/horse_statue_01/horse_statue_01_lod1.glb" />
        </Suspense>
      </group>
      <pointLight position={[0.025, 0.82, 0.48]} color="#e9b96f" intensity={0.22} distance={1.7} decay={2} />
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

function WebGlContextGuard({
  onContextLost,
  onContextRestored,
}: {
  onContextLost: () => void;
  onContextRestored: () => void;
}) {
  const renderer = useThree((state) => state.gl);

  useEffect(() => {
    const canvas = renderer.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onContextLost();
    };
    const handleContextRestored = () => onContextRestored();
    canvas.addEventListener("webglcontextlost", handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", handleContextRestored, false);
    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost, false);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored, false);
    };
  }, [onContextLost, onContextRestored, renderer]);

  return null;
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
  const portraitTexture = useStoryTexture("/textures/story/ashwood-woman-portrait-v1.png");
  return (
    <group>
      <RoundedBox args={[0.98, 1, 0.2]} radius={0.035} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial color="#4b2d20" roughness={0.72} metalness={0.12} />
      </RoundedBox>
      <mesh position={[0, 0, 0.16]} castShadow>
        <planeGeometry args={[0.79, 0.82]} />
        <meshStandardMaterial
          map={portraitTexture}
          emissive={highlighted ? highlightColor : "#5a4433"}
          emissiveMap={portraitTexture}
          emissiveIntensity={highlighted ? 0.2 : 0.24}
          roughness={0.9}
        />
      </mesh>
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
    </group>
  );
}

function StoryBayWindowAsset({ highlighted, highlightColor }: { highlighted: boolean; highlightColor: string }) {
  const windowTexture = useStoryTexture("/textures/story/ashwood-estate-exterior-v3.png");
  const windowGroup = useRef<THREE.Group>(null);
  const cameraLocal = useMemo(() => new THREE.Vector3(), []);
  const backdrop = useMemo(() => {
    const texture = windowTexture.clone();
    texture.repeat.set(0.79, 1);
    texture.offset.set(0.105, 0);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, [windowTexture]);
  useEffect(() => () => backdrop.dispose(), [backdrop]);
  useFrame(({ camera }) => {
    if (!windowGroup.current) return;
    cameraLocal.copy(camera.position);
    windowGroup.current.worldToLocal(cameraLocal);
    backdrop.offset.x = THREE.MathUtils.clamp(cameraLocal.x * 0.001, -0.006, 0.006);
  });
  const timber = usePbrSurface(
    "/textures/polyhaven/dark_wooden_planks_diff_1k.jpg",
    "/textures/polyhaven/dark_wooden_planks_nor_gl_1k.jpg",
    "/textures/polyhaven/dark_wooden_planks_arm_1k.jpg",
    [1.7, 1.7],
  );
  return (
    <group ref={windowGroup} position={[0, 0.35, 0]} userData={{ module: "deep-parallax-bay-window", raisedForEyeLevelView: true }}>
      <RoundedBox
        args={[1.04, 0.38, 0.52]}
        radius={0.018}
        smoothness={5}
        position={[0, -0.59, 0.25]}
        castShadow
        receiveShadow
        userData={{ role: "raised-window-wall-apron" }}
      >
        <meshStandardMaterial color="#3d2b20" map={timber.color} normalMap={timber.normal} roughness={0.82} />
      </RoundedBox>
      <RoundedBox args={[0.9, 0.045, 0.56]} radius={0.012} smoothness={4} position={[0, -0.43, 0.27]} castShadow>
        <meshStandardMaterial color="#694731" map={timber.color} normalMap={timber.normal} roughness={0.7} />
      </RoundedBox>
      <RoundedBox args={[1.04, 0.2, 1.08]} radius={0.025} smoothness={3} position={[0, -0.405, 0.36]} castShadow receiveShadow>
        <meshStandardMaterial color="#3d2b20" map={timber.color} normalMap={timber.normal} roughness={0.84} />
      </RoundedBox>
      <mesh position={[0, 0.09, -0.16]} receiveShadow>
        <boxGeometry args={[0.94, 0.9, 0.04]} />
        <meshStandardMaterial color="#12171a" roughness={0.98} />
      </mesh>
      <mesh position={[0, 0.09, -0.13]} castShadow userData={{ layer: "continuous-exterior-backdrop" }}>
        <planeGeometry args={[0.94, 0.79]} />
        <meshPhysicalMaterial
          map={backdrop}
          emissive={highlighted ? highlightColor : "#102633"}
          emissiveIntensity={highlighted ? 0.2 : 0.16}
          roughness={0.36}
          clearcoat={0.18}
          clearcoatRoughness={0.34}
        />
      </mesh>
      {[-0.47, 0.47].map((x) => (
        <RoundedBox key={`bay-jamb-${x}`} args={[0.09, 0.82, 1.08]} radius={0.022} smoothness={3} position={[x, 0.08, 0.36]} castShadow receiveShadow>
          <meshStandardMaterial color="#4d3426" map={timber.color} normalMap={timber.normal} roughness={0.8} />
        </RoundedBox>
      ))}
      <RoundedBox args={[1.04, 0.09, 1.08]} radius={0.025} smoothness={3} position={[0, 0.48, 0.36]} castShadow receiveShadow>
        <meshStandardMaterial color="#4b3326" map={timber.color} normalMap={timber.normal} roughness={0.8} />
      </RoundedBox>
      <RoundedBox args={[1.1, 0.085, 1.2]} radius={0.022} smoothness={3} position={[0, -0.285, 0.41]} castShadow receiveShadow>
        <meshStandardMaterial color="#5e432f" map={timber.color} normalMap={timber.normal} roughness={0.8} />
      </RoundedBox>
      <mesh position={[0, 0.09, 0.83]}>
        <planeGeometry args={[0.87, 0.79]} />
        <meshPhysicalMaterial
          color="#a8c6cf"
          transmission={0.18}
          transparent
          opacity={0.12}
          roughness={0.08}
          clearcoat={0.42}
          clearcoatRoughness={0.18}
          depthWrite={false}
        />
      </mesh>
      {[-0.17, 0.17].map((x) => (
        <RoundedBox
          key={`bay-mullion-${x}`}
          args={[0.045, 0.8, 0.12]}
          radius={0.012}
          smoothness={5}
          position={[x, 0.09, 0.91]}
          castShadow
        >
          <meshPhysicalMaterial
            color={highlighted ? highlightColor : "#704c31"}
            map={timber.color}
            normalMap={timber.normal}
            roughness={0.57}
            clearcoat={0.18}
            clearcoatRoughness={0.62}
          />
        </RoundedBox>
      ))}
      <RoundedBox args={[0.89, 0.042, 0.12]} radius={0.011} smoothness={5} position={[0, 0.08, 0.91]} castShadow>
        <meshPhysicalMaterial
          color={highlighted ? highlightColor : "#704c31"}
          map={timber.color}
          normalMap={timber.normal}
          roughness={0.57}
          clearcoat={0.18}
        />
      </RoundedBox>
      {[-0.445, 0.445].map((x) => (
        <RoundedBox key={`bay-inner-bead-${x}`} args={[0.035, 0.82, 0.1]} radius={0.01} smoothness={4} position={[x, 0.09, 0.9]} castShadow>
          <meshStandardMaterial color="#89613e" map={timber.color} normalMap={timber.normal} roughness={0.64} />
        </RoundedBox>
      ))}
      {[-0.305, 0.485].map((y) => (
        <RoundedBox key={`bay-inner-rail-${y}`} args={[0.92, 0.035, 0.1]} radius={0.01} smoothness={4} position={[0, y, 0.9]} castShadow>
          <meshStandardMaterial color="#89613e" map={timber.color} normalMap={timber.normal} roughness={0.64} />
        </RoundedBox>
      ))}
      <pointLight position={[0, 0.1, 1.05]} color="#92c6dc" intensity={0.36} distance={4.2} decay={2} />
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

function StorybookLampAsset({
  highlighted,
  highlightColor,
  table = false,
}: {
  highlighted: boolean;
  highlightColor: string;
  table?: boolean;
}) {
  const brass = highlighted ? highlightColor : "#9b703a";
  const stemBottom = table ? -0.32 : -0.46;
  const stemHeight = table ? 0.5 : 0.72;
  const shadeY = table ? 0.19 : 0.27;
  const shadeHeight = table ? 0.34 : 0.38;
  return (
    <group
      position={[0, table ? -0.1425 : 0, 0]}
      userData={{ authoredAsset: table ? "storybook-table-lamp" : "storybook-floor-lamp" }}
    >
      <mesh position={[0, stemBottom, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[table ? 0.23 : 0.27, table ? 0.26 : 0.3, table ? 0.075 : 0.065, 32]} />
        <meshStandardMaterial color={brass} metalness={0.72} roughness={0.3} />
      </mesh>
      <mesh position={[0, stemBottom + stemHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[0.024, 0.034, stemHeight, 18]} />
        <meshStandardMaterial color={brass} metalness={0.76} roughness={0.28} />
      </mesh>
      {[stemBottom + 0.12, shadeY - shadeHeight * 0.55].map((y) => (
        <mesh key={`lamp-collar:${y}`} position={[0, y, 0]} castShadow>
          <sphereGeometry args={[0.055, 18, 12]} />
          <meshStandardMaterial color="#c09856" metalness={0.7} roughness={0.32} />
        </mesh>
      ))}
      <mesh position={[0, shadeY, 0]} castShadow>
        <cylinderGeometry args={[table ? 0.18 : 0.2, table ? 0.36 : 0.38, shadeHeight, 40, 1, true]} />
        <meshStandardMaterial color="#c8a36d" emissive="#5f3518" emissiveIntensity={0.16} roughness={0.82} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, shadeY + 0.015, 0]}>
        <sphereGeometry args={[0.085, 20, 14]} />
        <meshStandardMaterial color="#ffd790" emissive="#f0a048" emissiveIntensity={1.8} roughness={0.25} />
      </mesh>
      <mesh position={[0, shadeY + shadeHeight / 2 + 0.045, 0]} castShadow>
        <sphereGeometry args={[0.038, 16, 10]} />
        <meshStandardMaterial color={brass} metalness={0.72} roughness={0.3} />
      </mesh>
    </group>
  );
}

function StoryCanalWater({ highlighted, highlightColor }: { highlighted: boolean; highlightColor: string }) {
  const water = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({
    time: { value: 0 },
    deepColor: { value: new THREE.Color(highlighted ? highlightColor : "#071f2b") },
    surfaceColor: { value: new THREE.Color(highlighted ? "#79d9df" : "#285763") },
  }), [highlightColor, highlighted]);
  useFrame((state) => {
    if (!water.current) return;
    water.current.uniforms.time!.value = state.clock.elapsedTime;
  });
  return (
    <mesh position={[0, URBAN_HUMAN_SCALE.canalWaterLevel, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[0.78, 1, 48, 192]} />
      <shaderMaterial
        ref={water}
        uniforms={uniforms}
        transparent
        depthWrite
        vertexShader={`
          uniform float time;
          varying float elevation;
          varying vec2 waterUv;
          varying vec3 waterNormal;
          varying vec3 viewDirection;
          void main() {
            vec3 displaced = position;
            float broadPhase = position.y * 15.0 - time * 0.82;
            float crossPhase = position.x * 8.0 + position.y * 5.0 + time * 1.02;
            float detailPhase = position.y * 27.0 - position.x * 6.0 + time * 0.52;
            float broad = sin(broadPhase) * ${URBAN_HUMAN_SCALE.canalWaveAmplitude * 0.34};
            float cross = sin(crossPhase) * ${URBAN_HUMAN_SCALE.canalWaveAmplitude * 0.2};
            float detail = cos(detailPhase) * ${URBAN_HUMAN_SCALE.canalWaveAmplitude * 0.06};
            elevation = broad + cross + detail;
            displaced.z += elevation;
            waterUv = uv;
            float dzdx = cos(crossPhase) * 8.0 * ${URBAN_HUMAN_SCALE.canalWaveAmplitude * 0.2}
              + sin(detailPhase) * 6.0 * ${URBAN_HUMAN_SCALE.canalWaveAmplitude * 0.06};
            float dzdy = cos(broadPhase) * 15.0 * ${URBAN_HUMAN_SCALE.canalWaveAmplitude * 0.34}
              + cos(crossPhase) * 5.0 * ${URBAN_HUMAN_SCALE.canalWaveAmplitude * 0.2}
              - sin(detailPhase) * 27.0 * ${URBAN_HUMAN_SCALE.canalWaveAmplitude * 0.06};
            waterNormal = normalize(normalMatrix * vec3(-dzdx, -dzdy, 1.0));
            vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
            viewDirection = normalize(-viewPosition.xyz);
            gl_Position = projectionMatrix * viewPosition;
          }
        `}
        fragmentShader={`
          uniform vec3 deepColor;
          uniform vec3 surfaceColor;
          uniform float time;
          varying float elevation;
          varying vec2 waterUv;
          varying vec3 waterNormal;
          varying vec3 viewDirection;
          void main() {
            vec3 normal = normalize(waterNormal);
            float fresnel = pow(1.0 - max(dot(normal, normalize(viewDirection)), 0.0), 3.0);
            vec3 lightDirection = normalize(vec3(-0.34, 0.72, 0.58));
            float diffuse = max(dot(normal, lightDirection), 0.0);
            float sparkle = pow(max(dot(reflect(-lightDirection, normal), normalize(viewDirection)), 0.0), 46.0);
            float depthVariation = 0.08 * sin(waterUv.y * 8.0 + time * 0.18) + elevation * 0.9;
            vec3 color = mix(deepColor, surfaceColor, 0.22 + diffuse * 0.2 + depthVariation);
            color = mix(color, vec3(0.13, 0.27, 0.31), fresnel * 0.38);
            color += vec3(0.74, 0.83, 0.8) * sparkle * 0.32;
            float bankGlow = exp(-pow((waterUv.x - 0.08) * 9.0, 2.0))
              + exp(-pow((waterUv.x - 0.92) * 9.0, 2.0));
            float lanternPools = exp(-pow((waterUv.y - 0.2) * 7.0, 2.0))
              + exp(-pow((waterUv.y - 0.52) * 8.0, 2.0))
              + exp(-pow((waterUv.y - 0.82) * 7.0, 2.0));
            float brokenReflection = 0.42 + 0.58 * pow(0.5 + 0.5 * sin(waterUv.y * 115.0 + time * 1.7), 4.0);
            float warmReflection = min(bankGlow * lanternPools * brokenReflection, 1.0);
            color += vec3(0.82, 0.43, 0.16) * warmReflection * 0.62;
            gl_FragColor = vec4(color, 0.97);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `}
      />
    </mesh>
  );
}

function StoryCanalAsset({ highlighted, highlightColor }: { highlighted: boolean; highlightColor: string }) {
  const waterVolumeTop = URBAN_HUMAN_SCALE.canalWaterLevel
    - URBAN_HUMAN_SCALE.canalWaveAmplitude
    - URBAN_HUMAN_SCALE.canalVolumeClearance;
  const waterDepth = waterVolumeTop - URBAN_HUMAN_SCALE.canalBedTop;
  return (
    <group>
      <mesh position={[0, URBAN_HUMAN_SCALE.canalBedTop - 0.04, 0]} receiveShadow>
        <boxGeometry args={[0.78, 0.08, 1]} />
        <meshStandardMaterial color="#172d31" roughness={0.96} />
      </mesh>
      <mesh position={[0, URBAN_HUMAN_SCALE.canalBedTop + waterDepth / 2, 0]} receiveShadow>
        <boxGeometry args={[0.78, waterDepth, 1]} />
        <meshStandardMaterial color="#092c38" emissive="#061a22" emissiveIntensity={0.12} roughness={0.24} transparent opacity={0.94} />
      </mesh>
      <StoryCanalWater highlighted={highlighted} highlightColor={highlightColor} />
      {[-0.45, 0.45].map((x) => (
        <group key={`canal-bank-${x}`} position={[x, 0, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.16, 0.56, 1]} />
            <meshStandardMaterial color="#77766e" roughness={0.96} />
          </mesh>
          {Array.from({ length: 18 }, (_, index) => (
            <RoundedBox key={`canal-cap-${index}`} args={[0.19, 0.1, 0.05]} radius={0.008} smoothness={2} position={[0, 0.095, -0.47 + index * 0.055]} rotation={[0, (index % 3 - 1) * 0.03, 0]} castShadow>
              <meshStandardMaterial color={index % 2 ? "#99978c" : "#85857d"} roughness={0.94} />
            </RoundedBox>
          ))}
        </group>
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
  if (asset.key === "story-door" || asset.proceduralModel === "door") {
    return <StoryDoorAsset highlighted={highlighted} highlightColor={highlightColor} />;
  }
  if (asset.proceduralModel === "staircase") {
    return <StoryStaircaseAsset highlighted={highlighted} highlightColor={highlightColor} />;
  }
  if (asset.key === "storybook-floor-lamp") {
    return <StorybookLampAsset highlighted={highlighted} highlightColor={highlightColor} />;
  }
  if (asset.key === "storybook-table-lamp") {
    return <StorybookLampAsset highlighted={highlighted} highlightColor={highlightColor} table />;
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

  if (asset.key === "desk" && asset.modelUrl) {
    return (
      <ModelErrorBoundary key={asset.modelUrl} fallback={fallback}>
        <Suspense fallback={null}>
          <StoryWritingDesk asset={asset} compactSchoolroom={entity?.id === "schoolroom-table"} />
        </Suspense>
      </ModelErrorBoundary>
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
        <AdaptiveLoadedModel
          asset={asset}
          reserveBookcasePortraitBay={entity?.id === "schoolroom-shelf"}
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
      placementAnchor: instance.placementAnchor,
      ...(instance.supportId ? { supportId: instance.supportId } : {}),
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

function EstateFurnitureComposition({
  bounds,
  overview,
}: {
  bounds: Vector3Tuple;
  overview: boolean;
}) {
  const centerX = -bounds[0] * 0.18;
  const centerZ = -bounds[2] * 0.18;
  const teaTablePosition: Vector3Tuple = [centerX - 0.1, 0.29, centerZ];
  const northSideTablePosition: Vector3Tuple = [centerX - 2.2, 0.41, centerZ - 1.72];
  const southSideTablePosition: Vector3Tuple = [centerX - 2.2, 0.41, centerZ + 1.72];
  const southConsolePosition: Vector3Tuple = [bounds[0] * 0.18, 0.33, bounds[2] / 2 - 0.35];
  const eastParlorCenterX = bounds[0] * 0.18;
  const eastParlorCenterZ = centerZ;
  const eastParlorTablePosition: Vector3Tuple = [eastParlorCenterX, 0.28, eastParlorCenterZ];
  const eastParlorSideTablePosition: Vector3Tuple = [eastParlorCenterX + 2.08, 0.41, eastParlorCenterZ + 1.65];
  const westGalleryCenterZ = bounds[2] * 0.16;
  const westGallerySideTablePosition: Vector3Tuple = [-bounds[0] / 2 + 0.58, 0.41, westGalleryCenterZ + 1.8];
  const arrivalTablePosition: Vector3Tuple = [-bounds[0] * 0.09, 0.4, bounds[2] * 0.19];
  const readingNookPosition: Vector3Tuple = [bounds[0] * 0.34, 0.56, bounds[2] * 0.3];
  const furniture = [
    {
      key: "estate-conversation-sofa",
      url: "/models/optimized/polyhaven/sofa_03/sofa_03_lod0.glb",
      position: [centerX - 2.35, 0.56, centerZ] as Vector3Tuple,
      rotation: [0, Math.PI / 2, 0] as Vector3Tuple,
      scale: [2.73, 1.12, 0.93] as Vector3Tuple,
    },
    {
      key: "estate-conversation-chair-north",
      url: "/models/optimized/polyhaven/ArmChair_01/ArmChair_01_lod0.glb",
      position: [centerX + 1.62, 0.66, centerZ - 1.16] as Vector3Tuple,
      rotation: [0, -2.12, 0] as Vector3Tuple,
      scale: [1.05, 1.32, 0.95] as Vector3Tuple,
      tint: "#7d3941",
    },
    {
      key: "estate-conversation-chair-south",
      url: "/models/optimized/polyhaven/ArmChair_01/ArmChair_01_lod0.glb",
      position: [centerX + 1.67, 0.66, centerZ + 1.2] as Vector3Tuple,
      rotation: [0, -1.03, 0] as Vector3Tuple,
      scale: [1.05, 1.32, 0.95] as Vector3Tuple,
      tint: "#7d3941",
    },
    {
      key: "estate-ornate-tea-table",
      url: "/models/optimized/polyhaven/chinese_tea_table/chinese_tea_table_lod0.glb",
      position: teaTablePosition,
      rotation: [0, 0.18, 0] as Vector3Tuple,
      scale: [0.82, 0.58, 0.82] as Vector3Tuple,
    },
    {
      key: "estate-side-table-north",
      url: "/models/optimized/polyhaven/side_table_tall_01/side_table_tall_01_lod0.glb",
      position: northSideTablePosition,
      rotation: [0, 0.12, 0] as Vector3Tuple,
      scale: [0.68, 0.82, 0.58] as Vector3Tuple,
    },
    {
      key: "estate-side-table-south",
      url: "/models/optimized/polyhaven/side_table_tall_01/side_table_tall_01_lod1.glb",
      position: southSideTablePosition,
      rotation: [0, -0.16, 0] as Vector3Tuple,
      scale: [0.68, 0.82, 0.58] as Vector3Tuple,
    },
    {
      key: "estate-east-parlor-settee",
      url: "/models/optimized/polyhaven/Sofa_01/Sofa_01_lod0.glb",
      position: [eastParlorCenterX + 2.05, 0.525, eastParlorCenterZ] as Vector3Tuple,
      rotation: [0, -Math.PI / 2, 0] as Vector3Tuple,
      scale: [2.25, 1.05, 0.9] as Vector3Tuple,
    },
    {
      key: "estate-east-parlor-chair",
      url: "/models/optimized/polyhaven/ArmChair_01/ArmChair_01_lod0.glb",
      position: [eastParlorCenterX - 1.35, 0.66, eastParlorCenterZ - 1.35] as Vector3Tuple,
      rotation: [0, 2.28, 0] as Vector3Tuple,
      scale: [1.05, 1.32, 0.95] as Vector3Tuple,
      tint: "#684148",
    },
    {
      key: "estate-east-parlor-table",
      url: "/models/optimized/polyhaven/gothic_coffee_table/gothic_coffee_table_lod0.glb",
      position: eastParlorTablePosition,
      rotation: [0, 0.12, 0] as Vector3Tuple,
      scale: [1.72, 0.56, 1.48] as Vector3Tuple,
    },
    {
      key: "estate-east-parlor-ottoman",
      url: "/models/optimized/polyhaven/Ottoman_01/Ottoman_01_lod0.glb",
      position: [eastParlorCenterX - 1.18, 0.29, eastParlorCenterZ + 1.18] as Vector3Tuple,
      rotation: [0, -0.62, 0] as Vector3Tuple,
      scale: [1.02, 0.58, 0.76] as Vector3Tuple,
    },
    {
      key: "estate-east-parlor-side-table",
      url: "/models/optimized/polyhaven/side_table_tall_01/side_table_tall_01_lod1.glb",
      position: eastParlorSideTablePosition,
      rotation: [0, -0.18, 0] as Vector3Tuple,
      scale: [0.65, 0.82, 0.56] as Vector3Tuple,
    },
    {
      key: "estate-east-parlor-brass-vase",
      url: "/models/optimized/polyhaven/brass_vase_02/brass_vase_02_lod1.glb",
      position: [eastParlorTablePosition[0] + 0.46, 0.78, eastParlorTablePosition[2] - 0.2] as Vector3Tuple,
      rotation: [0, 0.38, 0] as Vector3Tuple,
      scale: [0.24, 0.44, 0.24] as Vector3Tuple,
    },
    {
      key: "estate-east-parlor-candleholders",
      url: "/models/optimized/polyhaven/brass_candleholders/brass_candleholders_lod1.glb",
      position: [eastParlorSideTablePosition[0], 1.15, eastParlorSideTablePosition[2]] as Vector3Tuple,
      rotation: [0, 0.18, 0] as Vector3Tuple,
      scale: [0.42, 0.62, 0.3] as Vector3Tuple,
    },
    {
      key: "estate-east-parlor-chess-set",
      url: "/models/optimized/polyhaven/chess_set/chess_set_lod1.glb",
      position: [eastParlorTablePosition[0] - 0.08, 0.635, eastParlorTablePosition[2] + 0.04] as Vector3Tuple,
      rotation: [0, 0.2, 0] as Vector3Tuple,
      scale: [0.58, 0.15, 0.58] as Vector3Tuple,
    },
    {
      key: "estate-east-parlor-plant",
      url: "/models/optimized/polyhaven/potted_plant_01/potted_plant_01_lod1.glb",
      position: [eastParlorCenterX + 3.72, 0.69, eastParlorCenterZ - 2.55] as Vector3Tuple,
      rotation: [0, -0.28, 0] as Vector3Tuple,
      scale: [0.82, 1.32, 0.82] as Vector3Tuple,
    },
    {
      key: "estate-west-gallery-settee",
      url: "/models/optimized/polyhaven/Sofa_01/Sofa_01_lod1.glb",
      position: [-bounds[0] / 2 + 0.72, 0.525, westGalleryCenterZ] as Vector3Tuple,
      rotation: [0, Math.PI / 2, 0] as Vector3Tuple,
      scale: [2.3, 1.05, 0.86] as Vector3Tuple,
    },
    {
      key: "estate-west-gallery-ottoman",
      url: "/models/optimized/polyhaven/Ottoman_01/Ottoman_01_lod1.glb",
      position: [-bounds[0] / 2 + 1.72, 0.29, westGalleryCenterZ] as Vector3Tuple,
      rotation: [0, 0.08, 0] as Vector3Tuple,
      scale: [0.96, 0.58, 0.76] as Vector3Tuple,
    },
    {
      key: "estate-west-gallery-side-table",
      url: "/models/optimized/polyhaven/side_table_tall_01/side_table_tall_01_lod1.glb",
      position: westGallerySideTablePosition,
      rotation: [0, Math.PI / 2 + 0.08, 0] as Vector3Tuple,
      scale: [0.64, 0.82, 0.55] as Vector3Tuple,
    },
    {
      key: "estate-west-gallery-candleholders",
      url: "/models/optimized/polyhaven/brass_candleholders/brass_candleholders_lod1.glb",
      position: [westGallerySideTablePosition[0], 1.12, westGallerySideTablePosition[2]] as Vector3Tuple,
      rotation: [0, Math.PI / 2 - 0.12, 0] as Vector3Tuple,
      scale: [0.4, 0.58, 0.3] as Vector3Tuple,
    },
    {
      key: "estate-west-gallery-plant",
      url: "/models/optimized/polyhaven/potted_plant_01/potted_plant_01_lod1.glb",
      position: [-bounds[0] / 2 + 0.78, 0.69, westGalleryCenterZ - 2.15] as Vector3Tuple,
      rotation: [0, 0.42, 0] as Vector3Tuple,
      scale: [0.84, 1.36, 0.84] as Vector3Tuple,
    },
    {
      key: "estate-arrival-table",
      url: "/models/optimized/polyhaven/gallinera_table/gallinera_table_lod0.glb",
      position: arrivalTablePosition,
      rotation: [0, -0.16, 0] as Vector3Tuple,
      scale: [1.36, 0.8, 0.86] as Vector3Tuple,
    },
    {
      key: "estate-arrival-table-vase",
      url: "/models/optimized/polyhaven/antique_ceramic_vase_01/antique_ceramic_vase_01_lod1.glb",
      position: [arrivalTablePosition[0] - 0.2, 1.02, arrivalTablePosition[2]] as Vector3Tuple,
      rotation: [0, -0.26, 0] as Vector3Tuple,
      scale: [0.27, 0.42, 0.27] as Vector3Tuple,
    },
    {
      key: "estate-arrival-table-candleholders",
      url: "/models/optimized/polyhaven/brass_candleholders/brass_candleholders_lod2.glb",
      position: [arrivalTablePosition[0] + 0.24, 1.12, arrivalTablePosition[2]] as Vector3Tuple,
      rotation: [0, -0.08, 0] as Vector3Tuple,
      scale: [0.38, 0.58, 0.28] as Vector3Tuple,
    },
    {
      key: "estate-reading-rocker",
      url: "/models/optimized/polyhaven/Rockingchair_01/Rockingchair_01_lod0.glb",
      position: readingNookPosition,
      rotation: [0, -2.42, 0] as Vector3Tuple,
      scale: [0.82, 1.12, 1.02] as Vector3Tuple,
    },
    {
      key: "estate-reading-basket",
      url: "/models/optimized/polyhaven/wicker_basket_02/wicker_basket_02_lod1.glb",
      position: [readingNookPosition[0] - 0.92, 0.21, readingNookPosition[2] + 0.74] as Vector3Tuple,
      rotation: [0, 0.34, 0] as Vector3Tuple,
      scale: [0.5, 0.42, 0.45] as Vector3Tuple,
    },
    {
      key: "estate-east-bookshelf",
      url: "/models/optimized/polyhaven/wooden_bookshelf_worn/wooden_bookshelf_worn_lod0.glb",
      position: [bounds[0] / 2 - 0.5, 1.1, bounds[2] * 0.05] as Vector3Tuple,
      rotation: [0, -Math.PI / 2, 0] as Vector3Tuple,
      scale: [1.46, 2.2, 0.62] as Vector3Tuple,
    },
    {
      key: "estate-west-vintage-glass-cabinet",
      url: "/models/optimized/polyhaven/vintage_cabinet_01/vintage_cabinet_01_lod0.glb",
      position: [-bounds[0] * 0.27, 1.18, bounds[2] / 2 - 0.52] as Vector3Tuple,
      rotation: [0, Math.PI, 0] as Vector3Tuple,
      scale: [1.2, 2.35, 0.64] as Vector3Tuple,
    },
    {
      key: "estate-east-document-drawers",
      url: "/models/optimized/polyhaven/vintage_wooden_drawer_01/vintage_wooden_drawer_01_lod0.glb",
      position: [bounds[0] / 2 - 0.5, 0.56, -bounds[2] * 0.2] as Vector3Tuple,
      rotation: [0, -Math.PI / 2, 0] as Vector3Tuple,
      scale: [1.05, 1.12, 0.58] as Vector3Tuple,
    },
    {
      key: "estate-east-ornate-mirror",
      url: "/models/optimized/polyhaven/ornate_mirror_01/ornate_mirror_01_lod0.glb",
      position: [bounds[0] / 2 - 0.24, 1.78, bounds[2] * 0.18] as Vector3Tuple,
      rotation: [0, -Math.PI / 2, 0] as Vector3Tuple,
      scale: [0.82, 1.2, 0.12] as Vector3Tuple,
    },
    {
      key: "estate-south-console",
      url: "/models/optimized/polyhaven/chinese_console_table/chinese_console_table_lod0.glb",
      position: southConsolePosition,
      rotation: [0, Math.PI, 0] as Vector3Tuple,
      scale: [1.72, 0.66, 0.34] as Vector3Tuple,
    },
    {
      key: "estate-tea-table-service",
      url: "/models/optimized/polyhaven/tea_set_01/tea_set_01_lod0.glb",
      position: [teaTablePosition[0], 0.745, teaTablePosition[2]] as Vector3Tuple,
      rotation: [0, -0.22, 0] as Vector3Tuple,
      scale: [0.38, 0.33, 0.54] as Vector3Tuple,
    },
    {
      key: "estate-console-jug",
      url: "/models/optimized/polyhaven/jug_01/jug_01_lod1.glb",
      position: [southConsolePosition[0] + 0.52, 0.87, southConsolePosition[2]] as Vector3Tuple,
      rotation: [0, 0.32, 0] as Vector3Tuple,
      scale: [0.3, 0.42, 0.3] as Vector3Tuple,
    },
    {
      key: "estate-side-table-succulent",
      url: "/models/optimized/polyhaven/potted_plant_04/potted_plant_04_lod0.glb",
      position: [northSideTablePosition[0], 0.98, northSideTablePosition[2]] as Vector3Tuple,
      rotation: [0, 0.45, 0] as Vector3Tuple,
      scale: [0.27, 0.31, 0.27] as Vector3Tuple,
    },
    {
      key: "estate-side-table-candleholders",
      url: "/models/optimized/polyhaven/brass_candleholders/brass_candleholders_lod1.glb",
      position: [southSideTablePosition[0], 1.13, southSideTablePosition[2]] as Vector3Tuple,
      rotation: [0, -0.18, 0] as Vector3Tuple,
      scale: [0.46, 0.6, 0.32] as Vector3Tuple,
    },
    {
      key: "estate-console-candleholders",
      url: "/models/optimized/polyhaven/brass_candleholders/brass_candleholders_lod0.glb",
      position: [southConsolePosition[0] - 0.42, 0.99, southConsolePosition[2]] as Vector3Tuple,
      rotation: [0, Math.PI + 0.05, 0] as Vector3Tuple,
      scale: [0.5, 0.66, 0.34] as Vector3Tuple,
    },
    {
      key: "estate-console-books",
      url: "/models/optimized/polyhaven/book_encyclopedia_set_01/book_encyclopedia_set_01_lod1.glb",
      position: [southConsolePosition[0], 0.79, southConsolePosition[2]] as Vector3Tuple,
      rotation: [0, Math.PI - 0.08, 0] as Vector3Tuple,
      scale: [0.56, 0.25, 0.18] as Vector3Tuple,
    },
    {
      key: "estate-west-gallery-painting",
      url: "/models/optimized/polyhaven/fancy_picture_frame_01/fancy_picture_frame_01_lod0.glb",
      position: [-bounds[0] / 2 + 0.18, 3.45, westGalleryCenterZ] as Vector3Tuple,
      rotation: [0, Math.PI / 2, 0] as Vector3Tuple,
      scale: [1.05, 0.82, 0.055] as Vector3Tuple,
    },
    {
      key: "estate-grandfather-clock",
      url: "/models/optimized/polyhaven/vintage_grandfather_clock_01/vintage_grandfather_clock_01_lod0.glb",
      position: [-bounds[0] * 0.34, 1.1, bounds[2] / 2 - 0.42] as Vector3Tuple,
      rotation: [0, Math.PI, 0] as Vector3Tuple,
      scale: [0.72, 2.2, 0.42] as Vector3Tuple,
    },
    {
      key: "estate-south-gallery-painting",
      url: "/models/optimized/polyhaven/fancy_picture_frame_02/fancy_picture_frame_02_lod0.glb",
      position: [bounds[0] * 0.35, 3.35, bounds[2] / 2 - 0.18] as Vector3Tuple,
      rotation: [0, Math.PI, 0] as Vector3Tuple,
      scale: [1.08, 0.82, 0.055] as Vector3Tuple,
    },
  ] as const;
  const hiddenWithCutawayWalls = new Set([
    "estate-east-bookshelf",
    "estate-east-document-drawers",
    "estate-east-ornate-mirror",
    "estate-south-console",
    "estate-west-vintage-glass-cabinet",
    "estate-console-jug",
    "estate-console-candleholders",
    "estate-console-books",
    "estate-grandfather-clock",
    "estate-south-gallery-painting",
  ]);

  return (
    <group userData={{ decorativeOnly: true, module: "estate-furniture-composition", assetQuality: "textured-pbr" }}>
      <group
        name="estate-conversation-rug"
        position={[centerX - 0.1, 0.028, centerZ]}
        rotation={[0, 0.02, 0]}
        scale={[5.1, 1, 4.1]}
        userData={{ decorativeOnly: true, placementValidated: true, surface: "pbr-textile" }}
      >
        <StoryRug highlighted={false} highlightColor="#000000" />
      </group>
      <group
        name="estate-east-parlor-rug"
        position={[eastParlorCenterX, 0.029, eastParlorCenterZ]}
        rotation={[0, -0.015, 0]}
        scale={[4.55, 1, 3.8]}
        userData={{ decorativeOnly: true, placementValidated: true, surface: "pbr-textile" }}
      >
        <StoryRug highlighted={false} highlightColor="#000000" />
      </group>
      <group
        name="estate-west-gallery-rug"
        position={[-bounds[0] / 2 + 1.72, 0.03, westGalleryCenterZ]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[3.8, 1, 3.25]}
        userData={{ decorativeOnly: true, placementValidated: true, surface: "pbr-textile" }}
      >
        <StoryRug highlighted={false} highlightColor="#000000" />
      </group>
      <group
        name="estate-arrival-table-rug"
        position={[arrivalTablePosition[0], 0.031, arrivalTablePosition[2]]}
        rotation={[0, -0.16, 0]}
        scale={[2.85, 1, 2.35]}
        userData={{ decorativeOnly: true, placementValidated: true, surface: "pbr-textile" }}
      >
        <StoryRug highlighted={false} highlightColor="#000000" />
      </group>
      {furniture.filter((item) => !overview || !hiddenWithCutawayWalls.has(item.key)).map((item) => (
        <group
          key={item.key}
          name={item.key}
          position={item.position}
          rotation={item.rotation}
          scale={item.scale}
          userData={{ decorativeOnly: true, placementValidated: true }}
        >
          <Suspense fallback={null}>
            <LoadedModel url={item.url} tint={"tint" in item ? item.tint : undefined} />
          </Suspense>
          {item.key === "estate-east-bookshelf" && <BookcaseContents />}
          {item.key.includes("oil-lamp") && (
            <pointLight position={[0, 0.24, 0]} color="#f2ad61" intensity={0.75} distance={4.2} decay={2} />
          )}
        </group>
      ))}
    </group>
  );
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

function EstateWallpaperPanel({
  position,
  yaw = 0,
  width,
  height,
}: {
  position: Vector3Tuple;
  yaw?: number;
  width: number;
  height: number;
}) {
  const wallpaper = useRepeatingStoryTexture(
    "/textures/story/ashwood-victorian-wallpaper-v1.webp",
    [Math.max(1, width / 5.2), Math.max(1, height / 5.2)],
  );
  return (
    <group position={position} rotation={[0, yaw, 0]} userData={{ decorativeOnly: true, material: "estate-wallpaper" }}>
      <mesh receiveShadow>
        <boxGeometry args={[width, height, 0.025]} />
        <meshStandardMaterial
          map={wallpaper}
          color="#f0ead8"
          emissive="#4d5238"
          emissiveMap={wallpaper}
          emissiveIntensity={0.22}
          roughness={0.96}
        />
      </mesh>
    </group>
  );
}

function EstateChandelier({ bounds, z }: { bounds: Vector3Tuple; z: number }) {
  const dimensions: Vector3Tuple = [1.65, 2.1, 1.65];
  const x = 0;
  const centerY = bounds[1] - dimensions[1] / 2 - 2.15;
  const fixtureTop = centerY + dimensions[1] / 2;
  const ceilingAnchor = bounds[1] - 0.16;
  const chainLength = ceilingAnchor - fixtureTop;
  return (
    <group userData={{ decorativeOnly: true, module: "ceiling-mounted-estate-chandelier" }}>
      <group position={[x, centerY, z]} scale={dimensions}>
        <Suspense fallback={null}>
          <LoadedModel url="/models/optimized/polyhaven/Chandelier_03/Chandelier_03_lod0.glb" />
        </Suspense>
      </group>
      <mesh position={[x, bounds[1] - 0.085, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.3, 0.11, 32]} />
        <meshStandardMaterial color="#6c4b25" roughness={0.42} metalness={0.62} />
      </mesh>
      <mesh position={[x, fixtureTop + chainLength / 2, z]} castShadow>
        <cylinderGeometry args={[0.022, 0.022, chainLength, 12]} />
        <meshStandardMaterial color="#4a3420" roughness={0.48} metalness={0.72} />
      </mesh>
    </group>
  );
}

function HistoricalInteriorDetails({
  bounds,
  presentation,
  overview,
  layout,
  dressingInstances,
}: {
  bounds: Vector3Tuple;
  presentation: ScenePresentation;
  overview: boolean;
  layout: WorldLayout;
  dressingInstances: readonly ResolvedDressingInstance[];
}) {
  const timber = presentation.palette.timber;
  const panelHeight = Math.min(1.55, bounds[1] * 0.24);
  const friezeY = Math.max(3.8, Math.min(bounds[1] - 0.72, bounds[1] * 0.82));
  const obstacles = useMemo(
    () => collectWallObstacles(layout, dressingInstances, panelHeight + 0.22),
    [dressingInstances, layout, panelHeight],
  );
  const artObstacles = useMemo(
    () => collectWallObstacles(layout, dressingInstances, bounds[1]),
    [bounds, dressingInstances, layout],
  );

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

  const wallPanels = (wall: RuntimeWall) => {
    const horizontal = wall === "north" || wall === "south";
    const span = horizontal ? bounds[0] : bounds[2];
    const runs = createWallTrimSegments(span, obstacles[wall], 0.08, 0.09);
    return runs.flatMap((run, runIndex) => {
      const runLength = run.length;
      const runStart = run.center - run.length / 2;
      const cellCount = Math.max(1, Math.ceil(runLength / 1.42));
      const cellWidth = runLength / cellCount;
      return Array.from({ length: cellCount }, (_, cellIndex) => {
        const along = runStart + cellWidth * (cellIndex + 0.5);
        const width = Math.max(0.12, cellWidth - 0.055);
        const key = `${wall}-panel-${runIndex}-${cellIndex}`;
        if (wall === "north") return panel(key, [along, panelHeight / 2 + 0.12, -bounds[2] / 2 + 0.095], width);
        if (wall === "south") return panel(key, [along, panelHeight / 2 + 0.12, bounds[2] / 2 - 0.095], width, Math.PI);
        if (wall === "west") return panel(key, [-bounds[0] / 2 + 0.095, panelHeight / 2 + 0.12, along], width, Math.PI / 2);
        return panel(key, [bounds[0] / 2 - 0.095, panelHeight / 2 + 0.12, along], width, -Math.PI / 2);
      });
    });
  };

  const wallRails = (wall: RuntimeWall) => {
    const horizontal = wall === "north" || wall === "south";
    const span = horizontal ? bounds[0] : bounds[2];
    return createWallTrimSegments(span, obstacles[wall], 0.08, 0.09).map((run, index) => {
      const length = run.length;
      const along = run.center;
      const position: Vector3Tuple = wall === "north"
        ? [along, panelHeight + 0.16, -bounds[2] / 2 + 0.12]
        : wall === "south"
          ? [along, panelHeight + 0.16, bounds[2] / 2 - 0.12]
          : wall === "west"
            ? [-bounds[0] / 2 + 0.12, panelHeight + 0.16, along]
            : [bounds[0] / 2 - 0.12, panelHeight + 0.16, along];
      const dimensions: Vector3Tuple = horizontal ? [length, 0.12, 0.14] : [0.14, 0.12, length];
      return (
        <RoundedBox key={`${wall}-rail-${index}`} args={dimensions} radius={0.025} smoothness={3} position={position} castShadow>
          <meshStandardMaterial color={timber} roughness={0.84} />
        </RoundedBox>
      );
    });
  };

  const wallArt = (wall: RuntimeWall) => {
    const horizontal = wall === "north" || wall === "south";
    const span = horizontal ? bounds[0] : bounds[2];
    const importedWestGalleryCenter = bounds[2] * 0.16;
    return createWallTrimSegments(span, artObstacles[wall], 0.42, 0.6)
      .filter((run) => run.length >= 2.25)
      .filter((run) => wall !== "west" || Math.abs(run.center - importedWestGalleryCenter) >= 2.1)
      .slice(0, 3)
      .map((run, index) => {
        const width = Math.min(1.25, run.length * 0.46);
        const position: Vector3Tuple = wall === "north"
          ? [run.center, 3.28, -bounds[2] / 2 + 0.135]
          : wall === "south"
            ? [run.center, 3.28, bounds[2] / 2 - 0.135]
            : wall === "west"
              ? [-bounds[0] / 2 + 0.135, 3.28, run.center]
              : [bounds[0] / 2 - 0.135, 3.28, run.center];
        const yaw = wall === "north" ? 0 : wall === "south" ? Math.PI : wall === "west" ? Math.PI / 2 : -Math.PI / 2;
        return <DecorativeWallPortrait key={`${wall}-gallery-${index}`} position={position} yaw={yaw} width={width} seed={index + wall.length} />;
      });
  };

  const wallSconces = (wall: "north" | "west") => {
    const span = wall === "north" ? bounds[0] : bounds[2];
    return createWallTrimSegments(span, artObstacles[wall], 0.7, 0.72)
      .filter((run) => run.length >= 1.05 && run.length < 2.25)
      .slice(0, 2)
      .map((run, index) => {
        const position: Vector3Tuple = wall === "north"
          ? [run.center, 3.05, -bounds[2] / 2 + 0.18]
          : [-bounds[0] / 2 + 0.18, 3.05, run.center];
        return (
          <DecorativeWallSconce
            key={`${wall}-sconce-${index}`}
            position={position}
            yaw={wall === "north" ? 0 : Math.PI / 2}
            lit={index === 0}
          />
        );
      });
  };

  return (
    <group userData={{ decorativeOnly: true, module: "historical-interior-details" }}>
      <EstateWallpaperPanel
        position={[0, panelHeight + (bounds[1] - panelHeight) / 2 - 0.08, -bounds[2] / 2 + 0.08]}
        width={bounds[0] - 0.2}
        height={bounds[1] - panelHeight - 0.34}
      />
      <EstateWallpaperPanel
        position={[-bounds[0] / 2 + 0.08, panelHeight + (bounds[1] - panelHeight) / 2 - 0.08, 0]}
        yaw={Math.PI / 2}
        width={bounds[2] - 0.2}
        height={bounds[1] - panelHeight - 0.34}
      />
      {!overview && (
        <>
          <EstateWallpaperPanel
            position={[0, panelHeight + (bounds[1] - panelHeight) / 2 - 0.08, bounds[2] / 2 - 0.08]}
            yaw={Math.PI}
            width={bounds[0] - 0.2}
            height={bounds[1] - panelHeight - 0.34}
          />
          <EstateWallpaperPanel
            position={[bounds[0] / 2 - 0.08, panelHeight + (bounds[1] - panelHeight) / 2 - 0.08, 0]}
            yaw={-Math.PI / 2}
            width={bounds[2] - 0.2}
            height={bounds[1] - panelHeight - 0.34}
          />
        </>
      )}
      {!overview && (
        <>
          <EstateChandelier bounds={bounds} z={-bounds[2] * 0.2} />
          <EstateChandelier bounds={bounds} z={bounds[2] * 0.18} />
        </>
      )}
      {wallPanels("north")}
      {wallPanels("west")}
      {!overview && wallPanels("south")}
      {!overview && wallPanels("east")}
      {wallRails("north")}
      {wallRails("west")}
      {!overview && wallRails("south")}
      {!overview && wallRails("east")}
      {wallArt("north")}
      {wallArt("west")}
      {!overview && wallArt("south")}
      {!overview && wallArt("east")}
      <group position={[0, friezeY, -bounds[2] / 2 + 0.14]} userData={{ decorativeOnly: true, motif: "estate-frieze" }}>
        <RoundedBox args={[bounds[0] * 0.86, 0.2, 0.055]} radius={0.035} smoothness={3} castShadow>
          <meshStandardMaterial color="#665442" roughness={0.84} />
        </RoundedBox>
        <mesh position={[0, -0.075, 0.045]} castShadow>
          <boxGeometry args={[bounds[0] * 0.82, 0.025, 0.025]} />
          <meshStandardMaterial color="#aa8a5b" roughness={0.64} metalness={0.12} />
        </mesh>
      </group>
      {wallSconces("north")}
      {wallSconces("west")}
      {[
        [[0, bounds[1] - 0.18, -bounds[2] / 2 + 0.13], [bounds[0], 0.2, 0.18]],
        [[-bounds[0] / 2 + 0.13, bounds[1] - 0.18, 0], [0.18, 0.2, bounds[2]]],
        ...(!overview ? [
          [[0, bounds[1] - 0.18, bounds[2] / 2 - 0.13], [bounds[0], 0.2, 0.18]],
          [[bounds[0] / 2 - 0.13, bounds[1] - 0.18, 0], [0.18, 0.2, bounds[2]]],
        ] : []),
      ].map(([position, dimensions], index) => (
        <mesh key={`estate-moulding-${index}`} position={position as Vector3Tuple} castShadow>
          <boxGeometry args={dimensions as Vector3Tuple} />
          <meshStandardMaterial color="#8d765e" roughness={0.84} />
        </mesh>
      ))}
      {!overview && (
        <group position={[0, bounds[1] - 0.13, -bounds[2] * 0.08]} rotation={[Math.PI / 2, 0, 0]} userData={{ decorativeOnly: true, role: "ceiling-medallion" }}>
          <mesh castShadow>
            <cylinderGeometry args={[0.72, 0.72, 0.055, 48]} />
            <meshStandardMaterial color="#c3ad8d" roughness={0.82} />
          </mesh>
          {[0.34, 0.57].map((radius) => (
            <mesh key={`ceiling-medallion-ring-${radius}`} position={[0, 0.04, 0]} castShadow>
              <torusGeometry args={[radius, 0.035, 10, 48]} />
              <meshStandardMaterial color="#876c49" roughness={0.7} metalness={0.08} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

function DecorativeWallSconce({
  position,
  yaw,
  lit = false,
}: {
  position: Vector3Tuple;
  yaw: number;
  lit?: boolean;
}) {
  return (
    <group position={position} rotation={[0, yaw, 0]} userData={{ decorativeOnly: true }}>
      <RoundedBox args={[0.24, 0.38, 0.07]} radius={0.055} smoothness={4} castShadow>
        <meshStandardMaterial color="#8d6638" metalness={0.68} roughness={0.38} />
      </RoundedBox>
      <mesh position={[0, -0.02, 0.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.045, 0.34, 12]} />
        <meshStandardMaterial color="#a77b42" metalness={0.72} roughness={0.34} />
      </mesh>
      <mesh position={[0, 0.13, 0.37]} castShadow>
        <cylinderGeometry args={[0.075, 0.09, 0.34, 14]} />
        <meshStandardMaterial color="#eee0bd" roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.38, 0.37]} scale={[0.075, 0.16, 0.075]}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial color="#ffd17a" emissive="#ef8d35" emissiveIntensity={2.1} roughness={0.2} />
      </mesh>
      {lit && <pointLight position={[0, 0.42, 0.5]} color="#f2b36a" intensity={0.72} distance={5.2} decay={2} />}
    </group>
  );
}

function DecorativeWallPortrait({
  position,
  yaw,
  width,
  seed,
}: {
  position: Vector3Tuple;
  yaw: number;
  width: number;
  seed: number;
}) {
  const height = width * 1.18;
  const atlas = useStoryTexture("/textures/story/storybook-gallery-atlas-v1.png");
  const painting = useMemo(() => {
    const texture = atlas.clone();
    const quadrant = seed % 4;
    texture.repeat.set(0.5, 0.5);
    texture.offset.set((quadrant % 2) * 0.5, quadrant < 2 ? 0.5 : 0);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, [atlas, seed]);
  useEffect(() => () => painting.dispose(), [painting]);
  return (
    <group position={position} rotation={[0, yaw, 0]} userData={{ decorativeOnly: true }}>
      <RoundedBox args={[width, height, 0.075]} radius={0.035} smoothness={4} castShadow>
        <meshStandardMaterial color="#9a7440" metalness={0.38} roughness={0.5} />
      </RoundedBox>
      <mesh position={[0, 0, 0.045]} castShadow>
        <planeGeometry args={[width - 0.16, height - 0.16]} />
            <meshStandardMaterial map={painting} emissive="#534536" emissiveMap={painting} emissiveIntensity={0.2} roughness={0.9} />
      </mesh>
    </group>
  );
}

type RuntimeWall = "north" | "south" | "west" | "east";

function rotatedFootprint(dimensions: Vector3Tuple, yaw: number): [number, number] {
  const sine = Math.abs(Math.sin(yaw));
  const cosine = Math.abs(Math.cos(yaw));
  return [
    dimensions[0] * cosine + dimensions[2] * sine,
    dimensions[0] * sine + dimensions[2] * cosine,
  ];
}

function collectWallObstacles(
  layout: WorldLayout,
  dressingInstances: readonly ResolvedDressingInstance[],
  maximumBottom: number,
): Record<RuntimeWall, Array<{ center: number; width: number }>> {
  const bounds = layout.location.bounds ?? [12, 4.5, 10];
  const byWall: Record<RuntimeWall, Array<{ center: number; width: number }>> = {
    north: [], south: [], west: [], east: [],
  };
  for (const item of layout.items) {
    const bottom = item.position[1] - item.dimensions[1] / 2;
    if (bottom > maximumBottom || item.dimensions[1] < 0.18) continue;
    const [footprintX, footprintZ] = rotatedFootprint(item.dimensions, item.rotation[1]);
    const candidates: Array<{ wall: RuntimeWall; distance: number }> = [
      { wall: "north", distance: Math.abs(item.position[2] - footprintZ / 2 + bounds[2] / 2) },
      { wall: "south", distance: Math.abs(bounds[2] / 2 - item.position[2] - footprintZ / 2) },
      { wall: "west", distance: Math.abs(item.position[0] - footprintX / 2 + bounds[0] / 2) },
      { wall: "east", distance: Math.abs(bounds[0] / 2 - item.position[0] - footprintX / 2) },
    ];
    const nearest = candidates.sort((left, right) => left.distance - right.distance)[0]!;
    if (nearest.distance > 0.24) continue;
    byWall[nearest.wall].push({
      center: nearest.wall === "north" || nearest.wall === "south" ? item.position[0] : item.position[2],
      width: nearest.wall === "north" || nearest.wall === "south" ? footprintX : footprintZ,
    });
  }
  for (const instance of dressingInstances) {
    if (!instance.wall) continue;
    const [footprintX, footprintZ] = rotatedFootprint(instance.dimensions, instance.rotation[1]);
    byWall[instance.wall].push({
      center: instance.wall === "north" || instance.wall === "south" ? instance.position[0] : instance.position[2],
      width: instance.wall === "north" || instance.wall === "south" ? footprintX : footprintZ,
    });
  }
  return byWall;
}

function SegmentedWallTrim({
  layout,
  dressingInstances,
  walls,
  color,
  height = 0.24,
  depth = WALL_COMPOSITION.trimDepth,
  centerInset = WALL_COMPOSITION.trimCenterInset,
}: {
  layout: WorldLayout;
  dressingInstances: readonly ResolvedDressingInstance[];
  walls: readonly RuntimeWall[];
  color: string;
  height?: number;
  depth?: number;
  centerInset?: number;
}) {
  const bounds = layout.location.bounds ?? [12, 4.5, 10];
  const obstacles = useMemo(
    () => collectWallObstacles(layout, dressingInstances, height + 0.08),
    [dressingInstances, height, layout],
  );

  return (
    <group userData={{ decorativeOnly: true, module: "segmented-wall-trim" }}>
      {walls.flatMap((wall) => {
        const span = wall === "north" || wall === "south" ? bounds[0] : bounds[2];
        return createWallTrimSegments(span, obstacles[wall]).map((segment, index) => {
          const position: Vector3Tuple = wall === "north"
            ? [segment.center, height / 2, -bounds[2] / 2 + centerInset]
            : wall === "south"
              ? [segment.center, height / 2, bounds[2] / 2 - centerInset]
              : wall === "west"
                ? [-bounds[0] / 2 + centerInset, height / 2, segment.center]
                : [bounds[0] / 2 - centerInset, height / 2, segment.center];
          const dimensions: Vector3Tuple = wall === "north" || wall === "south"
            ? [segment.length, height, depth]
            : [depth, height, segment.length];
          return (
            <RoundedBox key={`${wall}:${index}`} args={dimensions} radius={0.018} smoothness={2} position={position} castShadow receiveShadow>
              <meshStandardMaterial color={color} roughness={0.78} />
            </RoundedBox>
          );
        });
      })}
    </group>
  );
}

function ArchiveGalleryDetails({
  bounds,
  overview,
  roomTextures,
}: {
  bounds: Vector3Tuple;
  overview: boolean;
  roomTextures: { floorColor: THREE.Texture };
}) {
  const sideShelf = (side: -1 | 1, factor: number) => (
    <group
      key={`archive-side-shelf:${side}:${factor}`}
      position={[side * (bounds[0] / 2 - 0.31), 1.82, bounds[2] * factor]}
      rotation={[0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
      scale={[2.2, 3.64, 0.66]}
    >
      <Suspense fallback={null}>
        <LoadedModel url="/models/optimized/polyhaven/wooden_bookshelf_worn/wooden_bookshelf_worn_lod1.glb" tint="#704a32" />
        <BookcaseContents />
      </Suspense>
    </group>
  );
  const rearShelfFactors = [-0.41, -0.255, -0.1, 0.1, 0.255, 0.41];
  const interiorStacks: ReadonlyArray<{ key: string; position: Vector3Tuple; yaw: number }> = [
    { key: "northwest", position: [-bounds[0] * 0.135, 1.45, -bounds[2] * 0.24], yaw: 0 },
    { key: "southwest", position: [-bounds[0] * 0.135, 1.45, -bounds[2] * 0.08], yaw: 0 },
    { key: "northeast", position: [bounds[0] * 0.135, 1.45, -bounds[2] * 0.24], yaw: 0 },
    { key: "southeast", position: [bounds[0] * 0.135, 1.45, -bounds[2] * 0.08], yaw: 0 },
  ];

  return (
    <group userData={{ decorativeOnly: true, module: "archive-gallery-details" }}>
      {[-0.22, 0.22].map((factor) => (
        <group
          key={`archive-aisle-runner:${factor}`}
          name={`archive-aisle-runner:${factor}`}
          position={[bounds[0] * factor, 0.014, 0.45]}
          scale={[2.65, 1, Math.max(8.8, bounds[2] * 0.39)]}
          userData={{ decorativeOnly: true, placementValidated: true, surface: "pbr-textile" }}
        >
          <StoryRug highlighted={false} highlightColor="#000000" />
        </group>
      ))}
      {[-0.33, 0.33].map((factor) => sideShelf(-1, factor))}
      {!overview && [-0.33, 0.33].map((factor) => sideShelf(1, factor))}
      {interiorStacks.map((stack) => (
        <group
          key={`archive-interior-stack:${stack.key}`}
          name={`archive-interior-stack:${stack.key}`}
          position={stack.position}
          rotation={[0, stack.yaw, 0]}
          scale={[1.72, 2.9, 0.68]}
          userData={{ decorativeOnly: true, placementValidated: true, module: "archive-interior-stack" }}
        >
          <Suspense fallback={null}>
            <LoadedModel url="/models/optimized/polyhaven/wooden_bookshelf_worn/wooden_bookshelf_worn_lod1.glb" tint="#704a32" />
            <BookcaseContents />
          </Suspense>
        </group>
      ))}
      {[-0.34, 0, 0.34].map((factor, index) => (
        <group key={`archive-rear-sconce:${factor}`}>
          <DecorativeWallSconce
            position={[bounds[0] * factor, 5.15, -bounds[2] / 2 + 0.2]}
            yaw={0}
            lit={index !== 1}
          />
        </group>
      ))}
      {rearShelfFactors.map((factor, index) => (
        <group
          key={`archive-shelf-light-${factor}`}
          position={[bounds[0] * factor, 4.45, -bounds[2] / 2 + 0.72]}
          userData={{ decorativeOnly: true, motif: "shelf-light" }}
        >
          <RoundedBox args={[0.2, 0.34, 0.08]} radius={0.04} smoothness={3} position={[0, 0.13, -0.14]} castShadow>
            <meshStandardMaterial color="#8e693b" metalness={0.72} roughness={0.34} />
          </RoundedBox>
          <mesh position={[0, 0.04, -0.03]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 0.34, 12]} />
            <meshStandardMaterial color="#8e693b" metalness={0.72} roughness={0.34} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.065, 0.065, 0.68, 14]} />
            <meshStandardMaterial color="#c69b58" emissive="#9f5d25" emissiveIntensity={0.4} metalness={0.58} roughness={0.34} />
          </mesh>
          {index % 2 === 0 && <pointLight color="#eeb36b" intensity={0.24} distance={3.2} decay={2} />}
        </group>
      ))}
      {!overview && [-0.39, -0.13, 0.13, 0.39].map((factor) => (
        <RoundedBox
          key={`archive-cross-rib:${factor}`}
          args={[0.18, 0.2, bounds[2] - 0.25]}
          radius={0.035}
          smoothness={3}
          position={[bounds[0] * factor, bounds[1] - 0.14, 0]}
          castShadow
        >
          <meshStandardMaterial color="#654f3e" roughness={0.9} />
        </RoundedBox>
      ))}
      {!overview && [-0.35, 0, 0.35].map((factor) => (
        <RoundedBox
          key={`archive-width-rib:${factor}`}
          args={[bounds[0] - 0.25, 0.18, 0.2]}
          radius={0.035}
          smoothness={3}
          position={[0, bounds[1] - 0.12, bounds[2] * factor]}
          castShadow
        >
          <meshStandardMaterial color="#654f3e" roughness={0.9} />
        </RoundedBox>
      ))}
      <group
        position={[bounds[0] * 0.255, 1.88, -bounds[2] / 2 + 0.92]}
        rotation={[0.04, 0, -0.13]}
        userData={{ decorativeOnly: true, module: "archive-rolling-ladder" }}
      >
        {[-0.39, 0.39].map((x) => (
          <RoundedBox key={`ladder-rail-${x}`} args={[0.1, 3.7, 0.12]} radius={0.035} smoothness={3} position={[x, 0, 0]} castShadow>
            <meshStandardMaterial color="#7a5336" roughness={0.78} />
          </RoundedBox>
        ))}
        {Array.from({ length: 9 }, (_, index) => (
          <RoundedBox key={`ladder-rung-${index}`} args={[0.82, 0.085, 0.16]} radius={0.025} smoothness={3} position={[0, -1.48 + index * 0.37, 0.02]} castShadow>
            <meshStandardMaterial color="#9a6c42" roughness={0.74} />
          </RoundedBox>
        ))}
        <mesh position={[0, 1.92, -0.08]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.09, 0.09, 1.12, 18]} />
          <meshStandardMaterial color="#a77b45" metalness={0.56} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

function Room({
  layout,
  presentation,
  dressingInstances,
  onGroundNavigate,
  overview,
  renderQuality,
}: {
  layout: WorldLayout;
  presentation: ScenePresentation;
  dressingInstances: readonly ResolvedDressingInstance[];
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
        "/textures/polyhaven/damaged_plaster_diff_1k.jpg",
        [2.7, 1.45],
        true,
      ),
      wallNormal: load(
        "/textures/polyhaven/damaged_plaster_nor_gl_1k.jpg",
        [2.7, 1.45],
      ),
      wallArm: load(
        "/textures/polyhaven/damaged_plaster_arm_1k.jpg",
        [2.7, 1.45],
      ),
      ceilingColor: load(
        "/textures/polyhaven/plastered_wall_03_diff_1k.jpg",
        [3.4, 3.4],
        true,
      ),
      ceilingNormal: load(
        "/textures/polyhaven/plastered_wall_03_nor_gl_1k.jpg",
        [3.4, 3.4],
      ),
      ceilingArm: load(
        "/textures/polyhaven/plastered_wall_03_arm_1k.jpg",
        [3.4, 3.4],
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
      stoneColor: load(
        "/textures/polyhaven/castle_wall_slates_diff_1k.jpg",
        [4.2, 4.2],
        true,
      ),
      stoneNormal: load(
        "/textures/polyhaven/castle_wall_slates_nor_gl_1k.jpg",
        [4.2, 4.2],
      ),
      stoneArm: load(
        "/textures/polyhaven/castle_wall_slates_arm_1k.jpg",
        [4.2, 4.2],
      ),
    };
  }, []);
  const usesEstatePaneling = presentation.location.architectureTags.includes("estate-paneling");
  const genericWallColor = usesArchiveKit
    ? "#81877a"
    : usesEstatePaneling
      ? "#b9ad98"
      : presentation.architecture.plasterWalls
        ? "#d3c5aa"
        : presentation.palette.wall;
  const genericWallMaps = presentation.architecture.plasterWalls || usesArchiveKit;
  const usesCleanPlaster = usesArchiveKit || usesEstatePaneling;
  const genericWallColorMap = usesCleanPlaster ? roomTextures.ceilingColor : roomTextures.wallColor;
  const genericWallNormalMap = usesCleanPlaster ? roomTextures.ceilingNormal : roomTextures.wallNormal;
  const genericWallRoughnessMap = usesCleanPlaster ? roomTextures.ceilingArm : roomTextures.wallArm;
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
  const archiveShelfCenters = [-0.41, -0.255, -0.1, 0.1, 0.255, 0.41]
    .map((factor) => bounds[0] * factor);
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
          color={genericWallColor}
          map={genericWallMaps ? genericWallColorMap : undefined}
          normalMap={genericWallMaps ? genericWallNormalMap : undefined}
          normalScale={new THREE.Vector2(0.48, 0.48)}
          roughnessMap={genericWallMaps ? genericWallRoughnessMap : undefined}
          roughness={0.98}
        />
      </mesh>}
      {usesGenericKit && <mesh position={[-bounds[0] / 2, bounds[1] / 2, 0]} receiveShadow>
        <boxGeometry args={[wallThickness, bounds[1], bounds[2]]} />
        <meshStandardMaterial
          color={genericWallColor}
          map={genericWallMaps ? genericWallColorMap : undefined}
          normalMap={genericWallMaps ? genericWallNormalMap : undefined}
          normalScale={new THREE.Vector2(0.48, 0.48)}
          roughnessMap={genericWallMaps ? genericWallRoughnessMap : undefined}
          roughness={0.98}
        />
      </mesh>}
      {!overview && usesGenericKit && (
        <>
          <mesh position={[0, bounds[1] / 2, bounds[2] / 2]} receiveShadow>
            <boxGeometry args={[bounds[0], bounds[1], wallThickness]} />
            <meshStandardMaterial
              color={genericWallColor}
              map={genericWallMaps ? genericWallColorMap : undefined}
              normalMap={genericWallMaps ? genericWallNormalMap : undefined}
              normalScale={new THREE.Vector2(0.48, 0.48)}
              roughnessMap={genericWallMaps ? genericWallRoughnessMap : undefined}
              roughness={0.98}
            />
          </mesh>
          <mesh position={[bounds[0] / 2, bounds[1] / 2, 0]} receiveShadow>
            <boxGeometry args={[wallThickness, bounds[1], bounds[2]]} />
            <meshStandardMaterial
              color={genericWallColor}
              map={genericWallMaps ? genericWallColorMap : undefined}
              normalMap={genericWallMaps ? genericWallNormalMap : undefined}
              normalScale={new THREE.Vector2(0.48, 0.48)}
              roughnessMap={genericWallMaps ? genericWallRoughnessMap : undefined}
              roughness={0.98}
            />
          </mesh>
          <mesh position={[0, bounds[1] - wallThickness / 2, 0]} receiveShadow>
            <boxGeometry args={[bounds[0], wallThickness, bounds[2]]} />
            <meshStandardMaterial
              color={presentation.architecture.plasterWalls || usesEstatePaneling ? "#ddd3c0" : presentation.palette.wall}
              map={presentation.architecture.plasterWalls || usesEstatePaneling ? roomTextures.ceilingColor : undefined}
              normalMap={presentation.architecture.plasterWalls || usesEstatePaneling ? roomTextures.ceilingNormal : undefined}
              normalScale={new THREE.Vector2(0.28, 0.28)}
              roughnessMap={presentation.architecture.plasterWalls || usesEstatePaneling ? roomTextures.ceilingArm : undefined}
              roughness={0.98}
              side={THREE.DoubleSide}
            />
          </mesh>
        </>
      )}
      {usesGenericKit && (
        <SegmentedWallTrim
          layout={layout}
          dressingInstances={dressingInstances}
          walls={overview ? ["north", "west"] : ["north", "south", "west", "east"]}
          color={presentation.palette.timber}
        />
      )}
      {usesGenericKit && presentation.location.architectureTags.includes("estate-paneling") && (
        <HistoricalInteriorDetails
          bounds={bounds}
          presentation={presentation}
          overview={overview}
          layout={layout}
          dressingInstances={dressingInstances}
        />
      )}
      {presentation.architecture.industrialShell && (
        <IndustrialInteriorKit bounds={bounds} presentation={presentation} />
      )}
      <Suspense fallback={null}>
        <UniversalNarrativeEnvironmentKit bounds={bounds} presentation={presentation} />
      </Suspense>
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
                  map={roomTextures.stoneColor}
                  normalMap={roomTextures.stoneNormal}
                  normalScale={new THREE.Vector2(0.42, 0.42)}
                  roughnessMap={roomTextures.stoneArm}
                  roughness={0.98}
                />
              </mesh>
            );
          })}
          <SegmentedWallTrim
            layout={layout}
            dressingInstances={dressingInstances}
            walls={["west"]}
            color="#263534"
            height={0.32}
            depth={WALL_COMPOSITION.archiveTrimDepth}
            centerInset={WALL_COMPOSITION.archiveTrimCenterInset}
          />
          {archiveShelfCenters.map((center, shelfIndex) => (
            <group
              key={`archive-shelf-${shelfIndex}`}
              position={[center, 1.92, -bounds[2] / 2 + 0.31]}
              scale={[2.28 + (shelfIndex % 2) * 0.08, 3.84, 0.68]}
            >
              <Suspense
                fallback={(
                  <RoundedBox args={[1, 1, 1]} radius={0.025} smoothness={2} castShadow receiveShadow>
                    <meshStandardMaterial color="#493528" map={roomTextures.floorColor} roughness={0.92} />
                  </RoundedBox>
                )}
              >
                <LoadedModel url="/models/optimized/polyhaven/wooden_bookshelf_worn/wooden_bookshelf_worn_lod1.glb" tint="#704a32" />
                <BookcaseContents />
              </Suspense>
              <RoundedBox args={[0.22, 0.035, 0.025]} radius={0.008} smoothness={2} position={[0, -0.54, 0.53]} castShadow>
                <meshStandardMaterial color="#b1884c" roughness={0.42} metalness={0.58} />
              </RoundedBox>
            </group>
          ))}
          {sideStuds.map((z, index) => (
            <mesh
              key={`archive-pier-${index}`}
              position={[-bounds[0] / 2 + 0.07, bounds[1] / 2, z]}
              receiveShadow
            >
              <boxGeometry args={[0.2, bounds[1], 0.28]} />
              <meshStandardMaterial color="#5d493a" map={roomTextures.floorColor} roughness={0.94} />
            </mesh>
          ))}
          <ArchiveGalleryDetails bounds={bounds} overview={overview} roomTextures={roomTextures} />
        </>
      ) : usesConservatoryKit ? (
        <ConservatoryKit bounds={bounds} presentation={presentation} overview={overview} />
      ) : usesWoodlandKit ? (
        <WoodlandKit bounds={bounds} presentation={presentation} renderQuality={renderQuality} />
      ) : usesLandscapeKit && landscapeFamily ? (
        <Suspense fallback={null}>
          <UniversalLandscapeKit bounds={bounds} family={landscapeFamily} presentation={presentation} />
        </Suspense>
      ) : usesUrbanKit ? (
        (() => {
          const canal = layout.items.find((item) => item.asset.proceduralModel === "canal");
          return (
            <UrbanStreetKit
              bounds={bounds}
              presentation={presentation}
              hasCanal={Boolean(canal)}
              canalWidth={canal?.dimensions[0]}
            />
          );
        })()
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
  portalItemOverride,
  portalDestination,
  portalSourceEntityId,
  portalIsReturn,
  onLocationRequest,
}: {
  layout: WorldLayout;
  portalItemOverride?: LayoutItem;
  portalDestination?: Location;
  portalSourceEntityId?: string;
  portalIsReturn?: boolean;
  onLocationRequest?: (locationId: string) => void;
}) {
  const litItems = layout.items.filter((item) => item.entity.state?.lit === true);
  const portalItem = layout.items.find((item) =>
    isPortalSourceEntity(item.entity.id, portalSourceEntityId)
  ) ?? portalItemOverride;

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
                {portalIsReturn ? "Return to" : "Enter"} {portalDestination.name}
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

function oppositeWall(wall: RuntimeWall): RuntimeWall {
  if (wall === "north") return "south";
  if (wall === "south") return "north";
  if (wall === "east") return "west";
  return "east";
}

/**
 * Builds the destination-side face of one factual doorway. The cloned render
 * item keeps the canonical entity ID and is never persisted into world state.
 */
function createReturnPortalItem(
  snapshot: WorldSnapshot,
  layout: WorldLayout,
  presentation: ScenePresentation,
  registry: AssetRegistry,
): LayoutItem | undefined {
  if (!presentation.portalIsReturn || !presentation.portalSourceEntityId) return undefined;
  if (layout.items.some((item) => isPortalItem(item))) return undefined;

  const sourceEntity = snapshot.entities.find(
    (entity) => entity.id === presentation.portalSourceEntityId,
  );
  if (!sourceEntity) return undefined;
  const sourceWall = snapshot.relations.find(
    (relation) => relation.subjectId === sourceEntity.id && relation.predicate === "against_wall",
  )?.metadata?.wall ?? "east";
  const wall = oppositeWall(sourceWall);
  const asset = resolveAsset(sourceEntity, registry);
  const dimensions = sourceEntity.dimensions ?? asset.dimensions;
  const bounds = layout.location.bounds ?? [12, 4.5, 10];
  const halfDepth = dimensions[2] / 2;
  const position: Vector3Tuple = wall === "north"
    ? [0, dimensions[1] / 2, -bounds[2] / 2 + halfDepth]
    : wall === "south"
      ? [0, dimensions[1] / 2, bounds[2] / 2 - halfDepth]
      : wall === "west"
        ? [-bounds[0] / 2 + halfDepth, dimensions[1] / 2, 0]
        : [bounds[0] / 2 - halfDepth, dimensions[1] / 2, 0];
  const rotation: Vector3Tuple = [
    0,
    wall === "north" ? 0 : wall === "south" ? Math.PI : wall === "west" ? Math.PI / 2 : -Math.PI / 2,
    0,
  ];

  return {
    entity: { ...sourceEntity, locationId: layout.location.id },
    asset,
    position,
    rotation,
    scale: [1, 1, 1],
    dimensions,
  };
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
  returnPortalItem,
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
  returnPortalItem?: LayoutItem;
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
  // Only an explicitly requested estate receives the authored Ashwood set.
  // Generic historical interiors use the reusable, collision-aware resolver.
  const usesEstateFurniture = presentation.location.dressingTags.includes("estate-furnishings");
  const visibleDressingInstances = usesEstateFurniture
    ? dressingInstances.filter(
        (instance) => instance.sourceTag !== "estate-furnishings"
          && instance.sourceTag !== "period-interior",
      )
    : dressingInstances;
  const postProcessingSafe = !presentation.architecture.industrialShell
    && !(["subterranean", "aquatic", "volcanic"] as const).includes(
      presentation.semanticProfile.domain as "subterranean" | "aquatic" | "volcanic",
    );
  const visibleLayoutItems = layout.items.filter(
    (item) => item.entity.state?.presentationOccluded !== true,
  );

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
      {presentation.atmosphere.coolWindowLight && !usesEstateFurniture && (
        <>
          <rectAreaLight
            color="#b9dce3"
            position={[
              bounds[0] * (isGlasshouse ? 0.22 : -0.31),
              bounds[1] * (isGlasshouse ? 0.72 : 0.61),
              -bounds[2] / 2 + 0.28,
            ]}
            intensity={isGlasshouse ? 4.2 : 1.9}
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
            intensity={isGlasshouse ? 2.8 : 0.92}
            distance={isGlasshouse ? 12 : 7.5}
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
        dressingInstances={visibleDressingInstances}
        onGroundNavigate={(target) => onCameraCommand("travel", target)}
        overview={cameraView === "overview"}
        renderQuality={renderQuality}
      />
      {!usesGhibliWoodland && <DressingAssets instances={visibleDressingInstances} />}
      {usesEstateFurniture && (
        <EstateFurnitureComposition bounds={bounds} overview={cameraView === "overview"} />
      )}
      {presentation.atmosphere.dust && (
        <DustMotes bounds={bounds} color={isGlasshouse ? "#b6e4dc" : "#f1d5ad"} />
      )}
      {presentation.atmosphere.rain && atmosphereProfile.openAir && <RainStreaks bounds={bounds} />}
      {presentation.atmosphere.groundMist && cameraView !== "overview" && (
        <GroundMist bounds={bounds} color={presentation.palette.fog} />
      )}
      <StoryEffects
        layout={layout}
        portalItemOverride={returnPortalItem}
        portalDestination={portalDestination}
        portalSourceEntityId={presentation.portalSourceEntityId}
        portalIsReturn={presentation.portalIsReturn}
        onLocationRequest={onLocationRequest}
      />
      {returnPortalItem && (
        <WorldEntity
          item={returnPortalItem}
          selected={selectedEntityId === returnPortalItem.entity.id}
          change={undefined}
          onSelect={onEntitySelect
            ? (event) => {
                event.stopPropagation();
                onEntitySelect(returnPortalItem.entity.id);
              }
            : undefined}
          onActivate={portalDestination && onLocationRequest
            ? (event) => {
                event.stopPropagation();
                onLocationRequest(portalDestination.id);
              }
            : undefined}
        />
      )}
      {visibleLayoutItems.map((item) => (
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
            isPortalSourceEntity(item.entity.id, presentation.portalSourceEntityId)
              && portalDestination
              && onLocationRequest
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
      {renderQuality !== "low" && !usesGhibliWoodland && !usesEstateFurniture && postProcessingSafe && (
        <ModelErrorBoundary key={`post-processing-${renderQuality}`} fallback={null}>
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
        </ModelErrorBoundary>
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
  resetToken,
  visualPlan,
  sceneRecipe,
  selectedEntityId,
  onEntitySelect,
  onRuntimeError,
  onSceneReady,
  renderMode = "continuous",
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
  const { active: assetsLoading, loaded: assetsLoaded, total: assetTotal } = useProgress();
  const reportedReadyKey = useRef("");
  const sceneReadyCallback = useRef(onSceneReady);
  const readinessWindow = useRef({
    key: "",
    startedAt: 0,
    lastProgressAt: 0,
    loaded: -1,
    total: -1,
  });
  const [webGlContextLost, setWebGlContextLost] = useState(false);
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

  const recoverLostWebGlContext = useCallback(() => {
    setRenderQuality("low");
    setWebGlContextLost(true);
  }, []);

  const acknowledgeRestoredWebGlContext = useCallback(() => {
    setWebGlContextLost(false);
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
  }, [resetToken, snapshot.storyId, snapshot.version]);

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
    // Prop changes reach render before the state-sync effect. During that one
    // frame, never compile a new story's plan against the previous runtime.
    if (!visualPlan || visualPlan.storyId !== runtime.snapshot.storyId) {
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
  const returnPortalItem = useMemo(
    () => runtime && presentation
      ? createReturnPortalItem(runtime.snapshot, runtime.layout, presentation, assetRegistry)
      : undefined,
    [assetRegistry, presentation, runtime],
  );
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
  const denseEstateScene = Boolean(
    presentation?.location.dressingTags.includes("estate-furnishings")
      || presentation?.location.dressingTags.includes("period-interior"),
  );
  const effectiveRenderQuality: RenderQuality = denseEstateScene && renderQuality === "high"
    ? "balanced"
    : renderQuality;
  const qualityProfile = renderQualityProfiles[effectiveRenderQuality];
  const readinessKey = runtime
    ? `${runtime.snapshot.storyId}:${runtime.snapshot.version}:${runtime.layout.location.id}`
    : "";

  useEffect(() => {
    sceneReadyCallback.current = onSceneReady;
  }, [onSceneReady]);

  useEffect(() => {
    const now = performance.now();
    if (readinessWindow.current.key !== readinessKey) {
      readinessWindow.current = {
        key: readinessKey,
        startedAt: now,
        lastProgressAt: now,
        loaded: assetsLoaded,
        total: assetTotal,
      };
    } else if (
      readinessWindow.current.loaded !== assetsLoaded
      || readinessWindow.current.total !== assetTotal
      || assetsLoading
    ) {
      readinessWindow.current.lastProgressAt = now;
      readinessWindow.current.loaded = assetsLoaded;
      readinessWindow.current.total = assetTotal;
    }

    if (
      !readinessKey ||
      !runtime ||
      !presentation ||
      webGlContextLost ||
      assetsLoading ||
      assetsLoaded < assetTotal ||
      reportedReadyKey.current === readinessKey
    ) return;

    // LoadingManager can briefly report an empty queue before Suspense mounts
    // its first GLTF request. Require both a real mount window and a quiet
    // progress window, then present two rendered frames. This is stabilization,
    // not a simulated product delay.
    const mountedFor = now - readinessWindow.current.startedAt;
    const quietFor = now - readinessWindow.current.lastProgressAt;
    const waitFor = Math.max(0, 1400 - mountedFor, 650 - quietFor);
    let settleTimer = 0;
    let frameOne = 0;
    let frameTwo = 0;
    settleTimer = window.setTimeout(() => {
      frameOne = requestAnimationFrame(() => {
        frameTwo = requestAnimationFrame(() => {
          if (readinessWindow.current.key !== readinessKey) return;
          reportedReadyKey.current = readinessKey;
          sceneReadyCallback.current?.();
        });
      });
    }, waitFor);
    return () => {
      window.clearTimeout(settleTimer);
      cancelAnimationFrame(frameOne);
      cancelAnimationFrame(frameTwo);
    };
  }, [assetTotal, assetsLoaded, assetsLoading, presentation, readinessKey, runtime, webGlContextLost]);

  return (
    <div
      ref={viewerElement}
      className={["world-viewer", className].filter(Boolean).join(" ")}
      data-runtime-status={viewer.error ? "error" : assetsLoading ? "loading" : "ready"}
      data-story-id={runtime?.snapshot.storyId ?? "invalid"}
      data-world-version={runtime?.snapshot.version ?? "invalid"}
      data-location-id={runtime?.layout.location.id ?? "invalid"}
      data-navigation-mode={walkMode ? "walk" : "map"}
      data-visible-relations={relationEdges.length}
      data-open-conflicts={openConflicts.length}
      data-render-quality={effectiveRenderQuality}
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
          frameloop={renderMode === "on-demand" ? "demand" : "always"}
          shadows={qualityProfile.shadows}
          dpr={qualityProfile.dpr}
          gl={{
            antialias: true,
            powerPreference: "high-performance",
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.08,
          }}
          camera={{ position: [8, 7, 9], fov: 48, near: 0.1, far: 100 }}
          style={{ touchAction: "none" }}
          onPointerMissed={() => onEntitySelect?.(null)}
        >
          <WebGlContextGuard
            onContextLost={recoverLostWebGlContext}
            onContextRestored={acknowledgeRestoredWebGlContext}
          />
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
            returnPortalItem={returnPortalItem}
            onLocationRequest={onLocationRequest}
            cameraView={cameraView}
            walkMode={walkMode}
            renderQuality={effectiveRenderQuality}
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
      {webGlContextLost && (
        <div className="world-webgl-recovery" role="status">
          Restoring the 3D renderer...
        </div>
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
