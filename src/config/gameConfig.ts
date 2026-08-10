export type GameMode = 'endless' | 'timed';

export const gameConfig = {
  startLives: 3,
  maxLives: 5,
  magazineSize: 7,
  reloadMs: 400,
  timedSeconds: 180,
  /** Hard cap — never more than this many live targets */
  maxTargets: 6,
  /** Prior cadence was 3800/2200; +30% spawn rate → intervals / 1.3. */
  spawnIntervalMs: 2920,
  minSpawnIntervalMs: 1690,
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
