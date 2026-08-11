import * as THREE from 'three';
import { GATE_LANE_COUNT, GATE_PATHS } from '../config/spawnLayout';

const LANE_COLORS = [0xff6644, 0x44aaff, 0xffdd33, 0x66ff99];

/** True when the page was loaded with ?debugPaths=1 (or bare ?debugPaths). */
export function wantsPathDebug(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('debugPaths')) return false;
  const v = params.get('debugPaths');
  return v === null || v === '' || v === '1' || v === 'true';
}

/**
 * Prefer elevated dome U lanes (indices ≥ GATE_LANE_COUNT) when ?domeOnly=1.
 * Useful for verifying wall routes without waiting on gate L traffic.
 */
export function wantsDomeOnly(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('domeOnly')) return false;
  const v = params.get('domeOnly');
  return v === null || v === '' || v === '1' || v === 'true';
}

/**
 * Draw GATE_PATHS as colored polylines + waypoint spheres.
 * Gate L = orange/blue, dome U = yellow/green.
 */
export function createPathDebugGroup(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'path-debug';

  GATE_PATHS.forEach((lane, index) => {
    if (lane.length < 2) return;
    const color = LANE_COLORS[index % LANE_COLORS.length]!;
    const pts = lane.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color, depthTest: true }),
    );
    root.add(line);

    const sphereGeo = new THREE.SphereGeometry(4, 8, 8);
    const sphereMat = new THREE.MeshBasicMaterial({ color });
    for (const p of pts) {
      const s = new THREE.Mesh(sphereGeo, sphereMat);
      s.position.copy(p);
      root.add(s);
    }

    // Larger sphere marks the authored start (forward direction).
    const start = pts[0]!;
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(7, 8, 8),
      new THREE.MeshBasicMaterial({ color }),
    );
    marker.position.set(start.x, start.y + 14, start.z);
    root.add(marker);

    // Dim gate lanes slightly vs dome lanes when both are shown.
    if (index < GATE_LANE_COUNT) {
      (line.material as THREE.LineBasicMaterial).opacity = 0.55;
      (line.material as THREE.LineBasicMaterial).transparent = true;
    }
  });

  return root;
}
