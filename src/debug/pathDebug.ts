import * as THREE from 'three';
import { computeTimedRunTally, type TimedRunTally } from '../config/gameConfig';
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
 * Force close-camera left/middle/right rises when ?closeOnly=1.
 * Useful for verifying foreground pops without waiting on rare RNG.
 */
export function wantsCloseOnly(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('closeOnly')) return false;
  const v = params.get('closeOnly');
  return v === null || v === '' || v === '1' || v === 'true';
}

/** Force path durian+bubble pairs when ?pathPairs=1 (for testing chase/sweat). */
export function wantsPathPairsOnly(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('pathPairs')) return false;
  const v = params.get('pathPairs');
  return v === null || v === '' || v === '1' || v === 'true';
}

/**
 * Teeth-only debug: skip menus, start Timed Blitz, suppress other targets,
 * and spawn the flyby ~1s in (then again after each pass).
 * `?teeth=1`
 */
export function wantsTeethFlybyNow(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('teeth')) return false;
  const v = params.get('teeth');
  return v === null || v === '' || v === '1' || v === 'true';
}

/**
 * Skip to the timed bonus-tally screen with sample scores.
 * `?tally=1`
 */
export function wantsBonusTallyPreview(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('tally')) return false;
  const v = params.get('tally');
  return v === null || v === '' || v === '1' || v === 'true';
}

/**
 * Skip to the ranking screen with a full 100-score demo board.
 * `?ranking=1`
 */
export function wantsRankingPreview(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('ranking')) return false;
  const v = params.get('ranking');
  return v === null || v === '' || v === '1' || v === 'true';
}

/** Optional `?place=71` rank used with `?ranking=1` to preview intro scroll. */
export function rankingPreviewPlace(): number | null {
  const raw = new URLSearchParams(window.location.search).get('place');
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

/** Sample timed breakdown for `?tally=1`. */
export function dummyTimedTally(): TimedRunTally {
  return computeTimedRunTally({
    durianScore: 4_200,
    goldScore: 2_800,
    teethScore: 5_000,
    bubbleScore: 0,
    bubblesHit: 0,
    shotsFired: 80,
    accurateHits: 80,
    finishCombo: 5,
    timedPreset: 'short',
  });
}

/**
 * Draw GATE_PATHS as thick segment beams + waypoint spheres.
 * Uses depth test so behind-dome segments do not fake mid-dome rings.
 * Gate L = orange/blue, dome U = yellow/green.
 */
export function createPathDebugGroup(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'path-debug';
  const domeOnly = wantsDomeOnly();
  const mid = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const quat = new THREE.Quaternion();

  GATE_PATHS.forEach((lane, index) => {
    if (lane.length < 2) return;
    if (domeOnly && index < GATE_LANE_COUNT) return;

    const color = LANE_COLORS[index % LANE_COLORS.length]!;
    const pts = lane.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const mat = new THREE.MeshBasicMaterial({
      color,
      depthTest: true,
      transparent: true,
      opacity: 0.92,
    });

    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const len = a.distanceTo(b);
      if (len < 0.01) continue;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(3.5, 3.5, len), mat);
      mid.lerpVectors(a, b, 0.5);
      dir.subVectors(b, a).normalize();
      quat.setFromUnitVectors(zAxis, dir);
      beam.position.copy(mid);
      beam.quaternion.copy(quat);
      // Nudge slightly up so beams sit on top of crest polys.
      beam.position.y += 2;
      root.add(beam);
    }

    const sphereGeo = new THREE.SphereGeometry(5, 10, 10);
    for (const p of pts) {
      const s = new THREE.Mesh(sphereGeo, mat);
      s.position.copy(p);
      s.position.y += 2;
      root.add(s);
    }

    // Larger sphere marks the authored start (forward direction).
    const start = pts[0]!;
    const marker = new THREE.Mesh(new THREE.SphereGeometry(9, 10, 10), mat);
    marker.position.set(start.x, start.y + 16, start.z);
    root.add(marker);
  });

  return root;
}
