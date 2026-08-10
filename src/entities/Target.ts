import * as THREE from 'three';
import type { TargetKind } from '../config/gameConfig';
import { gameConfig } from '../config/gameConfig';
import {
  DOOR,
  FRONT_SLIDE,
  WALL_TOP,
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
  /** Door: true = exit castle, false = enter */
  doorExit?: boolean;
  /** Wall / frontSlide direction */
  goRight?: boolean;
}

/**
 * Pattern-based target: windows, door transit, wall-top slide, front L↔R pass.
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
  private baseScale = 1;
  private hpDots: THREE.Mesh[] = [];
  private onEscape: ((t: Target) => void) | null = null;
  private onFreeSlot: (() => void) | null = null;
  private visual: THREE.Object3D;
  private spriteMat: THREE.SpriteMaterial | null = null;
  private fading = false;
  private fadeT = 0;
  private fadeDur = 0.15;
  private startScale = 1;
  private warned = false;
  private slotFreed = false;

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

    if (kind === 'bubble' || kind === 'durian') {
      this.visual = ModelCache.cloneModel(kind);
      this.root.add(this.visual);
      this.baseScale = 1;
    } else {
      const map =
        kind === 'goldDurian' ? ModelCache.getTexture('goldDurian') : ModelCache.getTexture('heart');
      this.spriteMat = new THREE.SpriteMaterial({
        map,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        opacity: 1,
      });
      const sprite = new THREE.Sprite(this.spriteMat);
      const size = kind === 'heart' ? gameConfig.heartSize : gameConfig.goldSize;
      this.baseScale = size;
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

    if (spec.pattern === 'door') {
      const exit = spec.doorExit !== false;
      const a = exit ? DOOR.inside : DOOR.outside;
      const b = exit ? DOOR.outside : DOOR.inside;
      this.from.set(a.x, a.y, a.z);
      this.to.set(b.x, b.y, b.z);
      this.root.position.copy(this.from);
      this.moveDur = randBetween(1.4, 2.0);
      this.phase = 'waitDoor';
      this.retainDoor();
      return;
    }

    if (spec.pattern === 'wall') {
      const right = spec.goRight !== false;
      const x0 = right ? WALL_TOP.minX : WALL_TOP.maxX;
      const x1 = right ? WALL_TOP.maxX : WALL_TOP.minX;
      this.from.set(x0, WALL_TOP.y, WALL_TOP.z);
      this.to.set(x1, WALL_TOP.y, WALL_TOP.z);
      this.root.position.copy(this.from);
      this.moveDur = randBetween(3.2, 4.5);
      this.phase = 'move';
      this.bobAmp = 2;
      return;
    }

    // frontSlide
    const right = spec.goRight !== false;
    const x0 = right ? FRONT_SLIDE.minX : FRONT_SLIDE.maxX;
    const x1 = right ? FRONT_SLIDE.maxX : FRONT_SLIDE.minX;
    const y = FRONT_SLIDE.y + randBetween(-12, 18);
    this.from.set(x0, y, FRONT_SLIDE.z);
    this.to.set(x1, y, FRONT_SLIDE.z);
    this.root.position.copy(this.from);
    this.moveDur = randBetween(3.5, 5.0);
    this.phase = 'move';
    this.bobAmp = 4;
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
    this.hpDots.forEach((dot, i) => {
      (dot.material as THREE.MeshBasicMaterial).color.setHex(i < this.hitsLeft ? 0xffd700 : 0x444444);
      dot.position.set(startX + i * spacing, this.baseScale * 0.55, 2);
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
        if (this.pattern === 'door') {
          // Brief pause outside/inside then leave
          this.phase = 'hold';
          this.holdLeft = 0.35;
          this.releaseDoor();
        } else {
          this.finishEscape();
        }
      }
    } else if (this.phase === 'hold') {
      this.holdLeft -= dt;
      if (this.pattern === 'window') {
        this.root.position.y = this.from.y + Math.sin(this.age / 220) * this.bobAmp;
      }
      if (this.holdLeft <= 0) {
        if (this.pattern === 'window' || this.pattern === 'door') {
          this.finishEscape();
        }
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
    this.freeSlot();
    this.onEscape?.(this);
    this.fadeOut();
  }

  fadeOut(durationMs = 150): void {
    this.fading = true;
    this.fadeT = 0;
    this.fadeDur = durationMs / 1000;
    this.startScale = this.root.scale.x;
    this.freeSlot();
  }

  destroy(): void {
    this.freeSlot();
    for (const d of this.hpDots) {
      d.parent?.remove(d);
      (d.material as THREE.Material).dispose();
    }
    this.hpDots = [];
    this.root.parent?.remove(this.root);
    this.spriteMat?.dispose();
  }
}
