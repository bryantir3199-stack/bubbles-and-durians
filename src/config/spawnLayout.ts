/**
 * Spawn points / paths tuned to castle2.glb after ×100 scale + ground centering.
 * Castle ≈ X±228, Y 0–256, front facade ~Z +70; doors at Z≈60, X±15.
 */

export type SpawnPattern = 'window' | 'door' | 'wall' | 'frontSlide';

export interface WindowSpot {
  id: string;
  x: number;
  y: number;
  z: number;
}

/** Four facade windows (towers + wings). */
export const WINDOWS: WindowSpot[] = [
  { id: 'left-tower', x: -155, y: 125, z: 74 },
  { id: 'left-wing', x: -75, y: 135, z: 74 },
  { id: 'right-wing', x: 75, y: 135, z: 74 },
  { id: 'right-tower', x: 155, y: 125, z: 74 },
];

/** Gate threshold (between doors). */
export const DOOR = {
  inside: { x: 0, y: 28, z: 25 },
  outside: { x: 0, y: 28, z: 130 },
};

/** Battlement / wall-top lane (slides along X). */
export const WALL_TOP = {
  y: 248,
  z: 48,
  minX: -200,
  maxX: 200,
};

/** Horizontal pass in front of the castle, off-camera to off-camera. */
export const FRONT_SLIDE = {
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
