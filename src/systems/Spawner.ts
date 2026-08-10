import type { GameMode, TargetKind } from '../config/gameConfig';
import { gameConfig } from '../config/gameConfig';
import {
  PATTERN_WEIGHTS,
  WINDOWS,
  type SpawnPattern,
} from '../config/spawnLayout';
import { Target, type TargetSpawnSpec } from '../entities/Target';
import type * as THREE from 'three';

type SpawnWeights = Record<TargetKind, number>;

/**
 * Spawns up to 6 pattern-based targets (windows, doors, wall-top, front slide).
 */
export class Spawner {
  private elapsed = 0;
  private nextAt = 0;
  private running = false;
  readonly targets: Target[] = [];
  private occupiedWindows = new Set<string>();
  private doorBusy = false;
  private wallBusy = false;
  private frontBusy = false;

  constructor(
    private scene: THREE.Scene,
    private mode: GameMode,
    private onEscape: (t: Target) => void,
  ) {}

  start(): void {
    this.running = true;
    this.elapsed = 0;
    this.nextAt = 700;
    this.occupiedWindows.clear();
    this.doorBusy = false;
    this.wallBusy = false;
    this.frontBusy = false;
    for (let i = 0; i < 2; i++) {
      window.setTimeout(() => {
        if (this.running) this.trySpawn();
      }, i * 450);
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
    this.doorBusy = false;
    this.wallBusy = false;
    this.frontBusy = false;
  }

  private liveCount(): number {
    return this.targets.filter((t) => t.active).length;
  }

  private trySpawn(): void {
    if (this.liveCount() >= gameConfig.maxTargets) return;

    const kind = this.pickKind();
    if (!kind) return;

    const spec = this.pickSpec();
    if (!spec) return;

    const target = new Target(this.scene, kind, spec, this.onEscape, () => this.releaseSpec(spec));
    this.targets.push(target);
  }

  private pickSpec(): TargetSpawnSpec | null {
    const patterns = (Object.keys(PATTERN_WEIGHTS) as SpawnPattern[]).filter((p) => {
      if (p === 'window') return this.occupiedWindows.size < WINDOWS.length;
      if (p === 'door') return !this.doorBusy;
      if (p === 'wall') return !this.wallBusy;
      if (p === 'frontSlide') return !this.frontBusy;
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

    if (chosen === 'door') {
      this.doorBusy = true;
      return { pattern: 'door', doorExit: Math.random() < 0.55 };
    }

    if (chosen === 'wall') {
      this.wallBusy = true;
      return { pattern: 'wall', goRight: Math.random() < 0.5 };
    }

    this.frontBusy = true;
    return { pattern: 'frontSlide', goRight: Math.random() < 0.5 };
  }

  private releaseSpec(spec: TargetSpawnSpec): void {
    if (spec.pattern === 'window' && spec.windowId) {
      this.occupiedWindows.delete(spec.windowId);
    } else if (spec.pattern === 'door') {
      this.doorBusy = false;
    } else if (spec.pattern === 'wall') {
      this.wallBusy = false;
    } else if (spec.pattern === 'frontSlide') {
      this.frontBusy = false;
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
