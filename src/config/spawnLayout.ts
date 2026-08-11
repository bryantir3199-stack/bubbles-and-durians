/**
 * Spawn points / paths for castle routes.
 *
 * - sp* empties → static window / hold spots
 * - Movers use rebuilt gate paths: off-screen front-left/right → door → inside
 *   (stops before the interior back wall). Built from door mesh bounds.
 * - Plus two elevated U-routes on the keep walls under the dome (CCW / CW).
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

/** First N lanes in GATE_PATHS are ground gate L-routes that open doors. */
export const GATE_LANE_COUNT = 2;

/**
 * Travel lanes. Indices 0–1 = gate L (enter direction); 2–3 = dome wall U (CCW / CW).
 * Reverse a lane via pathForward for the opposite travel sense.
 */
export let GATE_PATHS: Vec3[][] = [...buildGatePaths(undefined), ...buildDomeWallPaths()];

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

  GATE_PATHS = [...buildGatePaths(markers.door), ...buildDomeWallPaths()];
  PATHS = GATE_PATHS[0]!;
  DOOR_PLANE_Z = markers.door
    ? (markers.door.minZ + markers.door.maxZ) * 0.5
    : PATHS[2]?.z ?? 60;
}

/** Ground gate L-lanes only — elevated wall routes must not swing the doors. */
export function pathUsesDoors(pathIndex: number): boolean {
  return pathIndex >= 0 && pathIndex < GATE_LANE_COUNT;
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

/**
 * Two elevated U≈O routes on the keep walls just under the dome.
 * Straight segments + 90° corners; start/end behind the dome with a small gap.
 *
 *        back gap (start/end)
 *     ●───────────  ───────────●
 *     │                        │
 *     │         (dome)         │
 *     │                        │
 *     ●────────────────────────●
 *              front
 *
 * Index 0 = CCW (left wall first), index 1 = CW (right wall first).
 * Slight radial inset so both lanes can run at once.
 *
 * Anchored to the roof ledge under the dome (~Y 156, X ±97, Z −61…36),
 * a step above the lower battlement crest (~Y 132).
 */
function buildDomeWallPaths(): Vec3[][] {
  // Just above the under-dome ledge; dome body begins ~Y 206.
  const y = 160;
  const gap = 20; // opening behind the dome (almost closes the O)

  const outer = rectUPath({
    y,
    halfX: 88,
    frontZ: 30,
    backZ: -52,
    gap,
    ccw: true,
  });
  const inner = rectUPath({
    y: y - 2,
    halfX: 74,
    frontZ: 18,
    backZ: -46,
    gap: gap - 4,
    ccw: false,
  });

  return [outer, inner];
}

function rectUPath(opts: {
  y: number;
  halfX: number;
  frontZ: number;
  backZ: number;
  gap: number;
  ccw: boolean;
}): Vec3[] {
  const { y, halfX, frontZ, backZ, gap, ccw } = opts;
  // CCW: emerge behind-left → left → front → right → tuck behind-right
  const ccwPts: Vec3[] = [
    { x: -gap, y, z: backZ },
    { x: -halfX, y, z: backZ },
    { x: -halfX, y, z: frontZ },
    { x: halfX, y, z: frontZ },
    { x: halfX, y, z: backZ },
    { x: gap, y, z: backZ },
  ];
  if (ccw) return ccwPts;
  // CW = reverse order (different travel direction on the twin lane).
  return [...ccwPts].reverse();
}

/** True if world Z is near the door plane (for continuous door timing). */
export function nearDoorPlane(z: number, doorZ = DOOR_PLANE_Z, pad = 35): boolean {
  return Math.abs(z - doorZ) <= pad;
}
