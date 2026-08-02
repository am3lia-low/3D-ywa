import { Clone, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as THREE from "three";
import type { ScenePatch, WorldSnapshot } from "../contracts/world";
import {
  defaultAssetRegistry,
  type AssetDefinition,
  type AssetRegistry,
} from "../runtime/assetRegistry";
import type { LayoutItem, WorldLayout } from "../runtime/layoutEngine";
import {
  advanceSpatialRuntime,
  clearSpatialRuntimeExits,
  createSpatialRuntime,
} from "../runtime/spatialRuntime";

export interface WorldViewerProps {
  snapshot: WorldSnapshot;
  patch?: ScenePatch | null;
  selectedEntityId?: string | null;
  onEntitySelect?: (entityId: string | null) => void;
  assetRegistry?: AssetRegistry;
  className?: string;
}

type ChangeKind = "added" | "moved" | "changed" | "removed" | undefined;

function changeMapFromPatch(patch?: ScenePatch | null): ReadonlyMap<string, ChangeKind> {
  const result = new Map<string, ChangeKind>();
  for (const operation of patch?.operations ?? []) {
    if (operation.op === "add_entity") result.set(operation.entity.id, "added");
    if (operation.op === "move_entity") result.set(operation.entityId, "moved");
    if (operation.op === "update_entity") result.set(operation.entityId, "changed");
    if (operation.op === "remove_entity") result.set(operation.entityId, "removed");
  }
  return result;
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

function Room({ layout }: { layout: WorldLayout }) {
  const bounds = layout.location.bounds ?? [12, 4.5, 10];
  const environment = layout.location.environment;
  const wallThickness = 0.12;

  return (
    <group>
      <mesh position={[0, -0.06, 0]} receiveShadow>
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

function WorldScene({
  layout,
  exitingItems,
  selectedEntityId,
  changes,
  onEntitySelect,
}: {
  layout: WorldLayout;
  exitingItems: readonly LayoutItem[];
  selectedEntityId?: string | null;
  changes: ReadonlyMap<string, ChangeKind>;
  onEntitySelect?: (entityId: string | null) => void;
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
      <Room layout={layout} />
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
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={24}
        maxPolarAngle={Math.PI / 2.02}
        target={[0, 0.9, 0]}
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
  selectedEntityId,
  onEntitySelect,
  assetRegistry = defaultAssetRegistry,
  className,
}: WorldViewerProps) {
  const [runtime, setRuntime] = useState(() => createSpatialRuntime(snapshot, assetRegistry));
  const appliedPatch = useRef<string | null>(null);

  useEffect(() => {
    setRuntime(createSpatialRuntime(snapshot, assetRegistry));
    appliedPatch.current = null;
  }, [snapshot.storyId, snapshot.version, assetRegistry]);

  useEffect(() => {
    if (!patch) return;
    const patchKey = `${patch.fromVersion}:${patch.toVersion}`;
    if (appliedPatch.current === patchKey) return;
    setRuntime((current) => {
      if (current.snapshot.version !== patch.fromVersion) return current;
      appliedPatch.current = patchKey;
      return advanceSpatialRuntime(current, patch, assetRegistry);
    });
  }, [patch, assetRegistry]);

  useEffect(() => {
    if (runtime.exitingItems.length === 0) return;
    const version = runtime.snapshot.version;
    const timeout = window.setTimeout(() => {
      setRuntime((current) =>
        current.snapshot.version === version ? clearSpatialRuntimeExits(current) : current,
      );
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [runtime.exitingItems.length, runtime.snapshot.version]);

  const changes = useMemo(() => changeMapFromPatch(patch), [patch]);

  return (
    <div
      className={className}
      data-story-id={runtime.snapshot.storyId}
      data-world-version={runtime.snapshot.version}
      style={{ width: "100%", height: "100%", minHeight: 360 }}
    >
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
        />
      </Canvas>
    </div>
  );
}
