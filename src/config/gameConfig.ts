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
  /** Prior cadence was 2920/1690; ~12% faster spawn rate → intervals / 1.12. */
  spawnIntervalMs: 2610,
  minSpawnIntervalMs: 1510,
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
  /**
   * Spawn mix (timed): durian : bubble : gold = 20 : 10 : 1
   * (~64% / ~32% / ~3%). Gold is weighted lower than a flat 6:3:1
   * because multi-hit golds linger and feel more common than their rate.
   * Endless keeps a small heart weight on top of the same 20:10:1 core.
   */
  spawnWeights: {
    endless: {
      durian: 20,
      goldDurian: 1,
      bubble: 10,
      heart: 2,
    },
    timed: {
      durian: 20,
      goldDurian: 1,
      bubble: 10,
      heart: 0,
    },
  },
} as const;

export type TargetKind = 'durian' | 'goldDurian' | 'bubble' | 'heart';
