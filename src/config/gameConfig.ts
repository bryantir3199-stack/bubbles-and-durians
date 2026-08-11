export type GameMode = 'endless' | 'timed';

export const gameConfig = {
  startLives: 3,
  maxLives: 5,
  magazineSize: 7,
  /** Delay between each ammo pip filling during reload. */
  reloadShellMs: 85,
  timedSeconds: 180,
  /** Hard cap — never more than this many live targets */
  maxTargets: 6,
  /** Prior cadence was 3800/2200; +30% spawn rate → intervals / 1.3. */
  spawnIntervalMs: 2920,
  minSpawnIntervalMs: 1690,
  /**
   * After a target leaves a window/path, keep that slot unavailable so the
   * next spawn cannot pop in the same place immediately.
   */
  spawnSlotCooldownMs: 1400,
  targetSize: 34.375,
  heartSize: 16,
  goldSize: 24,
  points: {
    durian: 1,
    goldDurian: 7,
    bubble: -10,
  },
  /** Combo multiplier caps at this value (2x / 3x / 4x). */
  maxCombo: 4,
  /** Successful durian hits needed to raise combo by one level. */
  shotsPerComboLevel: 4,
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
