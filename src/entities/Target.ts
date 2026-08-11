import * as THREE from 'three';
import type { TargetKind } from '../config/gameConfig';
import { gameConfig } from '../config/gameConfig';
import {
  DOOR_PLANE_Z,
  GATE_PATHS,
  nearDoorPlane,
  pathUsesDoors,
  type SpawnPattern,
  type WindowSpot,
} from '../config/spawnLayout';
import { ModelCache } from '../world/ModelCache';
import { getDoorController } from '../world/DoorController';

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

const hpGeo = new THREE.SphereGeometry(1.4, 6, 6);
/** Constant speed along the gate path (world units / second). */
const PATH_SPEED = 95;

export interface TargetSpawnSpec {
  pattern: SpawnPattern;
  /** Window slot id when pattern === 'window' */
  windowId?: string;
  windowSpot?: WindowSpot;
  /**
   * Path direction: true = lane forward (enter / CCW-as-authored),
   * false = reversed (exit / opposite travel).
   */
  pathForward?: boolean;
  /**
   * Travel lane: 0 = left gate L, 1 = right gate L,
   * 2 = dome wall U (CCW; reverse via pathForward).
   */
  pathIndex?: number;
}

/**
 * Pattern-based target: static window holds, or continuous gate-path travel.
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
  /** Kill anim: tip over backward 90° instead of shrinking. */
  private knockDown = false;
  private knockHalfH = 0;
  private warned = false;
  private slotFreed = false;

  private waypoints: THREE.Vector3[] = [];
  private cumLen: number[] = [0];
  private pathLen = 0;
  private pathTraveled = 0;
  private from = new THREE.Vector3();
  private phase: 'move' | 'hold' | 'done' = 'move';
  private holdLeft = 0;
  private doorRetained = false;
  /** Lane index for GATE_PATHS; only gate L lanes (0–1) drive doors. */
  private pathIndex = 0;
  private bobAmp = 0;
  private bobBaseY = 0;
  /** Hit-flash timer (seconds) for gold durian feedback. */
  private hitFlash = 0;
  private flashMats: { mat: THREE.MeshBasicMaterial; r: number; g: number; b: number }[] = [];

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
      this.bobBaseY = p.y;
      this.root.position.copy(this.from);
      this.phase = 'hold';
      this.holdLeft = this.lifetime / 1000;
      this.bobAmp = 3.5;
      return;
    }

    this.pathIndex = spec.pathIndex ?? 0;
    const lane = GATE_PATHS[this.pathIndex] ?? GATE_PATHS[0]!;
    const pts = lane.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    if (pts.length < 2) {
      const p = pts[0] ?? new THREE.Vector3();
      this.from.copy(p);
      this.root.position.copy(p);
      this.phase = 'hold';
      this.holdLeft = this.lifetime / 1000;
      return;
    }

    // Forward = authored direction (enter / CCW); reverse = opposite travel.
    const forward = spec.pathForward !== false;
    this.waypoints = forward ? pts : [...pts].reverse();
    this.cumLen = [0];
    this.pathLen = 0;
    for (let i = 1; i < this.waypoints.length; i++) {
      this.pathLen += this.waypoints[i - 1]!.distanceTo(this.waypoints[i]!);
      this.cumLen.push(this.pathLen);
    }
    this.pathTraveled = 0;
    this.bobAmp = 0;
    this.phase = 'move';
    this.placeOnPath(0);
    // Gate L-lanes open doors while approaching — wall routes skip this.
    if (pathUsesDoors(this.pathIndex)) this.retainDoor();
  }

  /** Constant-speed placement along the polyline. */
  private placeOnPath(distance: number): void {
    if (this.waypoints.length === 0) return;
    if (distance <= 0) {
      this.root.position.copy(this.waypoints[0]!);
      return;
    }
    if (distance >= this.pathLen) {
      this.root.position.copy(this.waypoints[this.waypoints.length - 1]!);
      return;
    }
    for (let i = 1; i < this.cumLen.length; i++) {
      if (distance <= this.cumLen[i]!) {
        const start = this.cumLen[i - 1]!;
        const end = this.cumLen[i]!;
        const u = end > start ? (distance - start) / (end - start) : 1;
        this.root.position.lerpVectors(this.waypoints[i - 1]!, this.waypoints[i]!, u);
        return;
      }
    }
  }

  private syncDoorForPosition(): void {
    if (!pathUsesDoors(this.pathIndex)) return;
    if (nearDoorPlane(this.root.position.z, DOOR_PLANE_Z, 40)) {
      this.retainDoor();
    } else if (this.doorRetained) {
      // Past the gate hall — close when clearly clear of the door plane.
      const z = this.root.position.z;
      if (Math.abs(z - DOOR_PLANE_Z) > 45) this.releaseDoor();
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
    if (this.kind === 'goldDurian') this.triggerHitFlash();
    if (this.hitsLeft <= 0) this.cleared = true;
    return this.hitsLeft <= 0;
  }

  private triggerHitFlash(): void {
    if (this.flashMats.length === 0) {
      this.visual.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m instanceof THREE.MeshBasicMaterial) {
            this.flashMats.push({ mat: m, r: m.color.r, g: m.color.g, b: m.color.b });
          }
        }
      });
    }
    this.hitFlash = 0.14;
    for (const entry of this.flashMats) {
      // Hot white/yellow multiply over the gold map.
      entry.mat.color.setRGB(4, 3.6, 1.6);
    }
  }

  update(dt: number): void {
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      const t = this.hitFlash / 0.14;
      for (const entry of this.flashMats) {
        entry.mat.color.setRGB(
          entry.r + (4 - entry.r) * t,
          entry.g + (3.6 - entry.g) * t,
          entry.b + (1.6 - entry.b) * t,
        );
      }
      if (this.hitFlash === 0) {
        for (const entry of this.flashMats) {
          entry.mat.color.setRGB(entry.r, entry.g, entry.b);
        }
      }
    }

    if (this.fading) {
      this.fadeT += dt / this.fadeDur;
      const t = Math.min(1, this.fadeT);
      if (this.knockDown) {
        // Ease-in (gravity): starts with the hit, accelerates into the fall.
        const e = t * t;
        const angle = -Math.PI / 2 * e;
        this.visual.rotation.x = angle;
        // Keep the feet planted: rotate around the base, not the model center.
        const h = this.knockHalfH;
        this.visual.position.set(0, h * (Math.cos(angle) - 1), h * Math.sin(angle));
        // Soft fade on the last third so the body clears cleanly.
        if (this.spriteMat) this.spriteMat.opacity = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
      } else {
        this.root.scale.setScalar(this.startScale * (1 - 0.7 * t));
        if (this.spriteMat) this.spriteMat.opacity = 1 - t;
      }
      if (t >= 1) this.destroy();
      return;
    }
    if (this.cleared || this.escaped) return;

    this.age += dt * 1000;
    const pop = this.age < 180 ? 0.55 + 0.55 * Math.sin((this.age / 180) * Math.PI) : 1;

    if (this.phase === 'move') {
      this.pathTraveled += PATH_SPEED * dt;
      if (this.pathTraveled >= this.pathLen) {
        this.placeOnPath(this.pathLen);
        this.releaseDoor();
        this.finishEscape();
      } else {
        this.placeOnPath(this.pathTraveled);
        this.syncDoorForPosition();
      }
    } else if (this.phase === 'hold') {
      this.holdLeft -= dt;
      if (this.pattern === 'window') {
        this.root.position.y = this.bobBaseY + Math.sin(this.age / 220) * this.bobAmp;
      }
      if (this.holdLeft <= 0) {
        this.finishEscape();
      }
    }

    this.root.scale.setScalar(pop);

    // Path movers keep going until the route ends — don't cut them mid-path.
    if (this.pattern !== 'path') {
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

  /**
   * Remove the target from play. Escapes shrink away; kills can knock down
   * (fall backward 90°) via `{ knockDown: true }`.
   */
  fadeOut(durationMs = 150, opts?: { knockDown?: boolean }): void {
    this.fading = true;
    this.fadeT = 0;
    this.fadeDur = durationMs / 1000;
    this.startScale = this.root.scale.x;
    this.knockDown = !!opts?.knockDown;
    if (this.knockDown) {
      // Settle the hit-pulse scale so the tip-over reads cleanly.
      this.root.scale.setScalar(1);
      this.knockHalfH =
        (this.kind === 'heart' ? gameConfig.heartSize : gameConfig.targetSize) * 0.5;
      for (const d of this.hpDots) d.visible = false;
    }
    // Keep the spawn slot occupied until destroy so we never replace in-place
    // while this target is still visible. Spawner also cools the slot after release.
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
