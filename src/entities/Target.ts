import * as THREE from 'three';
import type { TargetKind } from '../config/gameConfig';
import { gameConfig } from '../config/gameConfig';
import {
  PATHS,
  segmentCrossesDoor,
  type SpawnPattern,
  type WindowSpot,
} from '../config/spawnLayout';
import { ModelCache } from '../world/ModelCache';
import { getDoorController } from '../world/DoorController';

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

const hpGeo = new THREE.SphereGeometry(1.4, 6, 6);

export interface TargetSpawnSpec {
  pattern: SpawnPattern;
  /** Window slot id when pattern === 'window' */
  windowId?: string;
  windowSpot?: WindowSpot;
  /**
   * Path direction: true = PATHS forward (typically inside → outside / exit),
   * false = reversed (enter).
   */
  pathForward?: boolean;
}

/**
 * Pattern-based target: static window holds, or travel along castle path empties.
 */
export class Target {
  readonly kind: TargetKind;
  readonly pattern: SpawnPattern;
  readonly windowId: string | null;
  readonly root: THREE.Group;
  readonly hitObjects: THREE.Object3D[] = [];
  hitsLeft: number;
  readonly maxHits: number;

  private lifetime: number;
  private age = 0;
  private cleared = false;
  private escaped = false;
  private hpDots: THREE.Mesh[] = [];
  private onEscape: ((t: Target) => void) | null = null;
  private onFreeSlot: (() => void) | null = null;
  private visual: THREE.Object3D;
  private spriteMat: THREE.SpriteMaterial | null = null;
  private ownsGoldMaterials = false;
  private fading = false;
  private fadeT = 0;
  private fadeDur = 0.15;
  private startScale = 1;
  private warned = false;
  private slotFreed = false;

  private waypoints: THREE.Vector3[] = [];
  private segment = 0;
  private segmentNeedsDoor: boolean[] = [];
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private moveT = 0;
  private moveDur = 1;
  private phase: 'waitDoor' | 'move' | 'hold' | 'done' = 'move';
  private holdLeft = 0;
  private doorRetained = false;
  private bobAmp = 0;

  constructor(
    scene: THREE.Scene,
    kind: TargetKind,
    spec: TargetSpawnSpec,
    onEscape: (t: Target) => void,
    onFreeSlot: () => void,
  ) {
    this.kind = kind;
    this.pattern = spec.pattern;
    this.windowId = spec.windowId ?? null;
    this.onEscape = onEscape;
    this.onFreeSlot = onFreeSlot;
    this.root = new THREE.Group();
    this.root.userData.target = this;

    this.maxHits =
      kind === 'goldDurian'
        ? gameConfig.hitsRequired.goldDurian
        : kind === 'heart'
          ? gameConfig.hitsRequired.heart
          : kind === 'bubble'
            ? gameConfig.hitsRequired.bubble
            : gameConfig.hitsRequired.durian;
    this.hitsLeft = this.maxHits;

    const lifeRange = gameConfig.lifetimeMs[kind];
    this.lifetime = randBetween(lifeRange.min, lifeRange.max);

    if (kind === 'bubble') {
      this.visual = ModelCache.cloneModel('bubble');
      this.root.add(this.visual);
    } else if (kind === 'durian') {
      this.visual = ModelCache.cloneModel('durian');
      this.root.add(this.visual);
    } else if (kind === 'goldDurian') {
      this.visual = ModelCache.cloneGoldDurian();
      this.ownsGoldMaterials = true;
      this.root.add(this.visual);
    } else {
      const map = ModelCache.getTexture('heart');
      this.spriteMat = new THREE.SpriteMaterial({
        map,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        opacity: 1,
      });
      const sprite = new THREE.Sprite(this.spriteMat);
      const size = gameConfig.heartSize;
      sprite.scale.set(size, size, 1);
      this.visual = sprite;
      this.root.add(sprite);
    }

    const proxy = ModelCache.createHitProxy();
    proxy.userData.target = this;
    this.root.add(proxy);
    this.hitObjects.push(proxy);

    if (kind === 'goldDurian') this.createHpDots();

    this.setupPath(spec);
    scene.add(this.root);
    this.root.scale.setScalar(0.01);
  }

  get active(): boolean {
    return !this.cleared && !this.escaped && !this.fading;
  }

  /** Still occupying a slot on screen (including fade-out). */
  get onScreen(): boolean {
    return !!this.root.parent;
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  private setupPath(spec: TargetSpawnSpec): void {
    if (spec.pattern === 'window' && spec.windowSpot) {
      const p = spec.windowSpot;
      this.from.set(p.x, p.y, p.z);
      this.to.copy(this.from);
      this.root.position.copy(this.from);
      this.phase = 'hold';
      this.holdLeft = this.lifetime / 1000;
      this.bobAmp = 3.5;
      return;
    }

    // Travel exclusively along castle path empties.
    const pts = PATHS.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    if (pts.length < 2) {
      // Degenerate fallback: hold at first point / origin
      const p = pts[0] ?? new THREE.Vector3();
      this.from.copy(p);
      this.to.copy(p);
      this.root.position.copy(p);
      this.phase = 'hold';
      this.holdLeft = this.lifetime / 1000;
      return;
    }

    const forward = spec.pathForward !== false;
    this.waypoints = forward ? pts : [...pts].reverse();
    this.segmentNeedsDoor = [];
    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const a = this.waypoints[i]!;
      const b = this.waypoints[i + 1]!;
      this.segmentNeedsDoor.push(
        segmentCrossesDoor(
          { x: a.x, y: a.y, z: a.z },
          { x: b.x, y: b.y, z: b.z },
        ),
      );
    }

    this.segment = 0;
    this.beginSegment(0);
  }

  private beginSegment(index: number): void {
    this.segment = index;
    this.from.copy(this.waypoints[index]!);
    this.to.copy(this.waypoints[index + 1]!);
    this.root.position.copy(this.from);
    const dist = this.from.distanceTo(this.to);
    // Duration scales with path length so depth travel reads at a steady pace.
    this.moveDur = Math.max(1.6, dist / 70);
    this.moveT = 0;
    // No vertical bob on path travel — motion should read as closer/further.
    this.bobAmp = 0;

    if (this.segmentNeedsDoor[index]) {
      this.phase = 'waitDoor';
      this.retainDoor();
    } else {
      this.phase = 'move';
      this.releaseDoor();
    }
  }

  private retainDoor(): void {
    const doors = getDoorController();
    if (!doors || this.doorRetained) return;
    doors.retain();
    this.doorRetained = true;
  }

  private releaseDoor(): void {
    if (!this.doorRetained) return;
    getDoorController()?.release();
    this.doorRetained = false;
  }

  private freeSlot(): void {
    if (this.slotFreed) return;
    this.slotFreed = true;
    this.releaseDoor();
    this.onFreeSlot?.();
  }

  private createHpDots(): void {
    for (let i = 0; i < this.maxHits; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
      const dot = new THREE.Mesh(hpGeo, mat);
      this.root.add(dot);
      this.hpDots.push(dot);
    }
    this.layoutHpDots();
  }

  private layoutHpDots(): void {
    if (this.hpDots.length === 0) return;
    const spacing = 5;
    const startX = -((this.maxHits - 1) * spacing) / 2;
    const y = gameConfig.targetSize * 0.55;
    this.hpDots.forEach((dot, i) => {
      (dot.material as THREE.MeshBasicMaterial).color.setHex(i < this.hitsLeft ? 0xffd700 : 0x444444);
      dot.position.set(startX + i * spacing, y, 2);
      dot.visible = this.active;
    });
  }

  applyHit(): boolean {
    if (!this.active) return true;
    this.hitsLeft -= 1;
    this.root.scale.setScalar(1.12);
    this.layoutHpDots();
    if (this.hitsLeft <= 0) this.cleared = true;
    return this.hitsLeft <= 0;
  }

  update(dt: number): void {
    if (this.fading) {
      this.fadeT += dt / this.fadeDur;
      const t = Math.min(1, this.fadeT);
      this.root.scale.setScalar(this.startScale * (1 - 0.7 * t));
      if (this.spriteMat) this.spriteMat.opacity = 1 - t;
      if (t >= 1) this.destroy();
      return;
    }
    if (this.cleared || this.escaped) return;

    this.age += dt * 1000;
    const pop = this.age < 180 ? 0.55 + 0.55 * Math.sin((this.age / 180) * Math.PI) : 1;

    if (this.phase === 'waitDoor') {
      const doors = getDoorController();
      if (!doors || doors.isOpenEnough) {
        this.phase = 'move';
        this.moveT = 0;
      }
    } else if (this.phase === 'move') {
      this.moveT += dt / this.moveDur;
      const u = Math.min(1, this.moveT);
      const ease = u * u * (3 - 2 * u);
      this.root.position.lerpVectors(this.from, this.to, ease);
      this.root.position.y += Math.sin(u * Math.PI) * this.bobAmp * 0.15;
      if (u >= 1) {
        this.releaseDoor();
        if (this.segment + 1 < this.waypoints.length - 1) {
          this.beginSegment(this.segment + 1);
        } else {
          // Reached end of path — brief pause then leave
          this.phase = 'hold';
          this.holdLeft = 0.35;
        }
      }
    } else if (this.phase === 'hold') {
      this.holdLeft -= dt;
      if (this.pattern === 'window') {
        this.root.position.y = this.from.y + Math.sin(this.age / 220) * this.bobAmp;
      }
      if (this.holdLeft <= 0) {
        this.finishEscape();
      }
    }

    this.root.scale.setScalar(pop);

    if (this.age >= this.lifetime * 0.8 && this.age < this.lifetime) {
      const on = Math.sin(this.age / 60) > 0;
      if (on !== this.warned) {
        this.warned = on;
        this.visual.visible = on;
      }
    }

    if (this.age >= this.lifetime && this.phase !== 'done') {
      this.finishEscape();
    }
  }

  private finishEscape(): void {
    if (this.escaped || this.cleared) return;
    this.escaped = true;
    this.phase = 'done';
    this.visual.visible = true;
    this.releaseDoor();
    this.onEscape?.(this);
    this.fadeOut();
  }

  fadeOut(durationMs = 150): void {
    this.fading = true;
    this.fadeT = 0;
    this.fadeDur = durationMs / 1000;
    this.startScale = this.root.scale.x;
    // Keep the spawn slot occupied until destroy so we never replace in-place
    // while this target is still visible.
    this.releaseDoor();
  }

  destroy(): void {
    this.freeSlot();
    for (const d of this.hpDots) {
      d.parent?.remove(d);
      (d.material as THREE.Material).dispose();
    }
    this.hpDots = [];
    if (this.ownsGoldMaterials) {
      ModelCache.disposeGoldMaterials(this.visual);
      this.ownsGoldMaterials = false;
    }
    this.root.parent?.remove(this.root);
    this.spriteMat?.dispose();
  }
}
