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

function Building({ position, size, color, seed }: { position: Vector3Tuple; size: Vector3Tuple; color: string; seed: number }) {
  const columns = Math.max(2, Math.floor(size[0] / 0.8));
  const rows = Math.max(2, Math.floor(size[1] / 0.9));
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.92} />
      </mesh>
      {Array.from({ length: columns * rows }, (_, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        return (
          <mesh key={index} position={[-size[0] / 2 + (column + 0.5) * size[0] / columns, -size[1] / 2 + 0.62 + row * 0.82, size[2] / 2 + 0.011]}>
            <planeGeometry args={[0.34, 0.46]} />
            <meshStandardMaterial color={(index + seed) % 5 === 0 ? "#d7b56a" : "#28444c"} emissive={(index + seed) % 5 === 0 ? "#765229" : "#102126"} emissiveIntensity={0.28} roughness={0.36} />
          </mesh>
        );
      })}
    </group>
  );
}

export function UrbanStreetKit({ bounds, presentation }: { bounds: Vector3Tuple; presentation: ScenePresentation }) {
  const facades = useMemo(() => [-1, 1].flatMap((side) => Array.from({ length: 6 }, (_, index) => {
    const width = bounds[2] / 6 - 0.25;
    const height = 3.8 + ((index * 7 + side) % 4) * 0.8;
    return {
      position: [side * (bounds[0] / 2 - 0.52), height / 2, -bounds[2] / 2 + (index + 0.5) * bounds[2] / 6] as Vector3Tuple,
      size: [0.95, height, width] as Vector3Tuple,
      rotation: [0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0] as Vector3Tuple,
      color: ["#776d63", "#65706f", "#866f61", "#596969"][index % 4]!,
      seed: index + (side > 0 ? 11 : 0),
    };
  })), [bounds]);
  return (
    <group>
      <mesh position={[0, 0.018, 0]} receiveShadow>
        <boxGeometry args={[bounds[0], 0.1, bounds[2]]} />
        <meshStandardMaterial color={presentation.palette.floor} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <boxGeometry args={[bounds[0] * 0.42, 0.06, bounds[2]]} />
        <meshStandardMaterial color="#31383a" roughness={0.88} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * bounds[0] * 0.34, 0.13, 0]} receiveShadow>
          <boxGeometry args={[bounds[0] * 0.22, 0.12, bounds[2]]} />
          <meshStandardMaterial color="#8b8274" roughness={0.96} />
        </mesh>
      ))}
      {facades.map((building, index) => (
        <group key={index} position={building.position} rotation={building.rotation}>
          <Building position={[0, 0, 0]} size={building.size} color={building.color} seed={building.seed} />
        </group>
      ))}
      {[-1, 1].flatMap((side) => [-0.34, 0, 0.34].map((factor, index) => (
        <group key={`${side}:${index}`} position={[side * bounds[0] * 0.25, 0, bounds[2] * factor]}>
          <mesh position={[0, 1.25, 0]} castShadow><cylinderGeometry args={[0.04, 0.06, 2.5, 10]} /><meshStandardMaterial color="#273638" metalness={0.68} roughness={0.45} /></mesh>
          <mesh position={[0, 2.48, 0]}><sphereGeometry args={[0.13, 14, 10]} /><meshStandardMaterial color={presentation.palette.practical} emissive={presentation.palette.practical} emissiveIntensity={1.1} /></mesh>
          <pointLight position={[0, 2.42, 0]} color={presentation.palette.practical} intensity={0.7} distance={5} />
        </group>
      )))}
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
