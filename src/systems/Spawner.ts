import type { GameMode, TargetKind } from '../config/gameConfig';
import { gameConfig } from '../config/gameConfig';
import {
  CLOSE_SPOTS,
  PATTERN_WEIGHTS,
  GATE_LANE_COUNT,
  GATE_PATHS,
  TEETH_FLYBY_PATH_INDEX,
  WINDOWS,
  type SpawnPattern,
} from '../config/spawnLayout';
import { Target, type TargetSpawnSpec } from '../entities/Target';
import type * as THREE from 'three';
import { wantsPathPairsOnly } from '../debug/pathDebug';

type SpawnWeights = Record<TargetKind, number>;

export interface SpawnerOptions {
  /** When true, only elevated dome U lanes are used for path spawns. */
  domeOnly?: boolean;
  /** When true, only close-camera left/middle/right rises spawn. */
  closeOnly?: boolean;
  /** Current lives — hearts are skipped when the bar is already full. */
  getLives?: () => number;
  /** Timed mode: seconds remaining when the final spawn-rate boost begins. */
  timedFinalBoostSeconds?: number;
}

/**
 * Spawns up to maxTargets pattern-based targets (window holds + path travel
 * + occasional close-camera rises).
 */
export class Spawner {
  private elapsed = 0;
  private nextAt = 0;
  private running = false;
  readonly targets: Target[] = [];
  private occupiedWindows = new Set<string>();
  private occupiedClose = new Set<string>();
  /** One mover per travel lane (gate L + dome wall U). */
  private busyPaths = new Set<number>();
  /** Window id → earliest elapsed ms when it may be reused. */
  private windowCooldownUntil = new Map<string, number>();
  /** Close-slot id → earliest elapsed ms when it may be reused. */
  private closeCooldownUntil = new Map<string, number>();
  /** Path index → earliest elapsed ms when it may be reused. */
  private pathCooldownUntil = new Map<number, number>();
  private readonly domeOnly: boolean;
  private readonly closeOnly: boolean;
  private readonly getLives: (() => number) | undefined;
  private readonly timedFinalBoostSeconds: number;
  /** Endless: spawn-rate multiplier vs base cadence (1 = original). */
  private endlessRateMult = 1;
  /** Endless: frenzy active — retargets bubble mix away from the 3.5× boost. */
  private frenzyActive = false;
  /**
   * Endless: elapsed ms that count toward the linear spawn-rate ramp.
   * Does not advance during Frenzy so the climb pauses until it ends.
   */
  private rampElapsed = 0;
  /** Last logged rate label — used to avoid spam in DEV. */
  private lastLoggedLabel = '';

  constructor(
    private scene: THREE.Scene,
    private mode: GameMode,
    private onEscape: (t: Target) => void,
    options?: SpawnerOptions,
  ) {
    this.domeOnly = options?.domeOnly === true;
    this.closeOnly = options?.closeOnly === true;
    this.getLives = options?.getLives;
    this.timedFinalBoostSeconds = options?.timedFinalBoostSeconds ?? 30;
  }

  start(): void {
    this.running = true;
    this.elapsed = 0;
    this.rampElapsed = 0;
    // Match current cadence (~12% faster than prior 2150 / 1380 stagger).
    this.nextAt = 1920;
    this.endlessRateMult = 1;
    this.frenzyActive = false;
    this.lastLoggedLabel = '';
    this.occupiedWindows.clear();
    this.occupiedClose.clear();
    this.busyPaths.clear();
    this.windowCooldownUntil.clear();
    this.closeCooldownUntil.clear();
    this.pathCooldownUntil.clear();
    for (let i = 0; i < 2; i++) {
      window.setTimeout(() => {
        if (this.running) this.trySpawn();
      }, i * 1230);
    }
    this.logSpawnRateLabel(this.rateLabel(undefined));
  }

  /**
   * Place a specific target for tutorial / scripted beats.
   * Bypasses mix weights, early-game grace, and the live-count cap.
   */
  forceSpawn(
    kind: TargetKind,
    pattern: SpawnPattern,
    options?: {
      frenzySpawned?: boolean;
      windowId?: string;
      pathIndex?: number;
      pathForward?: boolean;
      pinned?: boolean;
    },
  ): Target | null {
    const spec = this.lockSpec(pattern, options);
    if (!spec) return null;
    const target = new Target(
      this.scene,
      kind,
      spec,
      this.onEscape,
      () => this.releaseSpec(spec),
      options?.frenzySpawned === true,
      options?.pinned === true,
    );
    this.targets.push(target);
    return target;
  }

  stop(): void {
    this.running = false;
  }

  /** Spawner clock (ms) since start — used for scripted timed beats. */
  getElapsedMs(): number {
    return this.elapsed;
  }

  /**
   * Endless only: set spawn-rate multiplier (1 = normal, 3.5 = frenzy).
   * Applied on top of the slow linear time-based ramp.
   * Raising the rate shortens any pending next-spawn wait immediately.
   */
  setEndlessRateMult(mult: number): void {
    if (this.mode === 'timed') return;
    const prev = this.endlessRateMult;
    this.endlessRateMult = Math.max(0.01, mult);
    if (this.endlessRateMult > prev) {
      const interval = this.computeInterval();
      if (this.nextAt - this.elapsed > interval) {
        this.nextAt = this.elapsed + interval;
      }
    }
    this.logSpawnRateLabel(this.rateLabel());
  }

  /**
   * Endless frenzy: 3.5× overall cadence, but bubble absolute spawn rate
   * drops to `frenzyBubbleSpawnMult` of normal (via weight retargeting).
   */
  setFrenzyActive(active: boolean): void {
    if (this.mode === 'timed') return;
    this.frenzyActive = active;
    this.setEndlessRateMult(active ? gameConfig.frenzySpawnRateMult : 1);
  }

  /**
   * @param dt — frame delta in seconds
   * @param timeLeftSeconds — timed-mode seconds remaining (ignored in endless)
   */
  update(dt: number, timeLeftSeconds?: number): void {
    for (const t of this.targets) t.update(dt);
    for (let i = this.targets.length - 1; i >= 0; i--) {
      if (!this.targets[i]!.root.parent) this.targets.splice(i, 1);
    }

    if (!this.running) return;
    const dtMs = dt * 1000;
    this.elapsed += dtMs;
    // Linear ramp pauses during Frenzy — only non-Frenzy time climbs the rate.
    if (this.mode === 'endless' && !this.frenzyActive) {
      this.rampElapsed += dtMs;
    }

    // Timed final boost: once remaining time enters the window, tighten the
    // pending next-spawn wait so the +50% rate kicks in immediately.
    if (
      this.mode === 'timed' &&
      timeLeftSeconds !== undefined &&
      timeLeftSeconds <= this.timedFinalBoostSeconds
    ) {
      const boosted = this.computeInterval(timeLeftSeconds);
      if (this.nextAt - this.elapsed > boosted) {
        this.nextAt = this.elapsed + boosted;
      }
      this.logSpawnRateLabel(this.rateLabel(timeLeftSeconds));
    }

    // Endless linear ramp: keep the pending wait aligned with the rising rate
    // (only while not in Frenzy — ramp is frozen then).
    if (this.mode === 'endless' && !this.frenzyActive) {
      const current = this.computeInterval();
      if (this.nextAt - this.elapsed > current) {
        this.nextAt = this.elapsed + current;
      }
      this.logSpawnRateLabel(this.rateLabel());
    }

    if (this.elapsed >= this.nextAt) {
      this.trySpawn();
      const interval = this.computeInterval(timeLeftSeconds);
      this.nextAt = this.elapsed + interval;
    }
  }

  clearAll(): void {
    for (const t of this.targets) t.destroy();
    this.targets.length = 0;
    this.occupiedWindows.clear();
    this.occupiedClose.clear();
    this.busyPaths.clear();
    this.windowCooldownUntil.clear();
    this.closeCooldownUntil.clear();
    this.pathCooldownUntil.clear();
  }

  /** Base ramp (2610 → 1510 over first 120s of spawner elapsed). */
  private baseIntervalMs(): number {
    const progress = Math.min(1, this.elapsed / 120_000);
    return (
      gameConfig.spawnIntervalMs -
      (gameConfig.spawnIntervalMs - gameConfig.minSpawnIntervalMs) * progress
    );
  }

  /**
   * Endless: linear spawn-rate growth from non-Frenzy play time.
   * Starts at 1× and climbs by `endlessSpawnRatePerMinute` each minute,
   * capped at `endlessSpawnRateMaxMult` (Frenzy multiplies on top separately).
   */
  private endlessTimeRateMult(): number {
    const perMs = gameConfig.endlessSpawnRatePerMinute / 60_000;
    const raw = 1 + this.rampElapsed * perMs;
    return Math.min(gameConfig.endlessSpawnRateMaxMult, raw);
  }

  /**
   * Effective spawn interval after mode-specific rate modifiers.
   * Higher spawn rate → shorter interval.
   */
  private computeInterval(timeLeftSeconds?: number): number {
    let interval = this.baseIntervalMs();
    let rateMult = 1;

    if (this.mode === 'timed') {
      if (
        timeLeftSeconds !== undefined &&
        timeLeftSeconds <= this.timedFinalBoostSeconds
      ) {
        rateMult *= gameConfig.timedFinalSpawnRateMult;
      }
    } else {
      rateMult *= this.endlessTimeRateMult() * this.endlessRateMult;
    }

    return interval / rateMult;
  }

  /** Human-readable spawn-rate label for DEV logs. */
  private rateLabel(timeLeftSeconds?: number): string {
    if (this.mode === 'endless') {
      const timeMult = this.endlessTimeRateMult();
      const timeLabel =
        timeMult <= 1.001 ? '1x' : `${timeMult.toFixed(2)}x`;
      if (this.frenzyActive) return `frenzy@${timeLabel}`;
      if (timeMult <= 1.001) return 'original';
      return timeLabel;
    }
    if (
      timeLeftSeconds !== undefined &&
      timeLeftSeconds <= this.timedFinalBoostSeconds
    ) {
      return `${Math.round((gameConfig.timedFinalSpawnRateMult - 1) * 100)}%`;
    }
    return 'original';
  }

  private logSpawnRateLabel(label: string): void {
    if (!import.meta.env.DEV) return;
    if (label === this.lastLoggedLabel) return;
    this.lastLoggedLabel = label;
    // eslint-disable-next-line no-console
    console.log(`[spawn-rate] ${label}`);
  }

  /**
   * On-screen count. At the cap we wait — never destroy/replace existing targets
   * to make room for a new spawn.
   */
  private liveCount(): number {
    return this.targets.reduce((n, t) => n + (t.onScreen ? 1 : 0), 0);
  }

  private trySpawn(): void {
    // Hard stop: do not remove anyone; only spawn when a slot is free.
    if (this.liveCount() >= gameConfig.maxTargets) return;

    if (wantsPathPairsOnly()) {
      this.trySpawnPathPair();
      return;
    }

    if (this.trySpawnPathPair()) return;

    const kind = this.pickKind();
    if (!kind) return;

    const spec = this.pickSpec();
    if (!spec) return;

    // Re-check after pickSpec in case of races with timeouts.
    if (this.liveCount() >= gameConfig.maxTargets) return;

    const target = new Target(
      this.scene,
      kind,
      spec,
      this.onEscape,
      () => this.releaseSpec(spec),
      this.frenzyActive,
    );
    this.targets.push(target);
  }

  /**
   * Spawn a bubble and durian on the same path lane — bubble leads, durian
   * follows at a fixed gap. Shares one path slot until both leave play.
   */
  private trySpawnPathPair(): boolean {
    if (this.closeOnly) return false;
    if (!wantsPathPairsOnly() && Math.random() >= gameConfig.pathPairChance) return false;
    if (this.liveCount() + 2 > gameConfig.maxTargets) return false;

    const freePaths = this.freePathIndices();
    if (freePaths.length === 0) return false;

    const pathIndex = freePaths[Math.floor(Math.random() * freePaths.length)]!;
    const pathForward = Math.random() < 0.55;
    const spec: TargetSpawnSpec = { pattern: 'path', pathIndex, pathForward };
    const gap = gameConfig.pathPairGap as number;

    this.busyPaths.add(pathIndex);
    this.pathCooldownUntil.delete(pathIndex);

    let refs = 2;
    const releasePath = () => {
      refs -= 1;
      if (refs <= 0) {
        this.busyPaths.delete(pathIndex);
        this.pathCooldownUntil.set(pathIndex, this.elapsed + gameConfig.spawnSlotCooldownMs);
      }
    };

    const bubble = new Target(
      this.scene,
      'bubble',
      { ...spec, pathStartOffset: gap, pathPairLead: true, pathPair: true },
      this.onEscape,
      releasePath,
      this.frenzyActive,
    );
    const durian = new Target(
      this.scene,
      'durian',
      { ...spec, pathStartOffset: 0, pathPair: true },
      this.onEscape,
      releasePath,
      this.frenzyActive,
    );
    this.targets.push(bubble, durian);
    return true;
  }

  private windowReady(id: string): boolean {
    const until = this.windowCooldownUntil.get(id);
    return until === undefined || this.elapsed >= until;
  }

  private closeReady(id: string): boolean {
    const until = this.closeCooldownUntil.get(id);
    return until === undefined || this.elapsed >= until;
  }

  private pathReady(index: number): boolean {
    const until = this.pathCooldownUntil.get(index);
    return until === undefined || this.elapsed >= until;
  }

  private freeWindows() {
    return WINDOWS.filter((w) => !this.occupiedWindows.has(w.id) && this.windowReady(w.id));
  }

  private freeCloseSpots() {
    // First 30s: keep the three near-camera rise slots empty.
    if (this.elapsed < gameConfig.earlyGameGraceMs) return [];
    return CLOSE_SPOTS.filter((s) => !this.occupiedClose.has(s.id) && this.closeReady(s.id));
  }

  private freePathIndices(): number[] {
    const free: number[] = [];
    const start = this.domeOnly ? GATE_LANE_COUNT : 0;
    for (let i = start; i < GATE_PATHS.length; i++) {
      // Scripted teeth flyby lane — never part of RNG mix.
      if (i === TEETH_FLYBY_PATH_INDEX) continue;
      if (
        !this.busyPaths.has(i) &&
        this.pathReady(i) &&
        (GATE_PATHS[i]?.length ?? 0) >= 2
      ) {
        free.push(i);
      }
    }
    return free;
  }

  private lockSpec(
    pattern: SpawnPattern,
    options?: { windowId?: string; pathIndex?: number; pathForward?: boolean },
  ): TargetSpawnSpec | null {
    if (pattern === 'window') {
      const spots = WINDOWS.filter((w) => !this.occupiedWindows.has(w.id));
      if (spots.length === 0) return null;
      const preferred = options?.windowId
        ? spots.find((s) => s.id === options.windowId)
        : undefined;
      const spot = preferred ?? spots[Math.floor(spots.length / 2)] ?? spots[0]!;
      this.occupiedWindows.add(spot.id);
      this.windowCooldownUntil.delete(spot.id);
      return { pattern: 'window', windowId: spot.id, windowSpot: spot };
    }

    if (pattern === 'close') {
      const spots = CLOSE_SPOTS.filter((s) => !this.occupiedClose.has(s.id));
      if (spots.length === 0) return null;
      const preferred = options?.windowId
        ? spots.find((s) => s.id === options.windowId)
        : spots.find((s) => s.id === 'close-middle');
      const spot = preferred ?? spots[0]!;
      this.occupiedClose.add(spot.id);
      this.closeCooldownUntil.delete(spot.id);
      return { pattern: 'close', windowId: spot.id, windowSpot: spot };
    }

    // Preferred path (e.g. teeth flyby) may be excluded from RNG free lists.
    const preferred = options?.pathIndex;
    if (preferred !== undefined) {
      if (
        preferred < 0 ||
        preferred >= GATE_PATHS.length ||
        (GATE_PATHS[preferred]?.length ?? 0) < 2
      ) {
        return null;
      }
      if (this.busyPaths.has(preferred)) return null;
      this.busyPaths.add(preferred);
      this.pathCooldownUntil.delete(preferred);
      return {
        pattern: 'path',
        pathIndex: preferred,
        pathForward: options?.pathForward !== false,
      };
    }

    const free = this.freePathIndices();
    if (free.length === 0) return null;
    const pathIndex = free[0]!;
    this.busyPaths.add(pathIndex);
    this.pathCooldownUntil.delete(pathIndex);
    return {
      pattern: 'path',
      pathIndex,
      pathForward: options?.pathForward !== false,
    };
  }

  private pickSpec(): TargetSpawnSpec | null {
    const freeWindows = this.domeOnly || this.closeOnly ? [] : this.freeWindows();
    const freeClose = this.domeOnly ? [] : this.freeCloseSpots();
    const freePaths = this.closeOnly ? [] : this.freePathIndices();
    const patterns = (Object.keys(PATTERN_WEIGHTS) as SpawnPattern[]).filter((p) => {
      if (this.closeOnly) return p === 'close' && freeClose.length > 0;
      if (p === 'window') return freeWindows.length > 0;
      if (p === 'close') return freeClose.length > 0;
      if (p === 'path') return freePaths.length > 0;
      return false;
    });
    if (patterns.length === 0) return null;

    const total = patterns.reduce((s, p) => s + PATTERN_WEIGHTS[p], 0);
    let roll = Math.random() * total;
    let chosen: SpawnPattern = patterns[0]!;
    for (const p of patterns) {
      roll -= PATTERN_WEIGHTS[p];
      if (roll <= 0) {
        chosen = p;
        break;
      }
    }

    if (chosen === 'window') {
      if (freeWindows.length === 0) return null;
      const spot = freeWindows[Math.floor(Math.random() * freeWindows.length)]!;
      this.occupiedWindows.add(spot.id);
      this.windowCooldownUntil.delete(spot.id);
      return { pattern: 'window', windowId: spot.id, windowSpot: spot };
    }

    if (chosen === 'close') {
      if (freeClose.length === 0) return null;
      const spot = freeClose[Math.floor(Math.random() * freeClose.length)]!;
      this.occupiedClose.add(spot.id);
      this.closeCooldownUntil.delete(spot.id);
      return { pattern: 'close', windowId: spot.id, windowSpot: spot };
    }

    if (freePaths.length === 0) return null;
    const pathIndex = freePaths[Math.floor(Math.random() * freePaths.length)]!;
    this.busyPaths.add(pathIndex);
    this.pathCooldownUntil.delete(pathIndex);
    return { pattern: 'path', pathIndex, pathForward: Math.random() < 0.55 };
  }

  private releaseSpec(spec: TargetSpawnSpec): void {
    const coolUntil = this.elapsed + gameConfig.spawnSlotCooldownMs;
    if (spec.pattern === 'window' && spec.windowId) {
      this.occupiedWindows.delete(spec.windowId);
      this.windowCooldownUntil.set(spec.windowId, coolUntil);
    } else if (spec.pattern === 'close' && spec.windowId) {
      this.occupiedClose.delete(spec.windowId);
      this.closeCooldownUntil.set(spec.windowId, coolUntil);
    } else if (spec.pattern === 'path' && spec.pathIndex !== undefined) {
      this.busyPaths.delete(spec.pathIndex);
      this.pathCooldownUntil.set(spec.pathIndex, coolUntil);
    }
  }

  private pickKind(): TargetKind | null {
    const weights = { ...(gameConfig.spawnWeights[this.mode] as SpawnWeights) };
    // First 30s: no gold durians.
    if (this.elapsed < gameConfig.earlyGameGraceMs) {
      weights.goldDurian = 0;
    }
    // Lives already at the cap — don't spawn extra hearts.
    if ((this.getLives?.() ?? 0) >= gameConfig.maxLives) {
      weights.heart = 0;
    }
    // Frenzy: keep overall 3.5× cadence, but cut absolute bubble rate by 50%.
    if (this.frenzyActive && weights.bubble > 0) {
      this.applyFrenzyBubbleWeight(weights);
    }
    const entries = (Object.keys(weights) as TargetKind[]).filter((k) => weights[k] > 0);
    const total = entries.reduce((sum, k) => sum + weights[k], 0);
    if (total <= 0) return null;
    let roll = Math.random() * total;
    for (const kind of entries) {
      roll -= weights[kind];
      if (roll <= 0) return kind;
    }
    return entries[entries.length - 1] ?? null;
  }

  /**
   * Retarget bubble weight so (frenzy cadence × bubble fraction) equals
   * `frenzyBubbleSpawnMult` × the normal absolute bubble spawn rate.
   */
  private applyFrenzyBubbleWeight(weights: SpawnWeights): void {
    const rateMult = gameConfig.frenzySpawnRateMult;
    const bubbleAbsMult = gameConfig.frenzyBubbleSpawnMult;
    const bubble = weights.bubble;
    const others =
      weights.durian + weights.goldDurian + weights.heart + weights.teeth;
    const normalTotal = others + bubble;
    if (normalTotal <= 0 || others <= 0) {
      weights.bubble = 0;
      return;
    }
    const targetFraction = (bubbleAbsMult / rateMult) * (bubble / normalTotal);
    if (targetFraction <= 0) {
      weights.bubble = 0;
      return;
    }
    if (targetFraction >= 1) {
      weights.durian = 0;
      weights.goldDurian = 0;
      weights.heart = 0;
      weights.teeth = 0;
      weights.bubble = 1;
      return;
    }
    weights.bubble = (targetFraction * others) / (1 - targetFraction);
  }
}
