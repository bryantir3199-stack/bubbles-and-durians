import type { GameMode, TargetKind } from '../config/gameConfig';
import { gameConfig } from '../config/gameConfig';
import {
  CLOSE_SPOTS,
  PATTERN_WEIGHTS,
  GATE_LANE_COUNT,
  GATE_PATHS,
  WINDOWS,
  type SpawnPattern,
} from '../config/spawnLayout';
import { Target, type TargetSpawnSpec } from '../entities/Target';
import type * as THREE from 'three';

type SpawnWeights = Record<TargetKind, number>;

export interface SpawnerOptions {
  /** When true, only elevated dome U lanes are used for path spawns. */
  domeOnly?: boolean;
  /** When true, only close-camera left/middle/right rises spawn. */
  closeOnly?: boolean;
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
  /** Endless: cumulative spawn-rate multiplier (1 = base cadence). */
  private endlessRateMult = 1;
  /** Endless: index of the active 10s time block. */
  private endlessBlockIndex = 0;
  /** Last logged spawn interval (ms) — used to avoid spam in DEV. */
  private lastLoggedIntervalMs = -1;

  constructor(
    private scene: THREE.Scene,
    private mode: GameMode,
    private onEscape: (t: Target) => void,
    options?: SpawnerOptions,
  ) {
    this.domeOnly = options?.domeOnly === true;
    this.closeOnly = options?.closeOnly === true;
  }

  start(): void {
    this.running = true;
    this.elapsed = 0;
    // Match current cadence (~12% faster than prior 2150 / 1380 stagger).
    this.nextAt = 1920;
    this.endlessRateMult = 1;
    this.endlessBlockIndex = 0;
    this.lastLoggedIntervalMs = -1;
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
    this.logSpawnRate(this.computeInterval(undefined), 'start');
  }

  stop(): void {
    this.running = false;
  }

  /**
   * @param dt — frame delta in seconds
   * @param timeLeftSeconds — timed-mode seconds remaining (ignored in endless)
   */
  update(dt: number, timeLeftSeconds?: number): void {
    if (!this.running) return;
    this.elapsed += dt * 1000;

    for (const t of this.targets) t.update(dt);
    for (let i = this.targets.length - 1; i >= 0; i--) {
      if (!this.targets[i]!.root.parent) this.targets.splice(i, 1);
    }

    if (this.mode === 'endless') {
      this.updateEndlessTimeBlocks();
    }

    // Timed final boost: once remaining time enters the window, tighten the
    // pending next-spawn wait so the +50% rate kicks in immediately.
    if (
      this.mode === 'timed' &&
      timeLeftSeconds !== undefined &&
      timeLeftSeconds <= gameConfig.timedFinalBoostSeconds
    ) {
      const boosted = this.computeInterval(timeLeftSeconds);
      if (this.nextAt - this.elapsed > boosted) {
        this.nextAt = this.elapsed + boosted;
        this.logSpawnRate(boosted, 'timed-final-boost');
      }
    }

    if (this.elapsed >= this.nextAt) {
      this.trySpawn();
      const interval = this.computeInterval(timeLeftSeconds);
      this.nextAt = this.elapsed + interval;
      this.logSpawnRate(interval, 'schedule');
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
   * Effective spawn interval after mode-specific rate modifiers.
   * Higher spawn rate → shorter interval.
   */
  private computeInterval(timeLeftSeconds?: number): number {
    let interval = this.baseIntervalMs();
    let rateMult = 1;

    if (this.mode === 'timed') {
      if (
        timeLeftSeconds !== undefined &&
        timeLeftSeconds <= gameConfig.timedFinalBoostSeconds
      ) {
        rateMult *= gameConfig.timedFinalSpawnRateMult;
      }
    } else {
      rateMult *= this.endlessRateMult;
    }

    return interval / rateMult;
  }

  /**
   * Endless: every 10s time block, randomly keep / raise / lower spawn rate
   * by a random 25–75%.
   */
  private updateEndlessTimeBlocks(): void {
    const blockMs = gameConfig.endlessSpawnBlockMs;
    const blockIndex = Math.floor(this.elapsed / blockMs);
    while (this.endlessBlockIndex < blockIndex) {
      this.endlessBlockIndex += 1;
      this.rollEndlessRateChange();
    }
  }

  private rollEndlessRateChange(): void {
    const roll = Math.random();
    let decision: 'same' | 'increase' | 'decrease';
    if (roll < 1 / 3) decision = 'same';
    else if (roll < 2 / 3) decision = 'increase';
    else decision = 'decrease';

    if (decision !== 'same') {
      const span =
        gameConfig.endlessSpawnRateChangeMax - gameConfig.endlessSpawnRateChangeMin;
      const change =
        gameConfig.endlessSpawnRateChangeMin + Math.random() * span;
      if (decision === 'increase') {
        this.endlessRateMult *= 1 + change;
      } else {
        this.endlessRateMult *= 1 - change;
      }
      this.endlessRateMult = Math.min(
        gameConfig.endlessSpawnRateMultMax,
        Math.max(gameConfig.endlessSpawnRateMultMin, this.endlessRateMult),
      );

      // If rate went up, don't wait out the old slower interval.
      const interval = this.computeInterval();
      if (this.nextAt - this.elapsed > interval) {
        this.nextAt = this.elapsed + interval;
      }
    }

    this.logSpawnRate(this.computeInterval(), `endless-block:${decision}`);
  }

  private logSpawnRate(intervalMs: number, reason: string): void {
    if (!import.meta.env.DEV) return;
    // Skip near-identical reschedules to keep the console readable.
    if (Math.abs(intervalMs - this.lastLoggedIntervalMs) < 1 && reason === 'schedule') {
      return;
    }
    this.lastLoggedIntervalMs = intervalMs;
    // eslint-disable-next-line no-console
    console.log('[spawn-rate]', {
      mode: this.mode,
      reason,
      spawnRate: Number((1000 / intervalMs).toFixed(3)),
      intervalMs: Math.round(intervalMs),
      ...(this.mode === 'endless'
        ? {
            rateMult: Number(this.endlessRateMult.toFixed(3)),
            block: this.endlessBlockIndex,
          }
        : {}),
    });
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

    const kind = this.pickKind();
    if (!kind) return;

    const spec = this.pickSpec();
    if (!spec) return;

    // Re-check after pickSpec in case of races with timeouts.
    if (this.liveCount() >= gameConfig.maxTargets) return;

    const target = new Target(this.scene, kind, spec, this.onEscape, () => this.releaseSpec(spec));
    this.targets.push(target);
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
    return CLOSE_SPOTS.filter((s) => !this.occupiedClose.has(s.id) && this.closeReady(s.id));
  }

  private freePathIndices(): number[] {
    const free: number[] = [];
    const start = this.domeOnly ? GATE_LANE_COUNT : 0;
    for (let i = start; i < GATE_PATHS.length; i++) {
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
    const weights = gameConfig.spawnWeights[this.mode] as SpawnWeights;
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
}
