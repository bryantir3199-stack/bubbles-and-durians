/**
 * Spawn points / paths for castle routes.
 *
 * - sp* empties → static window / hold spots
 * - Movers use rebuilt gate paths: off-screen front-left/right → door → inside
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
 * Gate lanes (enter direction). Index 0 = left L, 1 = mirrored right L.
 * Reverse a lane for exits.
 */
export let GATE_PATHS: Vec3[][] = [
  [
    { x: -450, y: 21, z: 240 },
    { x: 0, y: 21, z: 240 },
    { x: 0, y: 21, z: 60 },
    { x: 0, y: 21, z: 28 },
  ],
  [
    { x: 450, y: 21, z: 240 },
    { x: 0, y: 21, z: 240 },
    { x: 0, y: 21, z: 60 },
    { x: 0, y: 21, z: 28 },
  ],
];

/** @deprecated Prefer GATE_PATHS — left lane kept for older call sites. */
export let PATHS: Vec3[] = GATE_PATHS[0]!;

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

  GATE_PATHS = buildGatePaths(markers.door);
  PATHS = GATE_PATHS[0]!;
  DOOR_PLANE_Z = markers.door
    ? (markers.door.minZ + markers.door.maxZ) * 0.5
    : PATHS[2]?.z ?? 60;
}

/**
 * Two mirrored L-routes into the gate:
 *
 *   left start ──────────● corner ●────────── right start
 *                        │
 *                        │ gate
 *                        ▼
 *                      inside
 */
function buildGatePaths(door: DoorBounds | undefined): Vec3[][] {
  const doorZ = door ? (door.minZ + door.maxZ) * 0.5 : 60;
  const doorH = door ? Math.max(8, door.maxY - door.minY) : 86;
  const doorBase = door ? door.minY : 0;
  const travelY = (doorBase + doorH * 0.45) * 0.5;

  // Right-angle corner on the center line, extended toward the camera.
  const cornerZ = doorZ + 180;
  const insideZ = doorZ - 32;
  const startX = 450; // off-screen side distance

  const sharedTail: Vec3[] = [
    { x: 0, y: travelY, z: cornerZ }, // right-angle corner in front of gate
    { x: 0, y: travelY, z: doorZ }, // door threshold
    { x: 0, y: travelY, z: insideZ }, // inside, before back wall
  ];

  return [
    [{ x: -startX, y: travelY, z: cornerZ }, ...sharedTail],
    [{ x: startX, y: travelY, z: cornerZ }, ...sharedTail],
  ];
}

/** True if world Z is near the door plane (for continuous door timing). */
export function nearDoorPlane(z: number, doorZ = DOOR_PLANE_Z, pad = 35): boolean {
  return Math.abs(z - doorZ) <= pad;
}
