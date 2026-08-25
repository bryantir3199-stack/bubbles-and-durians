/**
 * Spawn points / paths for castle routes.
 *
 * - sp* empties → static window / hold spots
 * - Movers use rebuilt gate paths: off-screen front-left/right → door → inside
 *   (stops before the interior back wall). Built from door mesh bounds.
 * - Plus two elevated U-routes on the keep walls under the dome (CCW / CW).
 * - Occasional close-camera pops (left / middle / right) that rise from below.
 */

export type SpawnPattern = 'window' | 'path' | 'close';

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
 * Foreground pops just in front of the play camera (cam ≈ 0,110,635 → lookAt y=110).
 * ~70u ahead — clearly closer than castle holds, without eating the whole frame.
 * Hold Y sits near the frustum floor so a bit of the lower body clips.
 */
export const CLOSE_SPOTS: WindowSpot[] = [
  { id: 'close-left', x: -32, y: 90, z: 565 },
  { id: 'close-middle', x: 0, y: 90, z: 565 },
  { id: 'close-right', x: 32, y: 90, z: 565 },
];

/** How far below the hold Y a close target starts (and sinks past) the frame. */
export const CLOSE_RISE_HEIGHT = 100;
/** Seconds for the rise-from-below entrance. */
export const CLOSE_RISE_DURATION = 0.5;
/** Close-camera bubbles pop up faster than other close targets. */
export const CLOSE_BUBBLE_RISE_DURATION = 0.25;
/** Seconds to sink fully below the frame before despawn. */
export const CLOSE_SINK_DURATION = 0.55;

/** First N lanes in GATE_PATHS are ground gate L-routes that open doors. */
export const GATE_LANE_COUNT = 2;

/** Dome wall U lane index (after gate L lanes). */
export const DOME_PATH_INDEX = GATE_LANE_COUNT;

/**
 * Timed-only teeth flyby: lawn dash behind the keep.
 * Excluded from RNG path spawns; only forceSpawn uses it.
 */
export const TEETH_FLYBY_PATH_INDEX = GATE_LANE_COUNT + 1;
/** Half-span so the teeth clear the frustum before appearing. */
export const TEETH_FLYBY_START_X = 820;
/** Lawn depth just behind the keep. */
export const TEETH_FLYBY_Z = -100;

/**
 * Travel lanes. Indices 0–1 = gate L (enter direction); 2 = dome wall U (CCW);
 * 3 = teeth L→R flyby (scripted only).
 * Reverse a lane via pathForward for the opposite travel sense.
 */
export let GATE_PATHS: Vec3[][] = [
  ...buildGatePaths(undefined),
  ...buildDomeWallPaths(),
  ...buildTeethFlybyPath(),
];

/** @deprecated Prefer GATE_PATHS — left lane kept for older call sites. */
export let PATHS: Vec3[] = GATE_PATHS[0]!;

/** Door plane Z — open doors while a mover crosses this. */
export let DOOR_PLANE_Z = 60;

/** Close is intentionally rare vs window/path castle traffic. */
export const PATTERN_WEIGHTS: Record<SpawnPattern, number> = {
  window: 45,
  path: 55,
  close: 14,
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

  GATE_PATHS = [
    ...buildGatePaths(markers.door),
    ...buildDomeWallPaths(),
    ...buildTeethFlybyPath(),
  ];
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
 * One elevated U≈O route on the keep battlement crest under the dome.
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
 * Authored CCW (left wall first); reverse via pathForward for the opposite sense.
 *
 * Raycasted crest top: Y ≈ 132.2, outer lip X ≈ ±105–107, front Z ≈ 67–70.
 * Path Y is the target CENTER; targets are ~34 tall, so centers sit at
 * crestTop + halfHeight so the base rests on the battlement instead of
 * burying through it.
 */
function buildDomeWallPaths(): Vec3[][] {
  const crestTop = 132.2;
  const targetHalfHeight = 34.375 * 0.5;
  // Target centers: base (~center − halfHeight) lands on the merlon tops.
  const y = crestTop + targetHalfHeight;
  const gap = 32;

  return [
    rectUPath({
      y,
      halfX: 112,
      frontZ: 69,
      backZ: -55,
      gap,
      ccw: true,
    }),
  ];
}

/**
 * Reference lane for the timed teeth flyby (debug draw / index slot).
 * Runtime travel is rebuilt in Target: start side → mid → continue or U-turn.
 */
function buildTeethFlybyPath(): Vec3[][] {
  const targetHalfHeight = 34.375 * 0.5;
  const y = -0.5 + targetHalfHeight;
  return [
    [
      { x: -TEETH_FLYBY_START_X, y, z: TEETH_FLYBY_Z },
      { x: 0, y, z: TEETH_FLYBY_Z },
      { x: TEETH_FLYBY_START_X, y, z: TEETH_FLYBY_Z },
    ],
  ];
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
  // Explicit 90° corners + mid-edge points so the U reads as straight segments.
  // CCW: emerge behind-left → left → front → right → tuck behind-right
  const ccwPts: Vec3[] = [
    { x: -gap, y, z: backZ },
    { x: -halfX, y, z: backZ },
    { x: -halfX, y, z: (backZ + frontZ) * 0.5 },
    { x: -halfX, y, z: frontZ },
    { x: 0, y, z: frontZ },
    { x: halfX, y, z: frontZ },
    { x: halfX, y, z: (backZ + frontZ) * 0.5 },
    { x: halfX, y, z: backZ },
    { x: gap, y, z: backZ },
  ];
  if (ccw) return ccwPts;
  return [...ccwPts].reverse();
}

/** True if world Z is near the door plane (for continuous door timing). */
export function nearDoorPlane(z: number, doorZ = DOOR_PLANE_Z, pad = 35): boolean {
  return Math.abs(z - doorZ) <= pad;
}
