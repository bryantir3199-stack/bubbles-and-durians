/**
 * Spawn points / paths for castle routes.
 *
 * Prefer empties embedded in castle.glb (sp1–sp6, path1–path4), applied after
 * CastleStage scales (×100) and ground-centers the model. Fallbacks below match
 * the previous hand-tuned layout if markers are missing.
 */

export type SpawnPattern = 'window' | 'door' | 'wall' | 'frontSlide';

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

export interface WallLane {
  y: number;
  z: number;
  minX: number;
  maxX: number;
}

export interface FrontLane {
  y: number;
  z: number;
  minX: number;
  maxX: number;
}

export interface DoorLane {
  inside: Vec3;
  outside: Vec3;
}

/** Four facade windows (towers + wings) — overwritten when castle empties load. */
export let WINDOWS: WindowSpot[] = [
  { id: 'left-tower', x: -155, y: 125, z: 74 },
  { id: 'left-wing', x: -75, y: 135, z: 74 },
  { id: 'right-wing', x: 75, y: 135, z: 74 },
  { id: 'right-tower', x: 155, y: 125, z: 74 },
];

/** Gate transit (path1 → path2 when markers present). */
export let DOOR: DoorLane = {
  inside: { x: 0, y: 28, z: 25 },
  outside: { x: 0, y: 28, z: 130 },
};

/** Battlement / wall-top lane (sp6 + X span when markers present). */
export let WALL_TOP: WallLane = {
  y: 248,
  z: 48,
  minX: -200,
  maxX: 200,
};

/** Horizontal pass in front of the castle (path3/path4 + X span). */
export let FRONT_SLIDE: FrontLane = {
  y: 55,
  z: 175,
  minX: -420,
  maxX: 420,
};

export const PATTERN_WEIGHTS: Record<SpawnPattern, number> = {
  window: 34,
  door: 22,
  wall: 22,
  frontSlide: 22,
};

export interface CastleMarkers {
  spawns: WindowSpot[];
  paths: Vec3[];
}

/**
 * Apply empties from castle.glb:
 * - sp1…spN → window / hold spawn spots
 * - path1 → door inside, path2 → door outside
 * - path3 (and path4 if distinct) → front-slide lane height/depth
 * - sp6 (highest spawn) also seeds wall-top Y/Z; X span from side spawns
 */
export function applyCastleMarkers(markers: CastleMarkers): void {
  if (markers.spawns.length > 0) {
    WINDOWS = markers.spawns.map((s) => ({ ...s }));
  }

  const paths = markers.paths;
  if (paths.length >= 2) {
    const inside = paths[0]!;
    const mid = paths[1]!;
    // path3+ is further into the courtyard (higher Z). Keep mid height so the
    // exit isn't slammed to the ground empty's Y.
    const outside =
      paths.length >= 3
        ? { x: paths[2]!.x, y: mid.y, z: paths[2]!.z }
        : { ...mid };
    DOOR = {
      inside: { ...inside },
      outside,
    };
  }

  const sideXs = markers.spawns.map((s) => s.x);
  const spanFromSpawns =
    sideXs.length >= 2
      ? { minX: Math.min(...sideXs), maxX: Math.max(...sideXs) }
      : { minX: WALL_TOP.minX, maxX: WALL_TOP.maxX };

  // Prefer the highest spawn (typically sp6 / roof) for the wall-top lane.
  if (markers.spawns.length > 0) {
    const roof = markers.spawns.reduce((a, b) => (b.y > a.y ? b : a));
    WALL_TOP = {
      y: roof.y,
      z: roof.z,
      minX: spanFromSpawns.minX,
      maxX: spanFromSpawns.maxX,
    };
  }

  if (paths.length >= 3) {
    const front = paths[2]!;
    const frontB = paths[3] && pointsDiffer(paths[2]!, paths[3]!) ? paths[3]! : null;
    // Empties may sit on the ground plane; lift so target centers aren't buried.
    const frontY = front.y < 20 ? Math.max(front.y, 40) : front.y;
    FRONT_SLIDE = {
      y: frontY,
      z: front.z,
      minX: frontB ? Math.min(front.x, frontB.x) : Math.min(-420, spanFromSpawns.minX * 2.2),
      maxX: frontB ? Math.max(front.x, frontB.x) : Math.max(420, spanFromSpawns.maxX * 2.2),
    };
  }
}

function pointsDiffer(a: Vec3, b: Vec3, eps = 0.5): boolean {
  return Math.abs(a.x - b.x) > eps || Math.abs(a.y - b.y) > eps || Math.abs(a.z - b.z) > eps;
}
