export type GameMode = 'endless' | 'timed';

export const gameConfig = {
  startLives: 3,
  maxLives: 5,
  magazineSize: 7,
  reloadMs: 400,
  timedSeconds: 180,
  maxTargets: 8,
  spawnIntervalMs: 850,
  minSpawnIntervalMs: 400,
  /** Approximate world-space size for free-roaming targets */
  targetSize: 22,
  heartSize: 16,
  goldSize: 24,
  points: {
    durian: 1,
    goldDurian: 3,
    bubble: -1,
  },
  hitsRequired: {
    durian: 1,
    goldDurian: 4,
    bubble: 1,
    heart: 1,
  },
  lifetimeMs: {
    durian: { min: 4500, max: 7000 },
    goldDurian: { min: 5500, max: 8500 },
    bubble: { min: 4000, max: 6500 },
    heart: { min: 4000, max: 6000 },
  },
  /** Hop around the castle grounds (courtyard + front yard) */
  roamBounds: {
    minX: -200,
    maxX: 200,
    minZ: -30,
    maxZ: 190,
  },
  /** Resting height of target center above ground */
  groundY: 14,
  hop: {
    heightMin: 28,
    heightMax: 62,
    /** Horizontal travel per hop (world units) */
    distanceMin: 35,
    distanceMax: 90,
    durationMin: 0.38,
    durationMax: 0.62,
    /** Pause on the ground between hops (seconds) */
    dwellMin: 0.12,
    dwellMax: 0.35,
  },
  spawnWeights: {
    endless: {
      durian: 55,
      goldDurian: 12,
      bubble: 25,
      heart: 8,
    },
    timed: {
      durian: 58,
      goldDurian: 15,
      bubble: 27,
      heart: 0,
    },
  },
} as const;

export type TargetKind = 'durian' | 'goldDurian' | 'bubble' | 'heart';
