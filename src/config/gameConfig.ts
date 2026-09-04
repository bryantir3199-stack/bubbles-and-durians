export type GameMode = 'endless' | 'timed' | 'tutorial';
export type RankedMode = 'endless' | 'timed-short' | 'timed-medium';
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

export const defaultTimedPreset: TimedPreset = 'short';

export function getTimedPreset(preset: TimedPreset = defaultTimedPreset): TimedPresetConfig {
  return timedPresets[preset];
}

export function toRankedMode(mode: GameMode, timedPreset?: TimedPreset): RankedMode | null {
  if (mode === 'endless') return 'endless';
  if (mode !== 'timed') return null;
  if (timedPreset === 'medium') return 'timed-medium';
  if (timedPreset === 'long') return null;
  return 'timed-short';
}

export const gameConfig = {
  startLives: 3,
  maxLives: 5,
  magazineSize: 7,
  /** Delay between each ammo pip filling during reload. */
  reloadShellMs: 85,
  /** Hard cap — never more than this many live targets */
  maxTargets: 7,
  /** Prior cadence was 2920/1690; ~12% faster spawn rate → intervals / 1.12. */
  spawnIntervalMs: 2610,
  minSpawnIntervalMs: 1510,
  /** Timed mode: multiply spawn rate by this during the final boost window (2.25 = +125%). */
  timedFinalSpawnRateMult: 2.25,
  /**
   * Timed mode: extra score on durian/gold during `finalBoostSeconds`.
   * Combo still multiplies after this. Bubbles stay −1000 with no clock bonus.
   */
  timedFinaleScoreMult: 2,
  /** Timed results: awarded if combo reached max at least once. */
  timedBonusMaxCombo: 2000,
  /** Timed results: points per whole second spent at max combo. */
  timedBonusPerSecAtMaxCombo: 100,
  /** Timed results: awarded if no bubbles were shot. */
  timedBonusCleanRound: 5000,
  /**
   * Opening grace period (ms): no close-camera pops and no gold durians
   * so the first half-minute stays readable.
   */
  earlyGameGraceMs: 30_000,
  /**
   * Timed only: teeth appear in a random moment inside this window
   * centered on the midpoint of the timed run.
   */
  teethFlybyMidWindowMs: 5_000,
  /** Timed only: center warn flash begins this long before the teeth spawn. */
  teethWarnLeadMs: 2_000,
  /** Timed only: duration of one exclaim on/off blink cycle (ms). */
  teethWarnFlashCycleMs: 100,
  /** Timed only: number of exclaim blink cycles in the warn flash. */
  teethWarnFlashCount: 10,
  /** Timed only: total warn flash length (= cycle × count). */
  teethWarnFlashMs: 1_000,
  /** Timed only: constant speed on the behind-castle lane (world units / s). */
  teethPathSpeed: 250,
  /** Timed only: open ↔ closed model swap interval (ms). */
  teethChompIntervalMs: 160,
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
  /**
   * Chance each spawn tick creates a durian+bubble pair on one path lane (0–1).
   * Bubble leads; durian follows at a fixed gap on the same route.
   */
  pathPairChance: 0.12,
  /** Gap between the lead bubble and chasing durian (world units). */
  pathPairGap: 42,
  targetSize: 34.375,
  heartSize: 16,
  goldSize: 24,
  points: {
    durian: 100,
    goldDurian: 700,
    bubble: -1000,
    /** Timed short one-shot flyby — flat award (no combo / finale mult). */
    teethShort: 5_000,
    /** Timed medium one-shot flyby — flat award (no combo / finale mult). */
    teethMedium: 10_000,
  },
  /** Combo multiplier caps at this value (2x / 3x / 4x / 5x). */
  maxCombo: 5,
  /** Durian kills needed to raise combo by one level (gold only counts on defeat). */
  shotsPerComboLevel: 4,
  hitsRequired: {
    durian: 1,
    goldDurian: 4,
    bubble: 1,
    heart: 1,
    teeth: 1,
  },
  lifetimeMs: {
    durian: { min: 4500, max: 7000 },
    goldDurian: { min: 5500, max: 8500 },
    bubble: { min: 2000, max: 3000 },
    heart: { min: 4000, max: 6000 },
    /** Path movers ignore hold lifetime; kept for typed spawn config. */
    teeth: { min: 8000, max: 8000 },
  },
  /** Close-camera bubble hold after rise (other close kinds still use 50% of lifetimeMs). */
  closeBubbleLifetimeMs: { min: 1000, max: 2000 },
  /**
   * Spawn mix for Endless / tutorial (and timed presets with no quota).
   * Blitz / Standard deal a shuffled quota deck instead — see timedSpawnQuotas.
   * Endless keeps a small heart weight on top of the same 20:6:3 core.
   */
  spawnWeights: {
    endless: {
      durian: 20,
      goldDurian: 3,
      bubble: 6,
      heart: 2,
      teeth: 0,
    },
    timed: {
      durian: 20,
      goldDurian: 3,
      bubble: 6,
      heart: 0,
      /** Scripted one-shot via forceSpawn — never RNG. */
      teeth: 0,
    },
    tutorial: {
      durian: 20,
      goldDurian: 3,
      bubble: 6,
      heart: 2,
      teeth: 0,
    },
  },
} as const;

export type TargetKind = 'durian' | 'goldDurian' | 'bubble' | 'heart' | 'teeth';

/** Ordinary timed targets. Teeth stay a midpoint flyby, not a deck card. */
export interface TimedSpawnQuota {
  durian: number;
  goldDurian: number;
  bubble: number;
}

export const timedSpawnQuotas: Record<'short' | 'medium', TimedSpawnQuota> = {
  short: { durian: 42, goldDurian: 4, bubble: 17 },
  medium: { durian: 92, goldDurian: 10, bubble: 38 },
};

export function getTimedSpawnQuota(preset: TimedPreset): TimedSpawnQuota | null {
  if (preset === 'short' || preset === 'medium') return timedSpawnQuotas[preset];
  return null;
}

/**
 * Shuffled ordinary timed targets (no teeth / hearts).
 * Greens and bubbles are shuffled; golds are placed at even intervals after
 * the early-game slice so they do not clump (including right after grace).
 */
export function buildTimedSpawnDeck(quota: TimedSpawnQuota, durationMs = 0): TargetKind[] {
  const nonGold: TargetKind[] = [];
  for (let i = 0; i < quota.durian; i++) nonGold.push('durian');
  for (let i = 0; i < quota.bubble; i++) nonGold.push('bubble');
  shuffleInPlace(nonGold);

  const goldCount = quota.goldDurian;
  if (goldCount <= 0) return nonGold;

  const total = nonGold.length + goldCount;
  const graceFraction =
    durationMs > 0 ? gameConfig.earlyGameGraceMs / durationMs : 0;
  const first = Math.min(Math.ceil(total * graceFraction), total - goldCount);
  const last = total - 1;
  const span = last - first + 1;
  const goldAt = new Set<number>();
  for (let i = 0; i < goldCount; i++) {
    const pos =
      goldCount === 1
        ? first + Math.floor(span / 2)
        : first + Math.round((i * (span - 1)) / (goldCount - 1));
    goldAt.add(pos);
  }
  // Rounding can collide; walk forward to the next free slot.
  if (goldAt.size < goldCount) {
    for (let pos = first; pos <= last && goldAt.size < goldCount; pos++) {
      goldAt.add(pos);
    }
  }

  const deck: TargetKind[] = [];
  let ni = 0;
  for (let i = 0; i < total; i++) {
    deck.push(goldAt.has(i) ? 'goldDurian' : nonGold[ni++]!);
  }
  return deck;
}

function shuffleInPlace<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = items[i]!;
    items[i] = items[j]!;
    items[j] = a;
  }
}

/** Flat teeth award by timed preset (short 5k / medium+ 10k). */
export function teethPointsForPreset(preset: TimedPreset = defaultTimedPreset): number {
  return preset === 'short' ? gameConfig.points.teethShort : gameConfig.points.teethMedium;
}

/** Timed results breakdown. `finaleScore` is already inside `runScore`. */
export interface TimedRunTally {
  runScore: number;
  finaleScore: number;
  maxComboBonus: number;
  comboHoldBonus: number;
  cleanRoundBonus: number;
  shotsFired: number;
  accurateHits: number;
  /** Whole percent 0–100 used as the final multiplier. */
  accuracyPct: number;
  total: number;
}

export function computeTimedRunTally(input: {
  runScore: number;
  peakCombo: number;
  timeAtMaxCombo: number;
  bubblesHit: number;
  finaleScore: number;
  shotsFired: number;
  accurateHits: number;
}): TimedRunTally {
  const maxComboBonus =
    input.peakCombo >= gameConfig.maxCombo ? gameConfig.timedBonusMaxCombo : 0;
  const holdSecs = Math.floor(Math.max(0, input.timeAtMaxCombo));
  const comboHoldBonus = holdSecs * gameConfig.timedBonusPerSecAtMaxCombo;
  const cleanRoundBonus = input.bubblesHit <= 0 ? gameConfig.timedBonusCleanRound : 0;
  const shots = Math.max(0, Math.floor(input.shotsFired));
  const hits = Math.max(0, Math.min(shots, Math.floor(input.accurateHits)));
  const accuracyPct = shots <= 0 ? 0 : Math.round((hits / shots) * 100);
  const subtotal = input.runScore + maxComboBonus + comboHoldBonus + cleanRoundBonus;
  return {
    runScore: input.runScore,
    finaleScore: Math.max(0, Math.round(input.finaleScore)),
    maxComboBonus,
    comboHoldBonus,
    cleanRoundBonus,
    shotsFired: shots,
    accurateHits: hits,
    accuracyPct,
    total: Math.round(subtotal * (accuracyPct / 100)),
  };
}
