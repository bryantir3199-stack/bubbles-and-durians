/**
 * Spawn points / paths for castle routes.
 *
 * - sp* empties → static window / hold spots (world positions from the GLB)
 * - Moving targets use hand-authored gate paths that mirror the GLB path *layout*
 *   (center-line inside → door → outside), built from the door mesh bounds — not
 *   the raw path* empty coordinates.
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

export interface DoorBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** Static hold spots — overwritten when castle empties load. */
export let WINDOWS: WindowSpot[] = [
  { id: 'left-tower', x: -155, y: 125, z: 74 },
  { id: 'left-wing', x: -75, y: 135, z: 74 },
  { id: 'right-wing', x: 75, y: 135, z: 74 },
  { id: 'right-tower', x: 155, y: 125, z: 74 },
];

/**
 * Gate transit waypoints (inside → threshold → outside). Rebuilt from door
 * bounds to match the GLB path layout without using empty world coords.
 */
export let PATHS: Vec3[] = [
  { x: 0, y: 42, z: 5 },
  { x: 0, y: 42, z: 60 },
  { x: 0, y: 42, z: 165 },
];

/** Door plane Z — segments that cross this open the doors. */
export let DOOR_PLANE_Z = 60;

export const PATTERN_WEIGHTS: Record<SpawnPattern, number> = {
  window: 45,
  path: 55,
};

export interface CastleMarkers {
  spawns: WindowSpot[];
  /** Raw path empties — used only as a layout hint (ordering / depth bias). */
  paths: Vec3[];
  door?: DoorBounds;
}

/**
 * Apply castle markers: window empties as-is; rebuild movement paths from the
 * door mesh so targets travel a clean center-line gate route.
 */
export function applyCastleMarkers(markers: CastleMarkers): void {
  if (markers.spawns.length > 0) {
    WINDOWS = markers.spawns.map((s) => ({ ...s }));
  }

  PATHS = buildGatePath(markers.door, markers.paths);
  DOOR_PLANE_Z = PATHS.length >= 2 ? PATHS[1]!.z : 60;
}

/**
 * Build inside → gate → outside on X=0 at a constant height through the doorway.
 * Depth extents follow the GLB path layout (back / door / front) when available,
 * otherwise fall back to offsets from the door plane.
 */
function buildGatePath(door: DoorBounds | undefined, layoutHint: Vec3[]): Vec3[] {
  const doorZ = door ? (door.minZ + door.maxZ) * 0.5 : 60;
  const doorH = door ? Math.max(8, door.maxY - door.minY) : 86;
  const doorBase = door ? door.minY : 0;
  // Center of the opening — clear of the sill and lintel.
  const travelY = doorBase + doorH * 0.45;

  // Sort unique layout hints by Z to recover inside → outside ordering.
  const hints: Vec3[] = [];
  for (const p of layoutHint) {
    const prev = hints[hints.length - 1];
    if (!prev || Math.abs(prev.z - p.z) > 0.5 || Math.abs(prev.x - p.x) > 0.5) {
      hints.push({ ...p });
    }
  }
  hints.sort((a, b) => a.z - b.z);

  let insideZ: number;
  let outsideZ: number;
  if (hints.length >= 2) {
    insideZ = hints[0]!.z;
    outsideZ = hints[hints.length - 1]!.z;
    // Keep a clear inside/outside split around the door even if empties bunch up.
    if (insideZ > doorZ - 20) insideZ = doorZ - 55;
    if (outsideZ < doorZ + 20) outsideZ = doorZ + 110;
  } else {
    insideZ = doorZ - 55;
    outsideZ = doorZ + 110;
  }

  return [
    { x: 0, y: travelY, z: insideZ },
    { x: 0, y: travelY, z: doorZ },
    { x: 0, y: travelY, z: outsideZ },
  ];
}

/** True if the segment a→b crosses (or ends at) the door plane. */
export function segmentCrossesDoor(a: Vec3, b: Vec3, doorZ = DOOR_PLANE_Z): boolean {
  const da = a.z - doorZ;
  const db = b.z - doorZ;
  return da * db <= 0 || Math.abs(da) < 8 || Math.abs(db) < 8;
}
