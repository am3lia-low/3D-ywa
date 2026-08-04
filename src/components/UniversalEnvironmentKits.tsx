import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Vector3Tuple } from "../contracts/world";
import type { SceneEnvironmentFamily } from "../runtime/sceneAtmosphere";
import type { ScenePresentation } from "../runtime/sceneCompiler";

type LandscapeFamily = Extract<SceneEnvironmentFamily, "alpine" | "arid" | "coastal" | "grassland">;

function seededTexture(base: string, accents: readonly string[], seed: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable.");
  context.fillStyle = base;
  context.fillRect(0, 0, 256, 256);
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let index = 0; index < 1900; index += 1) {
    context.fillStyle = accents[index % accents.length]!;
    context.globalAlpha = 0.08 + random() * 0.24;
    const radius = 0.5 + random() * 3.5;
    context.beginPath();
    context.ellipse(random() * 256, random() * 256, radius * (0.6 + random()), radius * 0.45, random() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 10);
  texture.anisotropy = 8;
  return texture;
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

function WindingTrail({ bounds, color }: { bounds: Vector3Tuple; color: string }) {
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
      <meshStandardMaterial color={color} roughness={0.97} />
    </mesh>
  );
}

function AlpineHorizon({ bounds }: { bounds: Vector3Tuple }) {
  return (
    <group position={[0, 0, -bounds[2] * 0.58]}>
      {Array.from({ length: 8 }, (_, index) => {
        const height = 5.5 + (index % 4) * 1.7;
        const x = -bounds[0] * 0.62 + index * (bounds[0] * 0.18);
        return (
          <group key={index} position={[x, height * 0.38 - 0.6, (index % 2) * 2.1]}>
            <mesh castShadow receiveShadow>
              <coneGeometry args={[height * 0.72, height, 5]} />
              <meshStandardMaterial color={index % 2 ? "#667b7d" : "#778b8c"} roughness={0.96} />
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

function RollingHorizon({ bounds, family, color }: { bounds: Vector3Tuple; family: LandscapeFamily; color: string }) {
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
            <meshStandardMaterial color={color} roughness={1} />
          </mesh>
        );
      })}
    </group>
  );
}

function AlpineDressing({ bounds }: { bounds: Vector3Tuple }) {
  return (
    <group>
      {[-1, 1].flatMap((side) => Array.from({ length: 6 }, (_, index) => {
        const height = 2.7 + (index % 3) * 0.55;
        return (
          <group key={`${side}:${index}`} position={[side * bounds[0] * (0.28 + (index % 2) * 0.09), 0, -bounds[2] * 0.38 + index * bounds[2] * 0.15]} rotation={[0, index * 0.71, 0]}>
            <mesh position={[0, height * 0.3, 0]} castShadow><cylinderGeometry args={[0.1, 0.16, height * 0.6, 9]} /><meshStandardMaterial color="#4b4037" roughness={0.92} /></mesh>
            {[0.42, 0.62, 0.82].map((factor, tier) => (
              <group key={factor} position={[0, height * factor, 0]}>
                <mesh castShadow><coneGeometry args={[height * (0.3 - tier * 0.045), height * 0.38, 8]} /><meshStandardMaterial color={tier % 2 ? "#274b45" : "#31554d"} roughness={0.94} /></mesh>
                <mesh position={[0, height * 0.055, 0]}><coneGeometry args={[height * (0.23 - tier * 0.035), height * 0.18, 8]} /><meshStandardMaterial color="#dce9e7" roughness={0.96} /></mesh>
              </group>
            ))}
          </group>
        );
      }))}
    </group>
  );
}

function AridDressing({ bounds }: { bounds: Vector3Tuple }) {
  return (
    <group>
      {Array.from({ length: 11 }, (_, index) => {
        const side = index % 2 ? 1 : -1;
        const height = 1.2 + (index % 4) * 0.7;
        return (
          <group key={index} position={[side * bounds[0] * (0.3 + (index % 3) * 0.06), 0, -bounds[2] * 0.42 + index * bounds[2] * 0.085]} rotation={[0, index * 0.47, 0]}>
            <mesh position={[0, height * 0.42, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.22 + (index % 2) * 0.12, 0.48, height, 6]} />
              <meshStandardMaterial color={index % 2 ? "#8f5738" : "#a96640"} roughness={0.98} />
            </mesh>
            {index % 3 === 0 && <mesh position={[0.13, height * 0.92, 0]} castShadow><dodecahedronGeometry args={[0.32, 0]} /><meshStandardMaterial color="#704936" roughness={1} /></mesh>}
          </group>
        );
      })}
    </group>
  );
}

function CoastalDressing({ bounds }: { bounds: Vector3Tuple }) {
  return (
    <group>
      {Array.from({ length: 13 }, (_, index) => (
        <mesh
          key={index}
          position={[bounds[0] * (0.02 + (index % 3) * 0.055), 0.18 + (index % 4) * 0.06, -bounds[2] * 0.44 + index * bounds[2] * 0.072]}
          rotation={[index * 0.13, index * 0.61, 0]}
          scale={[0.7 + (index % 3) * 0.32, 0.55 + (index % 2) * 0.26, 0.8]}
          castShadow
          receiveShadow
        >
          <dodecahedronGeometry args={[0.62, 0]} />
          <meshStandardMaterial color={index % 2 ? "#536b67" : "#687771"} roughness={0.98} />
        </mesh>
      ))}
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
          <group key={index} position={[x, 0, z]} rotation={[0, index * 0.8, 0]}>
            {[0, 0.09, -0.08].map((offset, blade) => (
              <mesh key={offset} position={[offset, 0.24 + blade * 0.045, 0]} rotation={[0, 0, (blade - 1) * 0.12]}>
                <coneGeometry args={[0.035, 0.48 + blade * 0.08, 4]} />
                <meshStandardMaterial color={["#6d8249", "#829153", "#b09a50"][blade]} roughness={1} />
              </mesh>
            ))}
            {index % 6 === 0 && <mesh position={[0, 0.53, 0]}><sphereGeometry args={[0.07, 10, 7]} /><meshStandardMaterial color={index % 12 ? "#e0b35e" : "#d9d6e8"} roughness={0.9} /></mesh>}
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
  const ground = useMemo(() => seededTexture(colors.ground, colors.accents, 61031 + family.length * 97), [colors, family]);
  useEffect(() => () => ground.dispose(), [ground]);
  const showTrail = family !== "coastal" || presentation.architecture.earthTrail;

  return (
    <group>
      <mesh position={[0, 0.015, 0]} receiveShadow>
        <boxGeometry args={[bounds[0], 0.1, bounds[2]]} />
        <meshStandardMaterial map={ground} color="#d7d9d1" roughness={0.98} />
      </mesh>
      <mesh position={[0, -0.08, 0]} receiveShadow>
        <boxGeometry args={[bounds[0] * 4, 0.12, bounds[2] * 4]} />
        <meshStandardMaterial map={ground} color="#899187" roughness={1} />
      </mesh>
      {showTrail && <WindingTrail bounds={bounds} color={colors.path} />}
      {family === "alpine" ? <AlpineHorizon bounds={bounds} /> : <RollingHorizon bounds={bounds} family={family} color={colors.horizon} />}
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
      {family === "arid" && <AridDressing bounds={bounds} />}
      {family === "coastal" && <CoastalDressing bounds={bounds} />}
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
  return (
    <group>
      <mesh position={[0, 0.015, 0]} receiveShadow>
        <boxGeometry args={[bounds[0], 0.12, bounds[2]]} />
        <meshStandardMaterial color={presentation.palette.floor} roughness={0.98} />
      </mesh>
      {Array.from({ length: count }, (_, index) => {
        const side = index % 2 ? 1 : -1;
        const progress = index / Math.max(1, count - 1);
        const z = -bounds[2] * 0.5 + progress * bounds[2];
        const radius = 1.5 + (index % 5) * 0.34;
        return (
          <mesh key={index} position={[side * bounds[0] * (0.43 + (index % 3) * 0.035), radius * 0.36, z]} rotation={[index * 0.17, index * 0.51, index * 0.11]} scale={[1.2, 0.82 + (index % 3) * 0.18, 1]} castShadow receiveShadow>
            <dodecahedronGeometry args={[radius, 1]} />
            <meshStandardMaterial color={index % 2 ? presentation.palette.wall : presentation.palette.floor} roughness={0.96} />
          </mesh>
        );
      })}
      {Array.from({ length: 13 }, (_, index) => (
        <mesh key={`stalactite:${index}`} position={[-bounds[0] * 0.42 + index * bounds[0] * 0.07, bounds[1] - 0.5 - (index % 3) * 0.25, -bounds[2] * (0.2 + (index % 4) * 0.08)]} rotation={[Math.PI, 0, (index % 2 ? 1 : -1) * 0.08]} castShadow>
          <coneGeometry args={[0.22 + (index % 3) * 0.08, 1.1 + (index % 4) * 0.33, 7]} />
          <meshStandardMaterial color={presentation.palette.wall} roughness={0.98} />
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
      <mesh position={[0, 0.025, 0]} receiveShadow><boxGeometry args={[bounds[0] * 1.15, 0.14, bounds[2] * 1.15]} /><meshStandardMaterial color="#211d25" roughness={0.94} /></mesh>
      {cracks.map((geometry, index) => <mesh key={index} geometry={geometry}><meshStandardMaterial color={index % 2 ? "#ff7445" : presentation.palette.practical} emissive={index % 2 ? "#d83d1f" : presentation.palette.practical} emissiveIntensity={2.4} roughness={0.42} /></mesh>)}
      {Array.from({ length: 18 }, (_, index) => (
        <mesh key={`basalt:${index}`} position={[(index % 2 ? 1 : -1) * bounds[0] * (0.3 + (index % 4) * 0.045), 0.35 + (index % 4) * 0.09, -bounds[2] * 0.44 + index * bounds[2] * 0.052]} rotation={[index * 0.13, index * 0.49, 0]} scale={[0.7, 0.65 + (index % 3) * 0.2, 0.8]} castShadow receiveShadow>
          <dodecahedronGeometry args={[0.72, 0]} /><meshStandardMaterial color={index % 2 ? "#332d38" : "#29252d"} roughness={0.98} />
        </mesh>
      ))}
      <pointLight position={[0, 1.2, 0]} color="#ff6b3d" intensity={2.2} distance={Math.max(bounds[0], bounds[2]) * 0.75} />
    </group>
  );
}

function AquaticEnvironment({ bounds, presentation }: { bounds: Vector3Tuple; presentation: ScenePresentation }) {
  return (
    <group>
      <mesh position={[0, 0.02, 0]} receiveShadow><boxGeometry args={[bounds[0] * 1.2, 0.12, bounds[2] * 1.2]} /><meshPhysicalMaterial color={presentation.palette.floor} roughness={0.72} metalness={0.05} /></mesh>
      <mesh position={[0, bounds[1] * 0.84, 0]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[bounds[0] * 1.5, bounds[2] * 1.5, 18, 18]} /><meshPhysicalMaterial color={presentation.palette.keyLight} transparent opacity={0.1} transmission={0.45} roughness={0.15} side={THREE.DoubleSide} /></mesh>
      {Array.from({ length: 24 }, (_, index) => {
        const side = index % 2 ? 1 : -1;
        const height = 0.7 + (index % 5) * 0.24;
        return <mesh key={`coral:${index}`} position={[side * bounds[0] * (0.25 + (index % 4) * 0.045), height / 2, -bounds[2] * 0.44 + index * bounds[2] * 0.037]} rotation={[0, index * 0.7, (index % 3 - 1) * 0.12]} castShadow><coneGeometry args={[0.12 + (index % 3) * 0.055, height, 6]} /><meshStandardMaterial color={[presentation.palette.practical, "#a46c88", "#6ca8a0"][index % 3]} roughness={0.72} /></mesh>;
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

interface PbrSurfaceSet {
  color: THREE.Texture;
  normal: THREE.Texture;
  arm: THREE.Texture;
}

function Building({
  position,
  size,
  color,
  seed,
  surface,
}: {
  position: Vector3Tuple;
  size: Vector3Tuple;
  color: string;
  seed: number;
  surface: PbrSurfaceSet;
}) {
  const columns = Math.max(2, Math.floor(size[0] / 0.8));
  const rows = Math.max(2, Math.floor(size[1] / 0.9));
  const trimColor = seed % 3 === 0 ? "#485856" : seed % 3 === 1 ? "#5f4438" : "#4e4840";
  const awningColor = seed % 3 === 0 ? "#9f5747" : seed % 3 === 1 ? "#c18a51" : "#53726c";
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
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
      </mesh>
      <mesh position={[0, size[1] / 2 - 0.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[size[0] + 0.22, 0.2, size[2] + 0.18]} />
        <meshStandardMaterial color="#55463d" roughness={0.82} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={`roof:${side}`}
          position={[side * size[0] * 0.22, size[1] / 2 + 0.22, 0]}
          rotation={[0, 0, side * 0.62]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[size[0] * 0.72, 0.11, size[2] + 0.28]} />
          <meshStandardMaterial color={seed % 2 ? "#51403a" : "#3e5050"} roughness={0.74} metalness={0.04} />
        </mesh>
      ))}
      <mesh position={[0, -size[1] / 2 + 0.43, size[2] / 2 + 0.055]} castShadow>
        <boxGeometry args={[size[0] * 0.94, 0.82, 0.11]} />
        <meshStandardMaterial color={trimColor} roughness={0.8} />
      </mesh>
      <group position={[size[0] * (seed % 2 ? -0.26 : 0.26), -size[1] / 2 + 0.72, size[2] / 2 + 0.13]}>
        <mesh castShadow><boxGeometry args={[0.52, 1.32, 0.12]} /><meshStandardMaterial color="#3a302b" roughness={0.76} /></mesh>
        <mesh position={[0, 0.02, 0.066]}><planeGeometry args={[0.38, 1.12]} /><meshStandardMaterial color="#72513e" roughness={0.84} /></mesh>
        <mesh position={[0.12, -0.02, 0.075]}><sphereGeometry args={[0.035, 10, 8]} /><meshStandardMaterial color="#c19859" metalness={0.72} roughness={0.34} /></mesh>
      </group>
      <group position={[0, -size[1] / 2 + 1.32, size[2] / 2 + 0.27]} rotation={[0.16, 0, 0]}>
        <mesh castShadow receiveShadow><boxGeometry args={[size[0] * 0.82, 0.07, 0.88]} /><meshStandardMaterial color={awningColor} roughness={0.88} /></mesh>
        {Array.from({ length: 5 }, (_, stripe) => (
          <mesh key={stripe} position={[-size[0] * 0.32 + stripe * size[0] * 0.16, -0.045, 0.02]}>
            <boxGeometry args={[size[0] * 0.075, 0.02, 0.87]} />
            <meshStandardMaterial color={stripe % 2 ? awningColor : "#d4b781"} roughness={0.88} />
          </mesh>
        ))}
      </group>
      {seed % 2 === 0 && (
        <group position={[0, -size[1] / 2 + 2.35, size[2] / 2 + 0.18]}>
          <mesh castShadow><boxGeometry args={[size[0] * 0.72, 0.08, 0.34]} /><meshStandardMaterial color="#403630" roughness={0.78} /></mesh>
          {[-0.28, 0, 0.28].map((factor) => <mesh key={factor} position={[size[0] * factor, 0.3, 0.12]}><boxGeometry args={[0.045, 0.62, 0.045]} /><meshStandardMaterial color="#3e3934" metalness={0.18} roughness={0.68} /></mesh>)}
          <mesh position={[0, 0.3, 0.12]}><boxGeometry args={[size[0] * 0.68, 0.04, 0.04]} /><meshStandardMaterial color="#3e3934" metalness={0.18} roughness={0.68} /></mesh>
        </group>
      )}
      {Array.from({ length: columns * rows }, (_, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        return (
          <group key={index} position={[-size[0] / 2 + (column + 0.5) * size[0] / columns, -size[1] / 2 + 0.62 + row * 0.82, size[2] / 2 + 0.035]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.48, 0.6, 0.09]} />
              <meshStandardMaterial color={trimColor} roughness={0.72} metalness={0.08} />
            </mesh>
            <mesh position={[0, 0, 0.032]}>
              <planeGeometry args={[0.31, 0.43]} />
              <meshStandardMaterial color={(index + seed) % 5 === 0 ? "#d7b56a" : "#28444c"} emissive={(index + seed) % 5 === 0 ? "#d49748" : "#102126"} emissiveIntensity={(index + seed) % 5 === 0 ? 0.72 : 0.22} roughness={0.32} />
            </mesh>
            <mesh position={[0, 0, 0.04]}><boxGeometry args={[0.025, 0.43, 0.02]} /><meshStandardMaterial color="#35302c" roughness={0.78} /></mesh>
            <mesh position={[0, -0.34, 0.055]} castShadow><boxGeometry args={[0.55, 0.08, 0.16]} /><meshStandardMaterial color="#6c5d4c" roughness={0.86} /></mesh>
          </group>
        );
      })}
      <group position={[size[0] * (seed % 2 ? 0.32 : -0.3), size[1] / 2 + 0.52, 0]}>
        <mesh castShadow><boxGeometry args={[0.28, 1.05, 0.34]} /><meshStandardMaterial color="#5f5146" roughness={0.9} /></mesh>
        <mesh position={[0, 0.55, 0]} castShadow><boxGeometry args={[0.4, 0.12, 0.46]} /><meshStandardMaterial color="#463b35" roughness={0.86} /></mesh>
      </group>
    </group>
  );
}

export function UrbanStreetKit({ bounds, presentation }: { bounds: Vector3Tuple; presentation: ScenePresentation }) {
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
    const height = 3.8 + ((index * 7 + side) % 4) * 0.8;
    const depth = 2.4 + ((index + (side > 0 ? 1 : 0)) % 3) * 0.32;
    return {
      position: [side * (bounds[0] / 2 - depth / 2), height / 2, -bounds[2] / 2 + (index + 0.5) * bounds[2] / 6] as Vector3Tuple,
      size: [width, height, depth] as Vector3Tuple,
      rotation: [0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0] as Vector3Tuple,
      color: ["#b49a7f", "#8ca09b", "#b38a72", "#829693", "#c1aa89", "#917a70"][index % 6]!,
      seed: index + (side > 0 ? 11 : 0),
    };
  })), [bounds]);
  return (
    <group>
      <mesh position={[0, 0.018, 0]} receiveShadow>
        <boxGeometry args={[bounds[0], 0.1, bounds[2]]} />
        <meshStandardMaterial
          color={presentation.palette.floor}
          map={surfaces.street.color}
          normalMap={surfaces.street.normal}
          normalScale={new THREE.Vector2(0.46, 0.46)}
          roughnessMap={surfaces.street.arm}
          roughness={0.94}
        />
      </mesh>
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <boxGeometry args={[bounds[0] * 0.42, 0.06, bounds[2]]} />
        <meshStandardMaterial color="#71675b" map={surfaces.street.color} normalMap={surfaces.street.normal} normalScale={new THREE.Vector2(0.58, 0.58)} roughnessMap={surfaces.street.arm} roughness={0.9} />
      </mesh>
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
          <Building position={[0, 0, 0]} size={building.size} color={building.color} seed={building.seed} surface={surfaces.wall} />
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
          <mesh position={[0, 0.62, 0]} castShadow receiveShadow><boxGeometry args={[1.65, 0.12, 0.72]} /><meshStandardMaterial color="#6d4932" roughness={0.88} /></mesh>
          <mesh position={[0, 1.55, -0.08]} rotation={[-0.12, 0, 0]} castShadow><boxGeometry args={[1.85, 0.08, 1.05]} /><meshStandardMaterial color={index % 2 ? "#a9684f" : "#667a70"} roughness={0.9} /></mesh>
          {[-0.72, 0.72].map((x) => <mesh key={x} position={[x, 0.9, -0.36]} castShadow><boxGeometry args={[0.07, 1.8, 0.07]} /><meshStandardMaterial color="#4b3429" roughness={0.9} /></mesh>)}
          {[-0.45, 0, 0.45].map((x, item) => <mesh key={x} position={[x, 0.79, 0]} castShadow><sphereGeometry args={[0.14 + item * 0.015, 12, 8]} /><meshStandardMaterial color={["#b17a4b", "#71835a", "#98645c"][item]} roughness={0.9} /></mesh>)}
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
  return (
    <group>
      {Array.from({ length: 7 }, (_, index) => (
        <mesh key={`floor-panel-${index}`} position={[-bounds[0] / 2 + (index + 0.5) * bounds[0] / 7, 0.075, 0]} receiveShadow>
          <boxGeometry args={[bounds[0] / 7 - 0.035, 0.055, bounds[2] - 0.12]} />
          <meshStandardMaterial color={index % 2 ? "#394346" : "#313a3d"} roughness={0.58} metalness={0.42} />
        </mesh>
      ))}
      {[-0.3, 0.3].map((factor) => (
        <group key={factor} position={[factor * bounds[0], bounds[1] * 0.78, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.11, 0.11, bounds[2], 14]} /><meshStandardMaterial color="#4d5b5c" metalness={0.66} roughness={0.42} /></mesh>
          <mesh position={[0.2, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.045, 0.045, bounds[2], 10]} /><meshStandardMaterial color="#936646" metalness={0.62} roughness={0.48} /></mesh>
        </group>
      ))}
      {[-0.28, 0, 0.28].map((factor) => (
        <group key={factor} position={[factor * bounds[0], bounds[1] - 0.22, 0]}>
          <mesh><boxGeometry args={[1.8, 0.08, 0.22]} /><meshStandardMaterial color="#d7e2df" emissive={presentation.palette.keyLight} emissiveIntensity={1.25} /></mesh>
          <rectAreaLight position={[0, -0.05, 0]} rotation={[Math.PI / 2, 0, 0]} width={1.8} height={0.3} intensity={2.1} color={presentation.palette.keyLight} />
        </group>
      ))}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * bounds[0] * 0.33, 0, -bounds[2] * 0.28]}>
          <mesh position={[0, 0.7, 0]} castShadow receiveShadow><boxGeometry args={[2.2, 1.4, 0.75]} /><meshStandardMaterial color="#354348" metalness={0.48} roughness={0.55} /></mesh>
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
