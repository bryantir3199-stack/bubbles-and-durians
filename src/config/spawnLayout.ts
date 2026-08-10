/**
 * Spawn points / paths for castle routes.
 *
 * - sp* empties → static window / hold spots
 * - Movers use a rebuilt gate path: off-screen front-left → door → inside
 *   (stops before the interior back wall). Built from door mesh bounds.
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
 * Enter direction: off-screen left → right-angle in front of gate → inside.
 * Reverse the array for exits.
 */
export let PATHS: Vec3[] = [
  { x: -450, y: 42, z: 105 },
  { x: 0, y: 42, z: 105 },
  { x: 0, y: 42, z: 60 },
  { x: 0, y: 42, z: 28 },
];

/** Door plane Z — open doors while a mover crosses this. */
export let DOOR_PLANE_Z = 60;

export const PATTERN_WEIGHTS: Record<SpawnPattern, number> = {
  window: 45,
  path: 55,
};

export interface CastleMarkers {
  spawns: WindowSpot[];
  paths: Vec3[];
  door?: DoorBounds;
}

export function applyCastleMarkers(markers: CastleMarkers): void {
  if (markers.spawns.length > 0) {
    WINDOWS = markers.spawns.map((s) => ({ ...s }));
  }

  PATHS = buildGatePath(markers.door);
  DOOR_PLANE_Z = markers.door
    ? (markers.door.minZ + markers.door.maxZ) * 0.5
    : PATHS[2]?.z ?? 60;
}

/**
 * Off-screen left → right-angle corner in front of the gate → through the door
 * → stop inside (before the back wall).
 *
 * Top-down (X right, Z toward camera/front):
 *
 *   start ──────────● corner
 *                   │
 *                   │ gate
 *                   ▼
 *                 inside
 */
function buildGatePath(door: DoorBounds | undefined): Vec3[] {
  const doorZ = door ? (door.minZ + door.maxZ) * 0.5 : 60;
  const doorH = door ? Math.max(8, door.maxY - door.minY) : 86;
  const doorBase = door ? door.minY : 0;
  const travelY = doorBase + doorH * 0.45;

  // Right-angle corner sits just in front of the gate on the center line.
  const cornerZ = doorZ + 45;
  const insideZ = doorZ - 32;
  const startX = -450; // off-screen left

  return [
    { x: startX, y: travelY, z: cornerZ }, // off-screen left, same depth as corner
    { x: 0, y: travelY, z: cornerZ }, // right-angle corner in front of gate
    { x: 0, y: travelY, z: doorZ }, // door threshold
    { x: 0, y: travelY, z: insideZ }, // inside, before back wall
  ];
}

/** True if world Z is near the door plane (for continuous door timing). */
export function nearDoorPlane(z: number, doorZ = DOOR_PLANE_Z, pad = 35): boolean {
  return Math.abs(z - doorZ) <= pad;
}
