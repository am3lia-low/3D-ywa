import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Clone, RoundedBox, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { Vector3Tuple } from "../contracts/world";
import type { SceneEnvironmentFamily } from "../runtime/sceneAtmosphere";
import type { ScenePresentation } from "../runtime/sceneCompiler";
import { URBAN_HUMAN_SCALE } from "../runtime/urbanComposition";

type LandscapeFamily = Extract<SceneEnvironmentFamily, "alpine" | "arid" | "coastal" | "grassland">;

interface PbrSurfaceSet {
  color: THREE.Texture;
  normal: THREE.Texture;
  arm: THREE.Texture;
}

function usePbrSurfaceSet(slug: string, repeat: [number, number]): PbrSurfaceSet {
  const surface = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const load = (suffix: "diff" | "nor_gl" | "arm", color = false) => {
      const texture = loader.load(`/textures/polyhaven/${slug}_${suffix}_1k.jpg`);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(...repeat);
      texture.anisotropy = 8;
      if (color) texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };
    return {
      color: load("diff", true),
      normal: load("nor_gl"),
      arm: load("arm"),
    };
  }, [repeat[0], repeat[1], slug]);
  useEffect(() => () => Object.values(surface).forEach((texture) => texture.dispose()), [surface]);
  return surface;
}

function NormalizedSceneryModel({
  url,
  position,
  rotation = [0, 0, 0],
  dimensions,
}: {
  url: string;
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
  dimensions: Vector3Tuple;
}) {
  const model = useGLTF(url);
  const normalization = useMemo(() => {
    model.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model.scene);
    const center = bounds.getCenter(new THREE.Vector3()).multiplyScalar(-1);
    const size = bounds.getSize(new THREE.Vector3());
    return {
      offset: center,
      scale: new THREE.Vector3(
        size.x > 0 ? 1 / size.x : 1,
        size.y > 0 ? 1 / size.y : 1,
        size.z > 0 ? 1 / size.z : 1,
      ),
    };
  }, [model.scene]);
  return (
    <group position={position} rotation={rotation} scale={dimensions}>
      <group scale={normalization.scale}>
        <Clone object={model.scene} position={normalization.offset} castShadow receiveShadow />
      </group>
    </group>
  );
}

const LANDSCAPE_COLORS: Readonly<Record<LandscapeFamily, {
  ground: string;
  accents: readonly string[];
  path: string;
  horizon: string;
}>> = {
  alpine: { ground: "#d8e3e2", accents: ["#f3f6f3", "#96a9a8", "#6d807c"], path: "#81766a", horizon: "#70858b" },
  arid: { ground: "#c9955d", accents: ["#e4bb7d", "#9b673f", "#72513b"], path: "#a36d45", horizon: "#b77c4d" },
  coastal: { ground: "#8d8964", accents: ["#c6b77d", "#506f62", "#655b45"], path: "#b39b72", horizon: "#456e69" },
  grassland: { ground: "#4f6842", accents: ["#78905b", "#354d35", "#9a8754"], path: "#8c7048", horizon: "#42633d" },
};

function SnowField({ bounds }: { bounds: Vector3Tuple }) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const values = new Float32Array(210 * 3);
    for (let index = 0; index < 210; index += 1) {
      values[index * 3] = Math.sin(index * 19.37) * bounds[0] * 0.55;
      values[index * 3 + 1] = 0.4 + ((index * 37) % 100) / 100 * bounds[1] * 1.2;
      values[index * 3 + 2] = Math.cos(index * 11.17) * bounds[2] * 0.55;
    }
    return values;
  }, [bounds]);
  useFrame((_, delta) => {
    const attribute = points.current?.geometry.getAttribute("position");
    if (!(attribute instanceof THREE.BufferAttribute)) return;
    for (let index = 0; index < attribute.count; index += 1) {
      const next = attribute.getY(index) - delta * (0.45 + (index % 7) * 0.035);
      attribute.setY(index, next < 0.15 ? bounds[1] * 1.18 : next);
    }
    attribute.needsUpdate = true;
  });
  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#f4fbff" size={0.055} transparent opacity={0.78} depthWrite={false} />
    </points>
  );
}

function useNaturalRockGeometries(seeds: readonly number[]) {
  const geometries = useMemo(() => seeds.map((seed) => {
    const geometry = new THREE.IcosahedronGeometry(1, 3);
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    const direction = new THREE.Vector3();
    for (let index = 0; index < positions.count; index += 1) {
      direction.fromBufferAttribute(positions, index);
      const radius = direction.length();
      direction.normalize();
      const broadVariation = Math.sin(direction.x * 4.3 + seed)
        * Math.cos(direction.z * 3.7 - seed * 0.63) * 0.13;
      const fineVariation = Math.sin(
        (direction.x + direction.y * 1.7 + direction.z * 0.8) * 11.2 + seed * 2.1,
      ) * 0.045;
      direction.multiplyScalar(radius * (1 + broadVariation + fineVariation));
      positions.setXYZ(index, direction.x, direction.y, direction.z);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }), [seeds]);
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);
  return geometries;
}

const ROCK_SEEDS = [0.7, 2.35, 4.8, 7.15] as const;

function WindingTrail({ bounds, color, surface }: { bounds: Vector3Tuple; color: string; surface: PbrSurfaceSet }) {
  const shape = useMemo(() => {
    const result = new THREE.Shape();
    const left: Array<[number, number]> = [];
    const right: Array<[number, number]> = [];
    for (let index = 0; index <= 20; index += 1) {
      const progress = index / 20;
      const z = -bounds[2] / 2 + progress * bounds[2];
      const center = Math.sin(progress * Math.PI * 2.1 - 0.5) * bounds[0] * 0.055;
      const width = Math.max(1.6, bounds[0] * 0.075) + Math.sin(index * 0.8) * 0.2;
      left.push([center - width, z]);
      right.push([center + width, z]);
    }
    result.moveTo(...left[0]!);
    left.slice(1).forEach((point) => result.lineTo(...point));
    right.reverse().forEach((point) => result.lineTo(...point));
    result.closePath();
    return result;
  }, [bounds]);
  return (
    <mesh position={[0, 0.075, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <shapeGeometry args={[shape, 24]} />
      <meshStandardMaterial color={color} map={surface.color} normalMap={surface.normal} normalScale={new THREE.Vector2(0.38, 0.38)} roughnessMap={surface.arm} roughness={0.97} />
    </mesh>
  );
}

function AlpineHorizon({ bounds, surface }: { bounds: Vector3Tuple; surface: PbrSurfaceSet }) {
  return (
    <group position={[0, 0, -bounds[2] * 0.58]}>
      {Array.from({ length: 8 }, (_, index) => {
        const height = 5.5 + (index % 4) * 1.7;
        const x = -bounds[0] * 0.62 + index * (bounds[0] * 0.18);
        return (
          <group key={index} position={[x, height * 0.38 - 0.6, (index % 2) * 2.1]}>
            <mesh castShadow receiveShadow>
              <coneGeometry args={[height * 0.72, height, 5]} />
              <meshStandardMaterial color={index % 2 ? "#82908e" : "#929e9a"} map={surface.color} normalMap={surface.normal} normalScale={new THREE.Vector2(0.46, 0.46)} roughnessMap={surface.arm} roughness={0.96} />
            </mesh>
            <mesh position={[0, height * 0.27, 0]}>
              <coneGeometry args={[height * 0.34, height * 0.48, 5]} />
              <meshStandardMaterial color="#e7efed" roughness={0.92} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function RollingHorizon({ bounds, family, color, surface }: { bounds: Vector3Tuple; family: LandscapeFamily; color: string; surface: PbrSurfaceSet }) {
  const count = family === "arid" ? 16 : 13;
  return (
    <group>
      {Array.from({ length: count }, (_, index) => {
        const side = index % 2 ? 1 : -1;
        const along = ((index * 13) % count) / Math.max(1, count - 1);
        const x = family === "coastal" ? -bounds[0] * (0.35 + (index % 4) * 0.11) : side * bounds[0] * (0.5 + (index % 3) * 0.08);
        const z = -bounds[2] * 0.48 + along * bounds[2] * 0.96;
        return (
          <mesh
            key={index}
            position={[x, family === "arid" ? -0.7 : -1.05, z]}
            scale={[family === "arid" ? 5.8 : 4.7, family === "arid" ? 1.25 : 1.5, 4.8]}
            receiveShadow
          >
            <sphereGeometry args={[1, 20, 10]} />
            <meshStandardMaterial color={color} map={surface.color} normalMap={surface.normal} normalScale={new THREE.Vector2(0.42, 0.42)} roughnessMap={surface.arm} roughness={1} />
          </mesh>
        );
      })}
    </group>
  );
}

function AlpineDressing({ bounds }: { bounds: Vector3Tuple }) {
  const pineUrls = [
    "/models/optimized/quaternius/stylized-nature/pine_1.glb",
    "/models/optimized/quaternius/stylized-nature/pine_3.glb",
    "/models/optimized/quaternius/stylized-nature/pine_5.glb",
  ];
  return (
    <group>
      {[-1, 1].flatMap((side) => Array.from({ length: 6 }, (_, index) => {
        const height = 3.2 + (index % 3) * 0.72;
        return (
          <NormalizedSceneryModel
            key={`${side}:${index}`}
            url={pineUrls[(index + (side > 0 ? 1 : 0)) % pineUrls.length]!}
            position={[side * bounds[0] * (0.28 + (index % 2) * 0.09), height / 2, -bounds[2] * 0.38 + index * bounds[2] * 0.15]}
            rotation={[0, index * 0.71, 0]}
            dimensions={[1.85 + (index % 2) * 0.32, height, 1.85 + (index % 2) * 0.32]}
          />
        );
      }))}
    </group>
  );
}

function AridDressing({ bounds, surface }: { bounds: Vector3Tuple; surface: PbrSurfaceSet }) {
  const rockGeometries = useNaturalRockGeometries(ROCK_SEEDS);
  return (
    <group>
      {Array.from({ length: 11 }, (_, index) => {
        const side = index % 2 ? 1 : -1;
        const height = 1.25 + (index % 4) * 0.72;
        return (
          <mesh key={index} geometry={rockGeometries[index % rockGeometries.length]} position={[side * bounds[0] * (0.3 + (index % 3) * 0.06), height * 0.33 - 0.02, -bounds[2] * 0.42 + index * bounds[2] * 0.085]} rotation={[(index % 3 - 1) * 0.12, index * 0.47, (index % 2 ? 1 : -1) * 0.08]} scale={[1.05 + (index % 3) * 0.34, height * 0.42, 0.86 + (index % 2) * 0.28]} castShadow receiveShadow>
            <meshStandardMaterial color={index % 2 ? "#b7744b" : "#ca8959"} map={surface.color} normalMap={surface.normal} normalScale={new THREE.Vector2(0.42, 0.42)} roughnessMap={surface.arm} roughness={0.98} />
          </mesh>
        );
      })}
    </group>
  );
}

function CoastalDressing({ bounds, surface }: { bounds: Vector3Tuple; surface: PbrSurfaceSet }) {
  const rockGeometries = useNaturalRockGeometries(ROCK_SEEDS);
  return (
    <group>
      {Array.from({ length: 13 }, (_, index) => {
        const height = 0.62 + (index % 4) * 0.16;
        return <mesh key={index} geometry={rockGeometries[index % rockGeometries.length]} position={[bounds[0] * (0.02 + (index % 3) * 0.055), height * 0.32, -bounds[2] * 0.44 + index * bounds[2] * 0.072]} rotation={[(index % 3 - 1) * 0.1, index * 0.61, (index % 2 ? 1 : -1) * 0.08]} scale={[0.74 + (index % 3) * 0.28, height * 0.48, 0.72 + (index % 2) * 0.22]} castShadow receiveShadow>
          <meshStandardMaterial color={index % 2 ? "#75827b" : "#87928b"} map={surface.color} normalMap={surface.normal} normalScale={new THREE.Vector2(0.44, 0.44)} roughnessMap={surface.arm} roughness={0.98} />
        </mesh>;
      })}
      {[-0.36, -0.18, 0.04, 0.27, 0.42].map((factor, index) => (
        <group key={factor} position={[-bounds[0] * 0.23, 0, bounds[2] * factor]}>
          {[-0.12, 0, 0.12].map((x, blade) => (
            <mesh key={x} position={[x, 0.35 + blade * 0.05, 0]} rotation={[0, blade * 0.7, (blade - 1) * 0.14]}>
              <coneGeometry args={[0.055, 0.72 + blade * 0.1, 5]} />
              <meshStandardMaterial color={index % 2 ? "#6d825c" : "#819064"} roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function GrasslandDressing({ bounds }: { bounds: Vector3Tuple }) {
  return (
    <group>
      {Array.from({ length: 48 }, (_, index) => {
        const side = index % 2 ? 1 : -1;
        const x = side * bounds[0] * (0.18 + ((index * 7) % 19) / 19 * 0.25);
        const z = -bounds[2] * 0.46 + ((index * 13) % 47) / 47 * bounds[2] * 0.92;
        return (
          <group key={index}>
            <NormalizedSceneryModel
              url="/models/optimized/quaternius/stylized-nature/grass_wispy_tall.glb"
              position={[x, 0.42, z]}
              rotation={[0, index * 0.8, 0]}
              dimensions={[0.48 + (index % 3) * 0.12, 0.84 + (index % 4) * 0.09, 0.48 + (index % 2) * 0.1]}
            />
            {index % 6 === 0 && (
              <NormalizedSceneryModel
                url="/models/optimized/quaternius/stylized-nature/flower_3_group.glb"
                position={[x + 0.16, 0.3, z - 0.12]}
                rotation={[0, index * 0.37, 0]}
                dimensions={[0.5, 0.6, 0.5]}
              />
            )}
          </group>
        );
      })}
      <group position={[-bounds[0] * 0.31, 0, 0]}>
        {Array.from({ length: 10 }, (_, index) => (
          <mesh key={index} position={[0, 0.58, -bounds[2] * 0.45 + index * bounds[2] * 0.1]} castShadow>
            <boxGeometry args={[0.12, 1.16, 0.12]} />
            <meshStandardMaterial color="#68513a" roughness={0.94} />
          </mesh>
        ))}
        {[0.42, 0.82].map((y) => (
          <mesh key={y} position={[0, y, 0]} castShadow>
            <boxGeometry args={[0.1, 0.1, bounds[2] * 0.94]} />
            <meshStandardMaterial color="#775d40" roughness={0.94} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function UniversalLandscapeKit({
  bounds,
  family,
  presentation,
}: {
  bounds: Vector3Tuple;
  family: LandscapeFamily;
  presentation: ScenePresentation;
}) {
  const colors = LANDSCAPE_COLORS[family];
  const groundSlug: Record<LandscapeFamily, string> = {
    alpine: "snow_field_aerial",
    arid: "sand_01",
    coastal: "coast_sand_05",
    grassland: "sparse_grass",
  };
  const ground = usePbrSurfaceSet(groundSlug[family], [5.8, 7.4]);
  const trail = usePbrSurfaceSet("rocky_trail", [2.2, 7.5]);
  // Reuse one transformed surface across terrain and horizon. A separate
  // clone for every distance band doubles GPU texture memory during travel.
  const horizon = ground;
  const groundTint: Record<LandscapeFamily, string> = {
    alpine: "#eef3f2",
    arid: "#e4b17c",
    coastal: "#d4c59b",
    grassland: "#9eaf83",
  };
  const showTrail = family !== "coastal" || presentation.architecture.earthTrail;

  return (
    <group>
      <mesh position={[0, 0.015, 0]} receiveShadow>
        <boxGeometry args={[bounds[0], 0.1, bounds[2]]} />
        <meshStandardMaterial color={groundTint[family]} map={ground.color} normalMap={ground.normal} normalScale={new THREE.Vector2(0.54, 0.54)} roughnessMap={ground.arm} roughness={0.98} />
      </mesh>
      <mesh position={[0, -0.08, 0]} receiveShadow>
        <boxGeometry args={[bounds[0] * 4, 0.12, bounds[2] * 4]} />
        <meshStandardMaterial color={colors.horizon} map={ground.color} normalMap={ground.normal} normalScale={new THREE.Vector2(0.32, 0.32)} roughnessMap={ground.arm} roughness={1} />
      </mesh>
      {showTrail && <WindingTrail bounds={bounds} color={colors.path} surface={trail} />}
      {family === "alpine" ? <AlpineHorizon bounds={bounds} surface={horizon} /> : <RollingHorizon bounds={bounds} family={family} color={colors.horizon} surface={horizon} />}
      {family === "coastal" && (
        <>
          <mesh position={[bounds[0] * 0.29, 0.045, 0]} receiveShadow>
            <boxGeometry args={[bounds[0] * 0.42, 0.07, bounds[2] * 1.25]} />
            <meshPhysicalMaterial color="#2e7882" roughness={0.18} metalness={0.08} transparent opacity={0.82} />
          </mesh>
          {Array.from({ length: 9 }, (_, index) => (
            <mesh key={index} position={[bounds[0] * (0.09 + index * 0.025), 0.09, -bounds[2] * 0.42 + index * bounds[2] * 0.105]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.7 + (index % 3) * 0.2, 0.035]} />
              <meshBasicMaterial color="#d5ece8" transparent opacity={0.62} />
            </mesh>
          ))}
        </>
      )}
      {family === "alpine" && <AlpineDressing bounds={bounds} />}
      {family === "arid" && <AridDressing bounds={bounds} surface={horizon} />}
      {family === "coastal" && <CoastalDressing bounds={bounds} surface={horizon} />}
      {family === "grassland" && <GrasslandDressing bounds={bounds} />}
      {family === "alpine" && <SnowField bounds={bounds} />}
    </group>
  );
}

function stableSeed(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function CelestialVista({ bounds, presentation }: { bounds: Vector3Tuple; presentation: ScenePresentation }) {
  const profile = presentation.semanticProfile;
  const stars = useMemo(() => {
    let state = stableSeed(`${presentation.location.locationId}:celestial`);
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const values = new Float32Array(150 * 3);
    for (let index = 0; index < 150; index += 1) {
      values[index * 3] = (random() - 0.5) * bounds[0] * 0.88;
      values[index * 3 + 1] = bounds[1] * (0.2 + random() * 0.68);
      values[index * 3 + 2] = -bounds[2] / 2 + 0.075;
    }
    return values;
  }, [bounds, presentation.location.locationId]);
  const windowWidth = bounds[0] * 0.88;
  const windowHeight = bounds[1] * 0.72;
  const rearZ = -bounds[2] / 2 + 0.082;
  const bodyRadius = Math.min(bounds[0], bounds[1] * 2) * 0.145;

  return (
    <group>
      <mesh position={[0, bounds[1] * 0.52, rearZ]}>
        <planeGeometry args={[windowWidth, windowHeight]} />
        <meshStandardMaterial color={presentation.palette.background} emissive={presentation.palette.background} emissiveIntensity={0.55} roughness={0.42} />
      </mesh>
      <points>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[stars, 3]} /></bufferGeometry>
        <pointsMaterial color="#dff4ff" size={0.055} transparent opacity={0.88} depthWrite={false} />
      </points>
      <mesh position={[bounds[0] * 0.2, bounds[1] * 0.62, rearZ + 0.035]} scale={[1, 1, 0.12]}>
        <sphereGeometry args={[bodyRadius, 40, 24]} />
        <meshStandardMaterial color={profile.fractured ? "#d8d0df" : "#b9cad3"} emissive={presentation.palette.keyLight} emissiveIntensity={0.18} roughness={0.92} />
      </mesh>
      {profile.fractured && [-0.55, -0.18, 0.22, 0.54].map((offset, index) => (
        <mesh key={offset} position={[bounds[0] * 0.2 + offset * bodyRadius, bounds[1] * (0.63 + (index % 2 ? 0.035 : -0.02)), rearZ + 0.05]} rotation={[0, 0, -0.55 + index * 0.31]}>
          <boxGeometry args={[bodyRadius * 0.72, 0.025, 0.012]} />
          <meshBasicMaterial color="#50465f" />
        </mesh>
      ))}
      {[-0.44, 0, 0.44].map((factor) => (
        <mesh key={`window-rib:${factor}`} position={[windowWidth * factor, bounds[1] * 0.52, rearZ + 0.065]} castShadow>
          <boxGeometry args={[0.1, windowHeight + 0.18, 0.14]} />
          <meshStandardMaterial color={presentation.palette.timber} metalness={profile.metallic ? 0.68 : 0.16} roughness={0.48} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={`window-edge:${side}`} position={[side * windowWidth / 2, bounds[1] * 0.52, rearZ + 0.07]}>
          <boxGeometry args={[0.14, windowHeight + 0.25, 0.16]} />
          <meshStandardMaterial color={presentation.palette.timber} metalness={profile.metallic ? 0.68 : 0.12} roughness={0.5} />
        </mesh>
      ))}
      <pointLight position={[bounds[0] * 0.15, bounds[1] * 0.62, -bounds[2] * 0.28]} color={presentation.palette.keyLight} intensity={1.25} distance={Math.max(bounds[0], bounds[2]) * 0.7} />
    </group>
  );
}

function CavernEnvironment({ bounds, presentation }: { bounds: Vector3Tuple; presentation: ScenePresentation }) {
  const profile = presentation.semanticProfile;
  const count = profile.scale === "monumental" ? 26 : 20;
  const rockSurface = usePbrSurfaceSet("rock_ground", [5.5, 7.2]);
  const rockGeometries = useNaturalRockGeometries(ROCK_SEEDS);
  return (
    <group>
      <mesh position={[0, 0.015, 0]} receiveShadow>
        <boxGeometry args={[bounds[0], 0.12, bounds[2]]} />
        <meshStandardMaterial color="#707680" map={rockSurface.color} normalMap={rockSurface.normal} normalScale={new THREE.Vector2(0.62, 0.62)} roughnessMap={rockSurface.arm} roughness={0.98} />
      </mesh>
      {Array.from({ length: count }, (_, index) => {
        const side = index % 2 ? 1 : -1;
        const progress = index / Math.max(1, count - 1);
        const z = -bounds[2] * 0.5 + progress * bounds[2];
        const radius = 1.5 + (index % 5) * 0.34;
        return <mesh key={index} geometry={rockGeometries[index % rockGeometries.length]} position={[side * bounds[0] * (0.43 + (index % 3) * 0.035), radius * 0.48, z]} rotation={[(index % 3 - 1) * 0.18, index * 0.51, (index % 2 ? 1 : -1) * 0.14]} scale={[radius * 1.2, radius * (0.88 + (index % 3) * 0.14), radius]} castShadow receiveShadow>
          <meshStandardMaterial color={index % 2 ? "#77808b" : "#68727f"} map={rockSurface.color} normalMap={rockSurface.normal} normalScale={new THREE.Vector2(0.52, 0.52)} roughnessMap={rockSurface.arm} roughness={0.97} />
        </mesh>;
      })}
      {Array.from({ length: 13 }, (_, index) => (
        <mesh key={`stalactite:${index}`} position={[-bounds[0] * 0.42 + index * bounds[0] * 0.07, bounds[1] - 0.5 - (index % 3) * 0.25, -bounds[2] * (0.2 + (index % 4) * 0.08)]} rotation={[Math.PI, 0, (index % 2 ? 1 : -1) * 0.08]} castShadow>
          <coneGeometry args={[0.22 + (index % 3) * 0.08, 1.1 + (index % 4) * 0.33, 7]} />
          <meshStandardMaterial color="#78808b" map={rockSurface.color} normalMap={rockSurface.normal} normalScale={new THREE.Vector2(0.38, 0.38)} roughnessMap={rockSurface.arm} roughness={0.98} />
        </mesh>
      ))}
      {profile.crystalline && Array.from({ length: 11 }, (_, index) => (
        <mesh key={`crystal:${index}`} position={[(index % 2 ? 1 : -1) * bounds[0] * (0.25 + (index % 3) * 0.055), 0.48, -bounds[2] * 0.4 + index * bounds[2] * 0.078]} rotation={[0, index * 0.8, (index % 3 - 1) * 0.16]} castShadow>
          <coneGeometry args={[0.22, 1.05 + (index % 3) * 0.3, 5]} />
          <meshPhysicalMaterial color={presentation.palette.practical} emissive={presentation.palette.practical} emissiveIntensity={0.18} transmission={0.2} transparent opacity={0.86} roughness={0.22} />
        </mesh>
      ))}
    </group>
  );
}

function VolcanicEnvironment({ bounds, presentation }: { bounds: Vector3Tuple; presentation: ScenePresentation }) {
  const rockSurface = usePbrSurfaceSet("rock_ground", [6.2, 7.8]);
  const cracks = useMemo(() => Array.from({ length: 9 }, (_, index) => {
    const z = -bounds[2] * 0.42 + index * bounds[2] * 0.1;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-bounds[0] * 0.42, 0.105, z),
      new THREE.Vector3(-bounds[0] * 0.12, 0.11, z + (index % 2 ? 0.7 : -0.6)),
      new THREE.Vector3(bounds[0] * 0.17, 0.105, z - 0.35),
      new THREE.Vector3(bounds[0] * 0.43, 0.11, z + (index % 3 - 1) * 0.45),
    ]);
    return new THREE.TubeGeometry(curve, 22, 0.025 + (index % 3) * 0.009, 5, false);
  }), [bounds]);
  useEffect(() => () => cracks.forEach((geometry) => geometry.dispose()), [cracks]);
  return (
    <group>
      <mesh position={[0, 0.025, 0]} receiveShadow><boxGeometry args={[bounds[0] * 1.15, 0.14, bounds[2] * 1.15]} /><meshStandardMaterial color="#41383d" map={rockSurface.color} normalMap={rockSurface.normal} normalScale={new THREE.Vector2(0.65, 0.65)} roughnessMap={rockSurface.arm} roughness={0.94} /></mesh>
      {cracks.map((geometry, index) => <mesh key={index} geometry={geometry}><meshStandardMaterial color={index % 2 ? "#ff7445" : presentation.palette.practical} emissive={index % 2 ? "#d83d1f" : presentation.palette.practical} emissiveIntensity={2.4} roughness={0.42} /></mesh>)}
      {Array.from({ length: 18 }, (_, index) => (
        <mesh key={`basalt:${index}`} position={[(index % 2 ? 1 : -1) * bounds[0] * (0.3 + (index % 4) * 0.045), 0.35 + (index % 4) * 0.09, -bounds[2] * 0.44 + index * bounds[2] * 0.052]} rotation={[index * 0.13, index * 0.49, 0]} scale={[0.7, 0.65 + (index % 3) * 0.2, 0.8]} castShadow receiveShadow>
          <dodecahedronGeometry args={[0.72, 1]} /><meshStandardMaterial color={index % 2 ? "#4c444c" : "#3f3942"} map={rockSurface.color} normalMap={rockSurface.normal} normalScale={new THREE.Vector2(0.34, 0.34)} roughnessMap={rockSurface.arm} roughness={0.98} />
        </mesh>
      ))}
      <pointLight position={[0, 1.2, 0]} color="#ff6b3d" intensity={2.2} distance={Math.max(bounds[0], bounds[2]) * 0.75} />
    </group>
  );
}

function AquaticEnvironment({ bounds, presentation }: { bounds: Vector3Tuple; presentation: ScenePresentation }) {
  const seabed = usePbrSurfaceSet("coast_sand_05", [6.4, 7.2]);
  return (
    <group>
      <mesh position={[0, 0.02, 0]} receiveShadow><boxGeometry args={[bounds[0] * 1.2, 0.12, bounds[2] * 1.2]} /><meshStandardMaterial color="#83a79f" map={seabed.color} normalMap={seabed.normal} normalScale={new THREE.Vector2(0.48, 0.48)} roughnessMap={seabed.arm} roughness={0.82} /></mesh>
      <mesh position={[0, bounds[1] * 0.84, 0]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[bounds[0] * 1.5, bounds[2] * 1.5, 18, 18]} /><meshPhysicalMaterial color={presentation.palette.keyLight} transparent opacity={0.1} transmission={0.45} roughness={0.15} side={THREE.DoubleSide} /></mesh>
      {Array.from({ length: 14 }, (_, index) => {
        const side = index % 2 ? 1 : -1;
        const height = 0.72 + (index % 4) * 0.23;
        const coralColor = [presentation.palette.practical, "#bd6f8e", "#62a9a1", "#d38b68"][index % 4]!;
        return (
          <group key={`coral:${index}`} position={[side * bounds[0] * (0.24 + (index % 4) * 0.048), 0, -bounds[2] * 0.42 + index * bounds[2] * 0.065]} rotation={[0, index * 0.73, 0]}>
            <mesh position={[0, height / 2, 0]} castShadow>
              <cylinderGeometry args={[0.085, 0.14, height, 9]} />
              <meshStandardMaterial color={coralColor} roughness={0.68} />
            </mesh>
            {[-1, 1].flatMap((branchSide) => [0.38, 0.64].map((factor, branch) => {
              const branchLength = height * (0.34 + branch * 0.08);
              const angle = branchSide * (0.62 + branch * 0.08);
              return (
                <group key={`${branchSide}:${factor}`} position={[0, height * factor, 0]} rotation={[0, branch * 1.1, angle]}>
                  <mesh position={[0, branchLength / 2, 0]} castShadow>
                    <cylinderGeometry args={[0.045, 0.075, branchLength, 8]} />
                    <meshStandardMaterial color={coralColor} roughness={0.68} />
                  </mesh>
                  <mesh position={[0, branchLength + 0.025, 0]} scale={[1, 1.25, 1]}>
                    <sphereGeometry args={[0.075, 10, 7]} />
                    <meshStandardMaterial color={coralColor} emissive={coralColor} emissiveIntensity={0.08} roughness={0.62} />
                  </mesh>
                </group>
              );
            }))}
            <mesh position={[0, height + 0.035, 0]} scale={[1, 1.2, 1]}>
              <sphereGeometry args={[0.095, 10, 7]} />
              <meshStandardMaterial color={coralColor} emissive={coralColor} emissiveIntensity={0.08} roughness={0.62} />
            </mesh>
          </group>
        );
      })}
      {Array.from({ length: 36 }, (_, index) => (
        <mesh key={`bubble:${index}`} position={[(Math.sin(index * 9.7) * 0.42) * bounds[0], 0.4 + ((index * 17) % 100) / 100 * bounds[1] * 0.8, Math.cos(index * 6.3) * bounds[2] * 0.4]}>
          <sphereGeometry args={[0.025 + (index % 4) * 0.012, 8, 6]} /><meshPhysicalMaterial color="#d9fbff" transparent opacity={0.45} transmission={0.72} roughness={0.05} />
        </mesh>
      ))}
    </group>
  );
}

function RuinedAccents({ bounds, presentation }: { bounds: Vector3Tuple; presentation: ScenePresentation }) {
  return (
    <group>
      {[-1, 1].flatMap((side) => Array.from({ length: 4 }, (_, index) => {
        const height = bounds[1] * (0.35 + (index % 3) * 0.12);
        return <group key={`${side}:${index}`} position={[side * bounds[0] * 0.36, 0, -bounds[2] * 0.34 + index * bounds[2] * 0.22]} rotation={[0, side * 0.08 * index, 0]}><mesh position={[0, height / 2, 0]} castShadow><cylinderGeometry args={[0.24, 0.31, height, 8]} /><meshStandardMaterial color={presentation.palette.wall} roughness={0.96} /></mesh><mesh position={[0.12 * side, height + 0.05, 0]} rotation={[0, 0, side * 0.16]} castShadow><boxGeometry args={[0.8 + (index % 2) * 0.45, 0.22, 0.5]} /><meshStandardMaterial color={presentation.palette.wall} roughness={0.98} /></mesh></group>;
      }))}
    </group>
  );
}

function PolishedFallbackInterior({ bounds, presentation }: { bounds: Vector3Tuple; presentation: ScenePresentation }) {
  return (
    <group>
      {[-0.34, 0, 0.34].map((factor) => (
        <group key={factor} position={[bounds[0] * factor, bounds[1] * 0.5, -bounds[2] / 2 + 0.11]}>
          <mesh castShadow><boxGeometry args={[0.12, bounds[1] * 0.82, 0.2]} /><meshStandardMaterial color={presentation.palette.timber} metalness={presentation.semanticProfile.metallic ? 0.48 : 0.05} roughness={0.68} /></mesh>
          <mesh position={[0, 0, 0.115]}><planeGeometry args={[Math.max(1.5, bounds[0] * 0.26), bounds[1] * 0.58]} /><meshStandardMaterial color={presentation.palette.wall} roughness={0.94} /></mesh>
        </group>
      ))}
      {[-0.3, 0.3].map((factor) => (
        <group key={`sconce:${factor}`} position={[bounds[0] * factor, bounds[1] * 0.58, -bounds[2] / 2 + 0.27]}>
          <mesh castShadow><cylinderGeometry args={[0.06, 0.09, 0.34, 10]} /><meshStandardMaterial color={presentation.palette.timber} metalness={0.42} roughness={0.5} /></mesh>
          <mesh position={[0, 0.2, 0]}><sphereGeometry args={[0.095, 12, 8]} /><meshStandardMaterial color={presentation.palette.practical} emissive={presentation.palette.practical} emissiveIntensity={1.4} roughness={0.32} /></mesh>
          <pointLight position={[0, 0.2, 0.22]} color={presentation.palette.practical} intensity={0.48} distance={3.8} />
        </group>
      ))}
    </group>
  );
}

/** Composes a beauty floor for unfamiliar prose without consulting story IDs. */
export function UniversalNarrativeEnvironmentKit({ bounds, presentation }: { bounds: Vector3Tuple; presentation: ScenePresentation }) {
  const profile = presentation.semanticProfile;
  const environmentModules = new Set(presentation.modules.environment.map((module) => module.moduleId));
  const needsFallbackInterior = profile.enclosure === "interior" &&
    environmentModules.has("shell:solid-room") &&
    environmentModules.has("surface:neutral-floor") &&
    !presentation.architecture.industrialShell;
  return (
    <group name={`semantic-environment:${profile.domain}`} userData={{ decorativeOnly: true }}>
      {profile.domain === "celestial" && <CelestialVista bounds={bounds} presentation={presentation} />}
      {profile.domain === "subterranean" && <CavernEnvironment bounds={bounds} presentation={presentation} />}
      {profile.domain === "volcanic" && profile.enclosure !== "interior" && <VolcanicEnvironment bounds={bounds} presentation={presentation} />}
      {profile.domain === "aquatic" && profile.enclosure !== "interior" && <AquaticEnvironment bounds={bounds} presentation={presentation} />}
      {profile.domain === "ruined" && <RuinedAccents bounds={bounds} presentation={presentation} />}
      {needsFallbackInterior && <PolishedFallbackInterior bounds={bounds} presentation={presentation} />}
    </group>
  );
}

function Building({
  position,
  size,
  color,
  seed,
  surface,
  roofSurface,
}: {
  position: Vector3Tuple;
  size: Vector3Tuple;
  color: string;
  seed: number;
  surface: PbrSurfaceSet;
  roofSurface: PbrSurfaceSet;
}) {
  const columns = Math.max(2, Math.floor(size[0] / 1.45));
  const rows = Math.max(2, Math.floor((size[1] - 2.8) / 2.05));
  const trimColor = seed % 3 === 0 ? "#485856" : seed % 3 === 1 ? "#5f4438" : "#4e4840";
  const awningColor = seed % 3 === 0 ? "#9f5747" : seed % 3 === 1 ? "#c18a51" : "#53726c";
  const roofRise = Math.min(1.05, Math.max(0.72, size[0] * 0.18));
  const roofRun = size[0] / 2 + 0.18;
  const roofSlope = Math.atan2(roofRise, roofRun);
  const roofLength = Math.hypot(roofRun, roofRise);
  const hasBalcony = seed % 2 === 0;
  const balconyColumn = Math.floor(columns / 2);
  const balconyX = -size[0] / 2 + (balconyColumn + 0.5) * size[0] / columns;
  const balconyWidth = Math.min(2.15, size[0] / columns * 0.94);
  const balconyFloorY = -size[1] / 2 + 3.38;
  return (
    <group position={position}>
      <RoundedBox args={size} radius={0.055} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial
          color={color}
          map={surface.color}
          normalMap={surface.normal}
          normalScale={new THREE.Vector2(0.34, 0.34)}
          roughnessMap={surface.arm}
          roughness={0.88}
          emissive={color}
          emissiveIntensity={0.035}
        />
      </RoundedBox>
      {[-1, 1].flatMap((side) => Array.from({ length: Math.ceil(size[1] / 0.58) }, (_, course) => (
        <RoundedBox
          key={`quoin:${side}:${course}`}
          args={[course % 2 ? 0.31 : 0.38, 0.42, 0.13]}
          radius={0.025}
          smoothness={3}
          position={[
            side * (size[0] / 2 - 0.08),
            -size[1] / 2 + 0.28 + course * 0.58,
            size[2] / 2 + 0.055,
          ]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={course % 3 === 0 ? "#8d8172" : "#a19686"} roughness={0.96} />
        </RoundedBox>
      )))}
      <RoundedBox args={[size[0] + 0.22, 0.2, size[2] + 0.18]} radius={0.045} smoothness={3} position={[0, size[1] / 2 - 0.08, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#55463d" roughness={0.82} />
      </RoundedBox>
      {[-1, 1].map((side) => (
        <mesh
          key={`roof:${side}`}
          position={[side * roofRun / 2, size[1] / 2 + roofRise / 2, 0]}
          rotation={[0, 0, -side * roofSlope]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[roofLength, 0.13, size[2] + 0.42]} />
          <meshStandardMaterial
            color={seed % 2 ? "#6d625c" : "#596869"}
            map={roofSurface.color}
            normalMap={roofSurface.normal}
            normalScale={new THREE.Vector2(0.58, 0.58)}
            roughnessMap={roofSurface.arm}
            roughness={0.84}
          />
        </mesh>
      ))}
      <RoundedBox args={[size[0] * 0.94, 1.1, 0.11]} radius={0.04} smoothness={3} position={[0, -size[1] / 2 + 0.55, size[2] / 2 + 0.055]} castShadow>
        <meshStandardMaterial color={trimColor} roughness={0.8} />
      </RoundedBox>
      <group position={[size[0] * (seed % 2 ? -0.25 : 0.25), -size[1] / 2 + 1.12, size[2] / 2 + 0.13]}>
        <RoundedBox args={[URBAN_HUMAN_SCALE.doorWidth, URBAN_HUMAN_SCALE.doorHeight, 0.14]} radius={0.045} smoothness={4} castShadow><meshStandardMaterial color="#332a25" roughness={0.76} /></RoundedBox>
        <mesh position={[0, 0.02, 0.078]}><planeGeometry args={[0.78, 2.02]} /><meshStandardMaterial color="#72513e" roughness={0.84} /></mesh>
        <mesh position={[0.29, -0.02, 0.092]}><sphereGeometry args={[0.048, 12, 10]} /><meshStandardMaterial color="#c19859" metalness={0.72} roughness={0.34} /></mesh>
      </group>
      <RoundedBox
        args={[size[0] * 0.9, 0.13, 0.18]}
        radius={0.035}
        smoothness={3}
        position={[0, -size[1] / 2 + 2.82, size[2] / 2 + 0.075]}
        castShadow
      >
        <meshStandardMaterial color="#8f806d" roughness={0.9} />
      </RoundedBox>
      <group position={[0, -size[1] / 2 + 2.42, size[2] / 2 + 0.31]} rotation={[0.12, 0, 0]}>
        <mesh castShadow receiveShadow><boxGeometry args={[size[0] * 0.82, 0.07, 0.88]} /><meshStandardMaterial color={awningColor} roughness={0.88} /></mesh>
        {Array.from({ length: 5 }, (_, stripe) => (
          <mesh key={stripe} position={[-size[0] * 0.32 + stripe * size[0] * 0.16, -0.045, 0.02]}>
            <boxGeometry args={[size[0] * 0.075, 0.02, 0.87]} />
            <meshStandardMaterial color={stripe % 2 ? awningColor : "#d4b781"} roughness={0.88} />
          </mesh>
        ))}
      </group>
      {hasBalcony && (
        <>
          <group position={[balconyX, balconyFloorY + 1.08, size[2] / 2 + 0.085]}>
            <RoundedBox args={[1.12, 2.16, 0.1]} radius={0.035} smoothness={3} castShadow>
              <meshStandardMaterial color={trimColor} roughness={0.76} />
            </RoundedBox>
            {[-0.255, 0.255].map((x) => (
              <group key={`french-door:${x}`} position={[x, 0, 0.058]}>
                <mesh><planeGeometry args={[0.43, 1.91]} /><meshStandardMaterial color="#294951" emissive="#17313a" emissiveIntensity={0.36} roughness={0.24} /></mesh>
                {[-0.48, 0, 0.48].map((factor) => <mesh key={factor} position={[0, factor * 1.55, 0.012]}><boxGeometry args={[0.43, 0.026, 0.025]} /><meshStandardMaterial color="#493a31" roughness={0.72} /></mesh>)}
              </group>
            ))}
            <mesh position={[0, 1.18, -0.02]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.12, 0.12, 1.38, 20]} />
              <meshStandardMaterial color="#6a5a4d" roughness={0.86} />
            </mesh>
          </group>
          <group position={[balconyX, balconyFloorY, size[2] / 2 + URBAN_HUMAN_SCALE.balconyCenterProjection]}>
            <RoundedBox args={[balconyWidth, 0.09, URBAN_HUMAN_SCALE.balconyDepth]} radius={0.025} smoothness={3} castShadow receiveShadow>
              <meshStandardMaterial color="#51453d" roughness={0.82} />
            </RoundedBox>
            {[-0.44, 0, 0.44].map((factor) => (
              <mesh key={factor} position={[balconyWidth * factor, 0.43, 0.13]} castShadow>
                <cylinderGeometry args={[0.032, 0.032, 0.86, 12]} />
                <meshStandardMaterial color="#3e3934" metalness={0.28} roughness={0.58} />
              </mesh>
            ))}
            <mesh position={[0, 0.86, 0.13]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.04, 0.04, balconyWidth, 14]} />
              <meshStandardMaterial color="#3e3934" metalness={0.28} roughness={0.58} />
            </mesh>
            {[-1, 1].map((side) => (
              <group key={`balcony-side:${side}`} position={[side * balconyWidth / 2, 0.43, 0]}>
                <mesh position={[0, 0.43, 0.065]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                  <cylinderGeometry args={[0.038, 0.038, 0.13, 12]} />
                  <meshStandardMaterial color="#3e3934" metalness={0.28} roughness={0.58} />
                </mesh>
                <mesh position={[0, 0, 0.13]} castShadow><cylinderGeometry args={[0.032, 0.032, 0.86, 12]} /><meshStandardMaterial color="#3e3934" metalness={0.28} roughness={0.58} /></mesh>
              </group>
            ))}
          </group>
        </>
      )}
      {Array.from({ length: columns * rows }, (_, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        if (hasBalcony && row === 0 && column === balconyColumn) return null;
        return (
          <group key={index} position={[-size[0] / 2 + (column + 0.5) * size[0] / columns, -size[1] / 2 + 3.55 + row * 2.05, size[2] / 2 + 0.035]}>
            <RoundedBox args={[0.82, 1.24, 0.09]} radius={0.035} smoothness={3} castShadow receiveShadow>
              <meshStandardMaterial color={trimColor} roughness={0.72} metalness={0.08} />
            </RoundedBox>
            <mesh position={[0, 0, 0.032]}>
              <planeGeometry args={[0.61, 1.01]} />
              <meshStandardMaterial color={(index + seed) % 5 === 0 ? "#d7b56a" : "#28444c"} emissive={(index + seed) % 5 === 0 ? "#d49748" : "#102126"} emissiveIntensity={(index + seed) % 5 === 0 ? 0.72 : 0.22} roughness={0.32} />
            </mesh>
            <mesh position={[0, 0, 0.04]}><boxGeometry args={[0.032, 1.01, 0.02]} /><meshStandardMaterial color="#35302c" roughness={0.78} /></mesh>
            <RoundedBox args={[0.91, 0.09, 0.18]} radius={0.025} smoothness={3} position={[0, -0.68, 0.055]} castShadow><meshStandardMaterial color="#6c5d4c" roughness={0.86} /></RoundedBox>
            <RoundedBox args={[1.08, 0.12, 0.16]} radius={0.03} smoothness={3} position={[0, 0.69, 0.045]} castShadow><meshStandardMaterial color="#857461" roughness={0.9} /></RoundedBox>
            {[-1, 1].map((shutterSide) => (
              <group key={`shutter:${shutterSide}`} position={[shutterSide * 0.54, 0, 0.075]}>
                <RoundedBox args={[0.18, 1.12, 0.055]} radius={0.022} smoothness={3} castShadow>
                  <meshStandardMaterial color={seed % 2 ? "#536d6b" : "#665343"} roughness={0.84} />
                </RoundedBox>
                {[-0.34, 0, 0.34].map((slatY) => (
                  <mesh key={slatY} position={[0, slatY, 0.034]} castShadow>
                    <boxGeometry args={[0.16, 0.025, 0.022]} />
                    <meshStandardMaterial color="#342f2b" roughness={0.8} />
                  </mesh>
                ))}
              </group>
            ))}
          </group>
        );
      })}
      <group position={[size[0] / 2 - 0.32, 0, size[2] / 2 + 0.16]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.045, 0.055, size[1] - 0.45, 14]} />
          <meshStandardMaterial color="#4b4c48" metalness={0.34} roughness={0.62} />
        </mesh>
        {[-size[1] * 0.28, 0, size[1] * 0.28].map((y) => (
          <mesh key={`pipe-clamp:${y}`} position={[0, y, -0.025]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.074, 0.014, 8, 16]} />
            <meshStandardMaterial color="#343633" metalness={0.42} roughness={0.52} />
          </mesh>
        ))}
      </group>
      <group position={[size[0] * (seed % 2 ? 0.32 : -0.3), size[1] / 2 + roofRise + 0.5, 0]}>
        <mesh castShadow><boxGeometry args={[0.28, 1.05, 0.34]} /><meshStandardMaterial color="#5f5146" roughness={0.9} /></mesh>
        <mesh position={[0, 0.55, 0]} castShadow><boxGeometry args={[0.4, 0.12, 0.46]} /><meshStandardMaterial color="#463b35" roughness={0.86} /></mesh>
      </group>
    </group>
  );
}

export function UrbanStreetKit({
  bounds,
  presentation,
  hasCanal = false,
  canalWidth,
}: {
  bounds: Vector3Tuple;
  presentation: ScenePresentation;
  hasCanal?: boolean;
  canalWidth?: number;
}) {
  const surfaces = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const load = (url: string, repeat: [number, number], color = false) => {
      const texture = loader.load(url);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(...repeat);
      texture.anisotropy = 8;
      if (color) texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };
    return {
      wall: {
        color: load("/textures/polyhaven/plastered_wall_03_diff_1k.jpg", [1.2, 2.4], true),
        normal: load("/textures/polyhaven/plastered_wall_03_nor_gl_1k.jpg", [1.2, 2.4]),
        arm: load("/textures/polyhaven/plastered_wall_03_arm_1k.jpg", [1.2, 2.4]),
      },
      brick: {
        color: load("/textures/polyhaven/brick_wall_08_diff_1k.jpg", [1.8, 3.2], true),
        normal: load("/textures/polyhaven/brick_wall_08_nor_gl_1k.jpg", [1.8, 3.2]),
        arm: load("/textures/polyhaven/brick_wall_08_arm_1k.jpg", [1.8, 3.2]),
      },
      damaged: {
        color: load("/textures/polyhaven/damaged_plaster_diff_1k.jpg", [1.7, 3.1], true),
        normal: load("/textures/polyhaven/damaged_plaster_nor_gl_1k.jpg", [1.7, 3.1]),
        arm: load("/textures/polyhaven/damaged_plaster_arm_1k.jpg", [1.7, 3.1]),
      },
      roof: {
        color: load("/textures/polyhaven/grey_roof_tiles_diff_1k.jpg", [2.2, 2.8], true),
        normal: load("/textures/polyhaven/grey_roof_tiles_nor_gl_1k.jpg", [2.2, 2.8]),
        arm: load("/textures/polyhaven/grey_roof_tiles_arm_1k.jpg", [2.2, 2.8]),
      },
      street: {
        color: load("/textures/polyhaven/patterned_cobblestone_diff_1k.jpg", [4.5, 8], true),
        normal: load("/textures/polyhaven/patterned_cobblestone_nor_gl_1k.jpg", [4.5, 8]),
        arm: load("/textures/polyhaven/patterned_cobblestone_arm_1k.jpg", [4.5, 8]),
      },
    };
  }, []);
  useEffect(
    () => () => Object.values(surfaces).flatMap((surface) => Object.values(surface)).forEach((texture) => texture.dispose()),
    [surfaces],
  );
  const facades = useMemo(() => [-1, 1].flatMap((side) => Array.from({ length: 6 }, (_, index) => {
    const width = bounds[2] / 6 - 0.25;
    const height = URBAN_HUMAN_SCALE.minimumBuildingHeight + ((index * 7 + side + 4) % 4) * 1.05;
    const depth = 3.2 + ((index + (side > 0 ? 1 : 0)) % 3) * 0.38;
    return {
      position: [side * (bounds[0] / 2 - depth / 2), height / 2, -bounds[2] / 2 + (index + 0.5) * bounds[2] / 6] as Vector3Tuple,
      size: [width, height, depth] as Vector3Tuple,
      rotation: [0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0] as Vector3Tuple,
      color: ["#e1c9ad", "#c5d4ce", "#ddb99f", "#bdd0ca", "#e4cfad", "#cab8ae"][index % 6]!,
      seed: index + (side > 0 ? 11 : 0),
    };
  })), [bounds]);
  const reservedCanalWidth = Math.min(bounds[0] * 0.46, Math.max(4.8, canalWidth ?? bounds[0] * 0.28));
  const canalSideWidth = (bounds[0] - reservedCanalWidth) / 2;
  const horizonCenter = bounds[2] * URBAN_HUMAN_SCALE.horizonCenterFactor;
  const horizonApronDepth = bounds[2] * URBAN_HUMAN_SCALE.horizonApronDepthRatio;
  return (
    <group>
      {(hasCanal ? [-1, 1] : [0]).map((side) => (
        <mesh
          key={`urban-ground:${side}`}
          position={[hasCanal ? side * (reservedCanalWidth / 2 + canalSideWidth / 2) : 0, 0.018, 0]}
          receiveShadow
        >
          <boxGeometry args={[hasCanal ? canalSideWidth : bounds[0], 0.1, bounds[2]]} />
          <meshStandardMaterial
            color={presentation.palette.floor}
            map={surfaces.street.color}
            normalMap={surfaces.street.normal}
            normalScale={new THREE.Vector2(0.46, 0.46)}
            roughnessMap={surfaces.street.arm}
            roughness={0.94}
          />
        </mesh>
      ))}
      {!hasCanal && (
        <mesh position={[0, 0.08, 0]} receiveShadow>
          <boxGeometry args={[bounds[0] * 0.42, 0.06, bounds[2]]} />
          <meshStandardMaterial color="#71675b" map={surfaces.street.color} normalMap={surfaces.street.normal} normalScale={new THREE.Vector2(0.58, 0.58)} roughnessMap={surfaces.street.arm} roughness={0.9} />
        </mesh>
      )}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * bounds[0] * 0.34, 0.13, 0]} receiveShadow>
          <boxGeometry args={[bounds[0] * 0.22, 0.12, bounds[2]]} />
          <meshStandardMaterial color="#7f7568" map={surfaces.street.color} normalMap={surfaces.street.normal} normalScale={new THREE.Vector2(0.28, 0.28)} roughnessMap={surfaces.street.arm} roughness={0.96} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <group key={`gutter:${side}`} position={[side * bounds[0] * 0.215, 0.17, 0]}>
          {Array.from({ length: 18 }, (_, index) => (
            <mesh key={index} position={[0, 0, -bounds[2] / 2 + (index + 0.5) * bounds[2] / 18]} rotation={[0, (index % 3 - 1) * 0.08, 0]} receiveShadow>
              <boxGeometry args={[0.28, 0.08, bounds[2] / 18 - 0.035]} />
              <meshStandardMaterial color={index % 2 ? "#6b6258" : "#786d61"} roughness={0.98} />
            </mesh>
          ))}
        </group>
      ))}
      {facades.map((building, index) => (
        <group key={index} position={building.position} rotation={building.rotation}>
          <Building
            position={[0, 0, 0]}
            size={building.size}
            color={building.color}
            seed={building.seed}
            surface={[surfaces.wall, surfaces.brick, surfaces.damaged][building.seed % 3]!}
            roofSurface={surfaces.roof}
          />
        </group>
      ))}
      {[-1, 1].flatMap((end) => (hasCanal ? [-1, 1] : [0]).map((side) => (
        <mesh
          key={`urban-horizon-ground:${end}:${side}`}
          position={[
            hasCanal ? side * (reservedCanalWidth / 2 + canalSideWidth / 2) : 0,
            0.012,
            end * horizonCenter,
          ]}
          receiveShadow
          userData={{ decorativeOnly: true, depthLayer: "urban-horizon-ground" }}
        >
          <boxGeometry args={[hasCanal ? canalSideWidth : bounds[0], 0.1, horizonApronDepth]} />
          <meshStandardMaterial color="#5d5953" map={surfaces.street.color} normalMap={surfaces.street.normal} normalScale={new THREE.Vector2(0.34, 0.34)} roughnessMap={surfaces.street.arm} roughness={0.96} />
        </mesh>
      )))}
      {hasCanal && [-1, 1].map((end) => (
        <mesh
          key={`urban-horizon-water:${end}`}
          position={[0, URBAN_HUMAN_SCALE.canalWaterLevel - 0.025, end * horizonCenter]}
          receiveShadow
          userData={{ decorativeOnly: true, depthLayer: "canal-continuation" }}
        >
          <boxGeometry args={[reservedCanalWidth, 0.16, horizonApronDepth]} />
          <meshPhysicalMaterial color="#235965" emissive="#102e35" emissiveIntensity={0.18} roughness={0.24} metalness={0.04} clearcoat={0.42} clearcoatRoughness={0.3} />
        </mesh>
      ))}
      {[-1, 1].flatMap((end) => Array.from({ length: 5 }, (_, index) => {
        if (index === 2) return null;
        const width = bounds[0] / 5 - 0.34;
        const height = URBAN_HUMAN_SCALE.minimumBuildingHeight * 0.86 + ((index * 5 + (end > 0 ? 2 : 0)) % 3) * 1.2;
        const depth = 3.1 + (index % 2) * 0.45;
        return (
          <group
            key={`urban-horizon:${end}:${index}`}
            position={[-bounds[0] / 2 + (index + 0.5) * bounds[0] / 5, height / 2 - 0.05, end * horizonCenter]}
            rotation={[0, end > 0 ? Math.PI : 0, 0]}
            userData={{ decorativeOnly: true, depthLayer: "urban-horizon" }}
          >
            <Building
              position={[0, 0, 0]}
              size={[width, height, depth]}
              color={["#ac9e8d", "#9baaa6", "#b49a82", "#8f9f9d", "#aa9a8d"][index]!}
              seed={31 + index + (end > 0 ? 9 : 0)}
              surface={[surfaces.damaged, surfaces.wall, surfaces.brick][index % 3]!}
              roofSurface={surfaces.roof}
            />
          </group>
        );
      }))}
      {hasCanal && [-0.4, 0.4].map((factor, bridgeIndex) => (
        <group key={`canal-bridge:${factor}`} position={[0, 0, bounds[2] * factor]} userData={{ decorativeOnly: true, module: "canal-bridge" }}>
          <RoundedBox args={[reservedCanalWidth + 2.2, 0.32, 1.75]} radius={0.11} smoothness={5} position={[0, 0.34, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#a59d90" emissive="#3c3833" emissiveIntensity={0.16} normalMap={surfaces.street.normal} normalScale={new THREE.Vector2(0.26, 0.26)} roughnessMap={surfaces.street.arm} roughness={0.94} />
          </RoundedBox>
          <RoundedBox args={[reservedCanalWidth + 1.8, 0.18, 1.92]} radius={0.08} smoothness={4} position={[0, 0.16, 0]} castShadow>
            <meshStandardMaterial color="#777168" emissive="#292725" emissiveIntensity={0.14} roughness={0.98} />
          </RoundedBox>
          {[-0.91, 0.91].flatMap((edge) => Array.from({ length: 13 }, (_, index) => {
            const progress = index / 12;
            const x = -(reservedCanalWidth + 1.9) / 2 + progress * (reservedCanalWidth + 1.9);
            const crest = Math.sin(progress * Math.PI);
            return (
              <RoundedBox
                key={`bridge-parapet:${edge}:${index}`}
                args={[(reservedCanalWidth + 1.9) / 13 - 0.035, 0.17 + crest * 0.11, 0.13]}
                radius={0.025}
                smoothness={3}
                position={[x, 0.53 + crest * 0.055, edge]}
                rotation={[0, (index % 3 - 1) * 0.012, 0]}
                castShadow
              >
                <meshStandardMaterial color={index % 2 ? "#b0a89b" : "#9b9387"} emissive="#3d3934" emissiveIntensity={0.18} normalMap={surfaces.street.normal} normalScale={new THREE.Vector2(0.18, 0.18)} roughnessMap={surfaces.street.arm} roughness={0.96} />
              </RoundedBox>
            );
          }))}
          {[-1, 1].map((side) => (
            <group key={`bridge-lamp:${side}`} position={[side * (reservedCanalWidth / 2 + 0.62), 1.9, bridgeIndex ? 0.63 : -0.63]}>
              <mesh position={[0, -0.78, 0]} castShadow><cylinderGeometry args={[0.045, 0.07, 1.55, 12]} /><meshStandardMaterial color="#2d3434" metalness={0.72} roughness={0.38} /></mesh>
              <mesh castShadow><cylinderGeometry args={[0.16, 0.11, 0.32, 8]} /><meshStandardMaterial color="#d7a95b" emissive="#d78531" emissiveIntensity={1.4} roughness={0.36} /></mesh>
              <pointLight color={presentation.palette.practical} intensity={0.58} distance={4.8} decay={2} />
            </group>
          ))}
        </group>
      ))}
      {([[-0.25, -0.38], [0.25, -0.12], [-0.25, 0.15], [0.25, 0.4]] as const).map(([x, z]) => (
        <pointLight
          key={`street-light:${x}:${z}`}
          position={[bounds[0] * x, 3.05, bounds[2] * z]}
          color={presentation.palette.practical}
          intensity={0.72}
          distance={6}
        />
      ))}
      {[-1, 1].flatMap((side) => [-0.24, 0.18].map((factor, index) => (
        <group key={`stall:${side}:${factor}`} position={[side * bounds[0] * 0.26, 0, bounds[2] * factor]} rotation={[0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
          <mesh position={[0, URBAN_HUMAN_SCALE.stallCounterHeight, 0]} castShadow receiveShadow><boxGeometry args={[2.15, 0.14, 0.86]} /><meshStandardMaterial color="#6d4932" roughness={0.88} /></mesh>
          <mesh position={[0, URBAN_HUMAN_SCALE.stallCanopyHeight, -0.1]} rotation={[-0.1, 0, 0]} castShadow><boxGeometry args={[2.42, 0.1, 1.28]} /><meshStandardMaterial color={index % 2 ? "#a9684f" : "#667a70"} roughness={0.9} /></mesh>
          {[-0.98, 0.98].map((x) => <mesh key={x} position={[x, 1.23, -0.46]} castShadow><boxGeometry args={[0.08, 2.46, 0.08]} /><meshStandardMaterial color="#4b3429" roughness={0.9} /></mesh>)}
          {[-0.58, 0, 0.58].map((x, item) => <mesh key={x} position={[x, 1.13, 0]} castShadow><sphereGeometry args={[0.17 + item * 0.018, 12, 8]} /><meshStandardMaterial color={["#b17a4b", "#71835a", "#98645c"][item]} roughness={0.9} /></mesh>)}
        </group>
      )))}
      {[-0.22, 0.2].map((factor, index) => (
        <group key={`banner:${factor}`} position={[0, 3.5 + index * 0.35, bounds[2] * factor]}>
          <mesh><boxGeometry args={[bounds[0] * 0.62, 0.025, 0.025]} /><meshStandardMaterial color="#352c28" roughness={0.8} /></mesh>
          {[-0.2, 0, 0.2].map((x, banner) => <mesh key={x} position={[bounds[0] * x, -0.38, 0]}><planeGeometry args={[0.55, 0.75]} /><meshStandardMaterial color={["#8c4d46", "#bc8b4d", "#4f716d"][(banner + index) % 3]} side={THREE.DoubleSide} roughness={0.9} /></mesh>)}
          {[-0.29, -0.145, 0, 0.145, 0.29].map((x, lamp) => (
            <group key={`lamp:${x}`} position={[bounds[0] * x, -0.13 - Math.abs(x) * 0.35, 0]}>
              <mesh><cylinderGeometry args={[0.07, 0.1, 0.22, 8]} /><meshStandardMaterial color="#e5bd6c" emissive="#d48a35" emissiveIntensity={1.8} roughness={0.3} /></mesh>
              {lamp % 2 === 0 && <pointLight color="#f0ae57" intensity={0.6} distance={3.4} decay={2} />}
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

export function IndustrialInteriorKit({ bounds, presentation }: { bounds: Vector3Tuple; presentation: ScenePresentation }) {
  const metalSurface = usePbrSurfaceSet("metal_plate_02", [1.4, 5.5]);
  return (
    <group>
      {Array.from({ length: 6 }, (_, index) => (
        <RoundedBox
          key={`rear-bulkhead:${index}`}
          args={[bounds[0] / 6 - 0.045, bounds[1] * 0.78, 0.12]}
          radius={0.035}
          smoothness={3}
          position={[-bounds[0] / 2 + (index + 0.5) * bounds[0] / 6, bounds[1] * 0.48, -bounds[2] / 2 + 0.12]}
          receiveShadow
        >
          <meshStandardMaterial color={index % 2 ? "#829092" : "#6d7b7e"} map={metalSurface.color} normalMap={metalSurface.normal} normalScale={new THREE.Vector2(0.42, 0.42)} roughnessMap={metalSurface.arm} roughness={0.62} metalness={0.38} />
        </RoundedBox>
      ))}
      {[-0.24, 0.24].map((factor, bank) => (
        <group key={`industrial-pipe-bank:${factor}`} position={[bounds[0] * factor, 0, -bounds[2] / 2 + 0.34]}>
          {[-0.54, 0, 0.54].map((x, index) => {
            const height = Math.min(3.35, bounds[1] * (0.58 + index * 0.045));
            const radius = 0.1 + index * 0.018;
            const pipeColor = index === 1 ? "#866143" : bank ? "#55686a" : "#66787a";
            return (
              <group key={x} position={[x, 0, index * 0.045]}>
                <mesh position={[0, height / 2 + 0.18, 0]} castShadow>
                  <cylinderGeometry args={[radius, radius, height, 16]} />
                  <meshStandardMaterial color={pipeColor} metalness={0.66} roughness={0.4} />
                </mesh>
                {[0.52, height * 0.56, height + 0.05].map((y) => (
                  <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                    <torusGeometry args={[radius * 1.22, 0.035, 8, 18]} />
                    <meshStandardMaterial color="#3e4b4e" metalness={0.72} roughness={0.38} />
                  </mesh>
                ))}
                <mesh position={[index % 2 ? -0.28 : 0.28, height + 0.18, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[radius, radius, 0.56, 16]} />
                  <meshStandardMaterial color={pipeColor} metalness={0.66} roughness={0.4} />
                </mesh>
                <mesh position={[index % 2 ? -0.56 : 0.56, height + 0.18, 0]} castShadow>
                  <sphereGeometry args={[radius, 16, 10]} />
                  <meshStandardMaterial color={pipeColor} metalness={0.66} roughness={0.4} />
                </mesh>
              </group>
            );
          })}
          <RoundedBox args={[2.05, 0.5, 0.22]} radius={0.08} smoothness={3} position={[0, 0.38, 0.08]} castShadow receiveShadow>
            <meshStandardMaterial color="#4b595c" map={metalSurface.color} normalMap={metalSurface.normal} normalScale={new THREE.Vector2(0.25, 0.25)} roughnessMap={metalSurface.arm} metalness={0.5} roughness={0.55} />
          </RoundedBox>
        </group>
      ))}
      {Array.from({ length: 7 }, (_, index) => (
        <mesh key={`floor-panel-${index}`} position={[-bounds[0] / 2 + (index + 0.5) * bounds[0] / 7, 0.075, 0]} receiveShadow>
          <boxGeometry args={[bounds[0] / 7 - 0.035, 0.055, bounds[2] - 0.12]} />
          <meshStandardMaterial color={index % 2 ? "#8b9595" : "#747e80"} map={metalSurface.color} normalMap={metalSurface.normal} normalScale={new THREE.Vector2(0.52, 0.52)} roughnessMap={metalSurface.arm} roughness={0.58} metalness={0.42} />
        </mesh>
      ))}
      {[-0.3, 0.3].map((factor) => (
        <group key={factor} position={[factor * bounds[0], bounds[1] * 0.78, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.11, 0.11, bounds[2], 14]} /><meshStandardMaterial color="#4d5b5c" metalness={0.66} roughness={0.42} /></mesh>
          <mesh position={[0.2, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.045, 0.045, bounds[2], 10]} /><meshStandardMaterial color="#936646" metalness={0.62} roughness={0.48} /></mesh>
        </group>
      ))}
      {[-1, 1].flatMap((side) => Array.from({ length: 6 }, (_, index) => (
        <group key={`side-rib:${side}:${index}`} position={[side * (bounds[0] / 2 - 0.075), bounds[1] * 0.48, -bounds[2] * 0.42 + index * bounds[2] * 0.17]}>
          <mesh castShadow>
            <boxGeometry args={[0.14, bounds[1] * 0.78, 0.16]} />
            <meshStandardMaterial color="#435256" metalness={0.56} roughness={0.48} />
          </mesh>
          <mesh position={[-side * 0.06, bounds[1] * 0.27, 0]} rotation={[0, 0, side * 0.12]}>
            <boxGeometry args={[0.12, 0.08, Math.max(0.7, bounds[2] * 0.14)]} />
            <meshStandardMaterial color="#738387" metalness={0.48} roughness={0.5} />
          </mesh>
        </group>
      )))}
      {[-0.28, 0, 0.28].map((factor) => (
        <group key={factor} position={[factor * bounds[0], bounds[1] - 0.22, 0]}>
          <mesh><boxGeometry args={[1.8, 0.08, 0.22]} /><meshStandardMaterial color="#d7e2df" emissive={presentation.palette.keyLight} emissiveIntensity={1.25} /></mesh>
          <rectAreaLight position={[0, -0.05, 0]} rotation={[Math.PI / 2, 0, 0]} width={1.8} height={0.3} intensity={2.1} color={presentation.palette.keyLight} />
        </group>
      ))}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * bounds[0] * 0.33, 0, -bounds[2] * 0.28]}>
          <RoundedBox args={[2.2, 1.4, 0.75]} radius={0.12} smoothness={4} position={[0, 0.7, 0]} castShadow receiveShadow><meshStandardMaterial color="#718084" map={metalSurface.color} normalMap={metalSurface.normal} normalScale={new THREE.Vector2(0.28, 0.28)} roughnessMap={metalSurface.arm} metalness={0.48} roughness={0.55} /></RoundedBox>
          {[-0.62, 0, 0.62].map((x, index) => <mesh key={x} position={[x, 0.84, 0.385]}><planeGeometry args={[0.42, 0.32]} /><meshStandardMaterial color={index === 1 ? "#d29a53" : "#75b6ac"} emissive={index === 1 ? "#75451f" : "#245f59"} emissiveIntensity={0.75} roughness={0.28} /></mesh>)}
          {[-0.74, 0.74].map((x) => <mesh key={x} position={[x, 1.65, -0.02]} castShadow><cylinderGeometry args={[0.36, 0.42, 1.8, 16]} /><meshStandardMaterial color="#56666a" metalness={0.58} roughness={0.48} /></mesh>)}
        </group>
      ))}
      <group position={[0, 0, -bounds[2] * 0.39]}>
        <mesh position={[0, 1.05, 0]} castShadow><cylinderGeometry args={[0.85, 1.05, 2.1, 18]} /><meshStandardMaterial color="#48575b" metalness={0.62} roughness={0.44} /></mesh>
        <mesh position={[0, 2.15, 0]}><torusGeometry args={[0.62, 0.08, 9, 28]} /><meshStandardMaterial color={presentation.palette.practical} emissive={presentation.palette.practical} emissiveIntensity={0.55} metalness={0.5} /></mesh>
      </group>
    </group>
  );
}
