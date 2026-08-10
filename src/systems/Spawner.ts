import * as THREE from 'three';
import type { GameMode, TargetKind } from '../config/gameConfig';
import { gameConfig } from '../config/gameConfig';
import { Target } from '../entities/Target';

type SpawnWeights = Record<TargetKind, number>;

/**
 * Spawns hopping targets around the castle grounds (courtyard + front yard).
 */
export class Spawner {
  private elapsed = 0;
  private nextAt = 0;
  private running = false;
  readonly targets: Target[] = [];

  constructor(
    private scene: THREE.Scene,
    private mode: GameMode,
    private onEscape: (t: Target) => void,
  ) {}

  start(): void {
    this.running = true;
    this.elapsed = 0;
    this.nextAt = 900;
    for (let i = 0; i < 2; i++) {
      window.setTimeout(() => {
        if (this.running) this.trySpawn();
      }, i * 400);
    }
  }

  stop(): void {
    this.running = false;
  }

  update(dt: number): void {
    if (!this.running) return;
    this.elapsed += dt * 1000;

    for (const t of [...this.targets]) {
      t.update(dt);
    }
    for (let i = this.targets.length - 1; i >= 0; i--) {
      if (!this.targets[i]!.root.parent) {
        this.targets.splice(i, 1);
      }
    }

    if (this.elapsed >= this.nextAt) {
      this.trySpawn();
      if (Math.random() < 0.35) this.trySpawn();
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
  }

  private trySpawn(): void {
    const live = this.targets.filter((t) => t.active).length;
    if (live >= gameConfig.maxTargets) return;

    const kind = this.pickKind();
    if (!kind) return;

    const b = gameConfig.roamBounds;
    const pos = new THREE.Vector3(
      b.minX + Math.random() * (b.maxX - b.minX),
      gameConfig.groundY,
      b.minZ + Math.random() * (b.maxZ - b.minZ),
    );

    const target = new Target(this.scene, kind, pos, this.onEscape);
    this.targets.push(target);
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
