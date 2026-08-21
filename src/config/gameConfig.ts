export type GameMode = 'endless' | 'timed' | 'tutorial';
export type RankedMode = 'endless' | 'timed';
export type TimedPreset = 'short' | 'medium' | 'long';

export interface TimedPresetConfig {
  seconds: number;
  finalBoostSeconds: number;
  label: string;
}

export const timedPresets: Record<TimedPreset, TimedPresetConfig> = {
  short: { seconds: 90, finalBoostSeconds: 20, label: 'Short' },
  medium: { seconds: 180, finalBoostSeconds: 30, label: 'Medium' },
  long: { seconds: 360, finalBoostSeconds: 30, label: 'Long' },
};

export const defaultTimedPreset: TimedPreset = 'medium';

export function getTimedPreset(preset: TimedPreset = defaultTimedPreset): TimedPresetConfig {
  return timedPresets[preset];
}

export const gameConfig = {
  startLives: 3,
  maxLives: 5,
  magazineSize: 7,
  /** Delay between each ammo pip filling during reload. */
  reloadShellMs: 85,
  /** Hard cap — never more than this many live targets */
  maxTargets: 6,
  /** Prior cadence was 2920/1690; ~12% faster spawn rate → intervals / 1.12. */
  spawnIntervalMs: 2610,
  minSpawnIntervalMs: 1510,
  /** Timed mode: multiply spawn rate by this during the final boost window (2.25 = +125%). */
  timedFinalSpawnRateMult: 2.25,
  /**
   * Opening grace period (ms): no close-camera pops and no gold durians
   * so the first half-minute stays readable.
   */
  earlyGameGraceMs: 30_000,
  /**
   * Endless mode: linear spawn-rate growth over non-Frenzy play time.
   * +0.25 per minute → +25%/min (2.5× soft cap at 6 min).
   * Ramp pauses during Frenzy; Frenzy multiplies on top of the frozen ramp.
   */
  endlessSpawnRatePerMinute: 0.25,
  /** Endless mode: soft cap on the time-based rate multiplier (before Frenzy). */
  endlessSpawnRateMaxMult: 2.5,
  /**
   * Endless mode: points earned toward filling the frenzy meter.
   * When full, a frenzy triggers and the meter resets to 0.
   */
  frenzyMeterPoints: 10_000,
  /** Endless mode: spawn-rate multiplier during frenzy (non-bubble targets). */
  frenzySpawnRateMult: 3.5,
  /**
   * Endless mode: absolute bubble spawn rate during frenzy vs normal (0.5 = −50%).
   * Bubbles do not receive the 3.5× frenzy spawn boost.
   */
  frenzyBubbleSpawnMult: 0.5,
  /**
   * Endless mode: durian/gold point bases use this instead of `points.durian` (100)
   * during frenzy. Bubbles are unchanged. Gold scales by the same ratio.
   */
  frenzyPointBase: 250,
  /** Endless mode: frenzy duration (ms). */
  frenzyDurationMs: 15_000,
  /**
   * After a target leaves a window/path, keep that slot unavailable so the
   * next spawn cannot pop in the same place immediately.
   */
  spawnSlotCooldownMs: 1400,
  targetSize: 34.375,
  heartSize: 16,
  goldSize: 24,
  points: {
    durian: 100,
    goldDurian: 700,
    bubble: -1000,
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
    bubble: { min: 2000, max: 3000 },
    heart: { min: 4000, max: 6000 },
  },
  /** Close-camera bubble hold after rise (other close kinds still use 50% of lifetimeMs). */
  closeBubbleLifetimeMs: { min: 1000, max: 2000 },
  /**
   * Spawn mix (timed): durian : bubble : gold = 20 : 10 : 2
   * (~62% / ~31% / ~6%). Gold is still below a flat 6:3:1 (~10%)
   * because multi-hit golds linger and feel more common than their rate.
   * Endless keeps a small heart weight on top of the same 20:10:2 core.
   */
  spawnWeights: {
    endless: {
      durian: 20,
      goldDurian: 2,
      bubble: 10,
      heart: 2,
    },
    timed: {
      durian: 20,
      goldDurian: 2,
      bubble: 10,
      heart: 0,
    },
    tutorial: {
      durian: 20,
      goldDurian: 2,
      bubble: 10,
      heart: 2,
    },
  },
} as const;

export type TargetKind = 'durian' | 'goldDurian' | 'bubble' | 'heart';
