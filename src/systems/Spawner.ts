import type { GameMode, TargetKind } from '../config/gameConfig';
import { gameConfig } from '../config/gameConfig';
import {
  PATTERN_WEIGHTS,
  PATHS,
  WINDOWS,
  type SpawnPattern,
} from '../config/spawnLayout';
import { Target, type TargetSpawnSpec } from '../entities/Target';
import type * as THREE from 'three';

type SpawnWeights = Record<TargetKind, number>;

/**
 * Spawns up to maxTargets pattern-based targets (window holds + path travel).
 */
export class Spawner {
  private elapsed = 0;
  private nextAt = 0;
  private running = false;
  readonly targets: Target[] = [];
  private occupiedWindows = new Set<string>();

  constructor(
    private scene: THREE.Scene,
    private mode: GameMode,
    private onEscape: (t: Target) => void,
  ) {}

  start(): void {
    this.running = true;
    this.elapsed = 0;
    // Match the slower cadence (was 700ms / 450ms stagger).
    this.nextAt = 2800;
    this.occupiedWindows.clear();
    for (let i = 0; i < 2; i++) {
      window.setTimeout(() => {
        if (this.running) this.trySpawn();
      }, i * 1800);
    }
  }

  stop(): void {
    this.running = false;
  }

  update(dt: number): void {
    if (!this.running) return;
    this.elapsed += dt * 1000;

    for (const t of this.targets) t.update(dt);
    for (let i = this.targets.length - 1; i >= 0; i--) {
      if (!this.targets[i]!.root.parent) this.targets.splice(i, 1);
    }

    if (this.elapsed >= this.nextAt) {
      this.trySpawn();
      const progress = Math.min(1, this.elapsed / 120_000);
      const interval =
        gameConfig.spawnIntervalMs -
        (gameConfig.spawnIntervalMs - gameConfig.minSpawnIntervalMs) * progress;
      this.nextAt = this.elapsed + interval;
    }
  }

  clearAll(): void {
    for (const t of this.targets) t.destroy();
    this.targets.length = 0;
    this.occupiedWindows.clear();
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

  private pickSpec(): TargetSpawnSpec | null {
    const patterns = (Object.keys(PATTERN_WEIGHTS) as SpawnPattern[]).filter((p) => {
      if (p === 'window') return this.occupiedWindows.size < WINDOWS.length;
      if (p === 'path') return PATHS.length >= 2;
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
      const free = WINDOWS.filter((w) => !this.occupiedWindows.has(w.id));
      if (free.length === 0) return null;
      const spot = free[Math.floor(Math.random() * free.length)]!;
      this.occupiedWindows.add(spot.id);
      return { pattern: 'window', windowId: spot.id, windowSpot: spot };
    }

    return { pattern: 'path', pathForward: Math.random() < 0.55 }; // usually enter from front-left

  }

  private releaseSpec(spec: TargetSpawnSpec): void {
    if (spec.pattern === 'window' && spec.windowId) {
      this.occupiedWindows.delete(spec.windowId);
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
