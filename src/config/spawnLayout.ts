/**
 * Spawn points / paths for castle routes.
 *
 * Empties from castle.glb (after ×100 scale + ground-centering):
 * - sp1…spN → static hold / window spots
 * - path1…pathN → ordered waypoints for moving targets (travel these only)
 */

export type SpawnPattern = 'window' | 'path';

export interface WindowSpot {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Static hold spots — overwritten when castle empties load. */
export let WINDOWS: WindowSpot[] = [
  { id: 'left-tower', x: -155, y: 125, z: 74 },
  { id: 'left-wing', x: -75, y: 135, z: 74 },
  { id: 'right-wing', x: 75, y: 135, z: 74 },
  { id: 'right-tower', x: 155, y: 125, z: 74 },
];

/**
 * Ordered path waypoints (path1 → path2 → …). Moving targets travel this
 * polyline only (or reversed). Overwritten when castle empties load.
 */
export let PATHS: Vec3[] = [
  { x: 0, y: 28, z: 25 },
  { x: 0, y: 28, z: 90 },
  { x: 0, y: 28, z: 130 },
];

/** Approximate door plane Z (world) — used to decide which path segment opens doors. */
export let DOOR_PLANE_Z = 60;

export const PATTERN_WEIGHTS: Record<SpawnPattern, number> = {
  window: 45,
  path: 55,
};

export interface CastleMarkers {
  spawns: WindowSpot[];
  paths: Vec3[];
  /** Optional world-space door plane Z from door meshes. */
  doorZ?: number;
}

/**
 * Apply empties from castle.glb.
 * Consecutive duplicate path points are collapsed.
 */
export function applyCastleMarkers(markers: CastleMarkers): void {
  if (markers.spawns.length > 0) {
    WINDOWS = markers.spawns.map((s) => ({ ...s }));
  }

  if (markers.paths.length > 0) {
    const deduped: Vec3[] = [];
    for (const p of markers.paths) {
      const prev = deduped[deduped.length - 1];
      if (!prev || pointsDiffer(prev, p)) deduped.push({ ...p });
    }
    if (deduped.length >= 2) {
      // Path empties may sit on the ground for depth markers (path3/path4). Keep
      // authored XZ (toward/away from camera) but stabilize Y to corridor height
      // so movers don't dive/climb between waypoints.
      PATHS = stabilizePathHeights(deduped);
      if (typeof markers.doorZ === 'number' && Number.isFinite(markers.doorZ)) {
        DOOR_PLANE_Z = markers.doorZ;
      } else {
        // Prefer a segment that straddles a facade-like Z; else midpoint of longest span.
        let chosen: number | null = null;
        for (let i = 0; i < deduped.length - 1; i++) {
          const lo = Math.min(deduped[i]!.z, deduped[i + 1]!.z);
          const hi = Math.max(deduped[i]!.z, deduped[i + 1]!.z);
          if (lo < 55 && hi > 55) {
            chosen = 55;
            break;
          }
        }
        if (chosen == null) {
          let best = 0;
          let bestDz = -1;
          for (let i = 0; i < deduped.length - 1; i++) {
            const dz = Math.abs(deduped[i + 1]!.z - deduped[i]!.z);
            if (dz > bestDz) {
              bestDz = dz;
              best = i;
            }
          }
          chosen = (deduped[best]!.z + deduped[best + 1]!.z) * 0.5;
        }
        DOOR_PLANE_Z = chosen;
      }
    }
  }
}

function pointsDiffer(a: Vec3, b: Vec3, eps = 0.5): boolean {
  return Math.abs(a.x - b.x) > eps || Math.abs(a.y - b.y) > eps || Math.abs(a.z - b.z) > eps;
}

/**
 * Keep XZ from empties; set Y to the median of elevated points so travel reads as
 * depth (closer/further) rather than rising/falling from the sky.
 */
function stabilizePathHeights(points: Vec3[]): Vec3[] {
  const elevated = points.filter((p) => p.y >= 20);
  if (elevated.length === 0) return points.map((p) => ({ ...p }));
  const ys = elevated.map((p) => p.y).sort((a, b) => a - b);
  const corridorY = ys[Math.floor(ys.length / 2)]!;
  return points.map((p) => ({ x: p.x, y: corridorY, z: p.z }));
}

/** True if the segment a→b crosses (or ends at) the door plane. */
export function segmentCrossesDoor(a: Vec3, b: Vec3, doorZ = DOOR_PLANE_Z): boolean {
  const da = a.z - doorZ;
  const db = b.z - doorZ;
  // Different sides of the door plane, or either endpoint very near it.
  return da * db <= 0 || Math.abs(da) < 8 || Math.abs(db) < 8;
}
