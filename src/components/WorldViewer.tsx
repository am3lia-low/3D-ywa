import { OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ScenePatch, WorldSnapshot } from "../contracts/world";
import {
  defaultAssetRegistry,
  type AssetDefinition,
  type AssetRegistry,
} from "../runtime/assetRegistry";
import { applyScenePatch } from "../runtime/applyScenePatch";
import { createWorldLayout, type LayoutItem } from "../runtime/layoutEngine";

export interface WorldViewerProps {
  snapshot: WorldSnapshot;
  patch?: ScenePatch | null;
  selectedEntityId?: string | null;
  onEntitySelect?: (entityId: string | null) => void;
  assetRegistry?: AssetRegistry;
  className?: string;
}

type ChangeKind = "added" | "moved" | "changed" | undefined;

function changeMapFromPatch(patch?: ScenePatch | null): ReadonlyMap<string, ChangeKind> {
  const result = new Map<string, ChangeKind>();
  for (const operation of patch?.operations ?? []) {
    if (operation.op === "add_entity") result.set(operation.entity.id, "added");
    if (operation.op === "move_entity") result.set(operation.entityId, "moved");
    if (operation.op === "update_entity") result.set(operation.entityId, "changed");
  }
  return result;
}

function PrimitiveAsset({ asset }: { asset: AssetDefinition }) {
  if (asset.geometry === "sphere") return <sphereGeometry args={[0.5, 24, 16]} />;
  if (asset.geometry === "cylinder") return <cylinderGeometry args={[0.5, 0.5, 1, 20]} />;
  return <boxGeometry args={[1, 1, 1]} />;
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
  onSelect: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const initialPosition = useRef<THREE.Vector3>(null);
  initialPosition.current ??= new THREE.Vector3(...item.position);
  const targetPosition = useMemo(() => new THREE.Vector3(...item.position), [item.position]);
  const targetScale = useMemo(
    () =>
      new THREE.Vector3(
        item.dimensions[0] * item.scale[0],
        item.dimensions[1] * item.scale[1],
        item.dimensions[2] * item.scale[2],
      ),
    [item.dimensions, item.scale],
  );
  const initialScale = change === "added" ? 0.05 : 1;

  useEffect(() => {
    if (!group.current) return;
    if (change === "added") group.current.scale.setScalar(0.05);
  }, [change, item.entity.id]);

  useFrame((_, delta) => {
    if (!group.current) return;
    const alpha = 1 - Math.exp(-delta * 8);
    group.current.position.lerp(targetPosition, alpha);
    group.current.scale.lerp(targetScale, alpha);
  });

  const highlighted = selected || change !== undefined;
  const emissive = selected ? "#54e7d5" : change === "added" ? "#79ef9b" : "#ffb84d";

  return (
    <group
      ref={group}
      name={item.entity.id}
      position={initialPosition.current}
      rotation={item.rotation}
      scale={initialScale}
      onPointerDown={onSelect}
      userData={{ entityId: item.entity.id, assetKey: item.asset.key }}
    >
      <mesh castShadow receiveShadow>
        <PrimitiveAsset asset={item.asset} />
        <meshStandardMaterial
          color={item.asset.color}
          emissive={highlighted ? emissive : "#000000"}
          emissiveIntensity={highlighted ? 0.38 : 0}
          roughness={item.asset.roughness ?? 0.8}
          metalness={item.asset.metalness ?? 0}
        />
      </mesh>
      {selected && (
        <mesh scale={[1.06, 1.06, 1.06]}>
          <PrimitiveAsset asset={item.asset} />
          <meshBasicMaterial color="#66f2e0" wireframe transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

function Room({ layout }: { layout: ReturnType<typeof createWorldLayout> }) {
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
  snapshot,
  selectedEntityId,
  changes,
  registry,
  onEntitySelect,
}: {
  snapshot: WorldSnapshot;
  selectedEntityId?: string | null;
  changes: ReadonlyMap<string, ChangeKind>;
  registry: AssetRegistry;
  onEntitySelect?: (entityId: string | null) => void;
}) {
  const layout = useMemo(() => createWorldLayout(snapshot, registry), [snapshot, registry]);
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
  const [scene, setScene] = useState(snapshot);
  const appliedPatch = useRef<string | null>(null);

  useEffect(() => {
    setScene(snapshot);
    appliedPatch.current = null;
  }, [snapshot.storyId, snapshot.version]);

  useEffect(() => {
    if (!patch) return;
    const patchKey = `${patch.fromVersion}:${patch.toVersion}`;
    if (appliedPatch.current === patchKey) return;
    setScene((current) => {
      if (current.version !== patch.fromVersion) return current;
      appliedPatch.current = patchKey;
      return applyScenePatch(current, patch);
    });
  }, [patch]);

  const changes = useMemo(() => changeMapFromPatch(patch), [patch]);

  return (
    <div
      className={className}
      data-story-id={scene.storyId}
      data-world-version={scene.version}
      style={{ width: "100%", height: "100%", minHeight: 360 }}
    >
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [8, 7, 9], fov: 48, near: 0.1, far: 100 }}
        onPointerMissed={() => onEntitySelect?.(null)}
      >
        <WorldScene
          snapshot={scene}
          selectedEntityId={selectedEntityId}
          changes={changes}
          registry={assetRegistry}
          onEntitySelect={onEntitySelect}
        />
      </Canvas>
    </div>
  );
}
