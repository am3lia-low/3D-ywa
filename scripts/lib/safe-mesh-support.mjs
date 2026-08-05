import * as THREE from "three";

const SAMPLE_OFFSETS = [
  [0, 0],
  [-0.04, 0],
  [0.04, 0],
  [0, -0.04],
  [0, 0.04],
];

/** Measures the first visible surface beneath the normalized asset center. */
export function measureSafeMeshSupportSurfaceY(document) {
  const root = new THREE.Group();
  for (const entry of document.meshes ?? []) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(entry.positions, 3));
    if (entry.indices) geometry.setIndex(entry.indices);
    geometry.computeVertexNormals();
    root.add(new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    ));
  }
  root.updateMatrixWorld(true);
  let measured = null;
  for (const [x, z] of SAMPLE_OFFSETS) {
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(x, 2, z),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = raycaster.intersectObject(root, true)[0];
    if (hit) {
      measured = hit.point.y;
      break;
    }
  }
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    object.material.dispose();
  });
  return measured === null ? null : Math.min(1, Math.max(0, measured));
}
