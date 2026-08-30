import * as THREE from 'three';
import type { TargetKind } from '../config/gameConfig';
import { gameConfig } from '../config/gameConfig';
import {
  CLOSE_BUBBLE_RISE_DURATION,
  CLOSE_RISE_DURATION,
  CLOSE_RISE_HEIGHT,
  CLOSE_SINK_DURATION,
  DOOR_PLANE_Z,
  GATE_PATHS,
  TEETH_FLYBY_PATH_INDEX,
  TEETH_FLYBY_START_X,
  TEETH_FLYBY_Z,
  nearDoorPlane,
  pathUsesDoors,
  type SpawnPattern,
  type WindowSpot,
} from '../config/spawnLayout';
import { ModelCache } from '../world/ModelCache';
import { getDoorController } from '../world/DoorController';
import { SweatParticles } from '../effects/SweatParticles';
import { DustParticles } from '../effects/DustParticles';
import { playChompSoundAt, playTeethFlybyEnterSound, playTeethFlybyExitSound, startBubbleLoop, setBubbleLoopPosition, stopBubbleLoop, type BubbleLoopHandle } from '../audio/sfx';

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

const hpGeo = new THREE.SphereGeometry(1.4, 6, 6);
/** Constant speed along the gate path (world units / second). */
const PATH_SPEED = 95;
/** Play camera XZ — flat targets billboard toward this on ±Z legs. */
const CAM_X = 0;
const CAM_Z = 635;
/** Distance before a corner to show a left/right turn profile instead of camera-facing. */
const PATH_TURN_LOOKAHEAD = 55;
/** Path-run squash/stretch: cycles per second and vertical amplitude. */
const RUN_SQUASH_HZ = 11;
const RUN_SQUASH_AMP = 0.07;

const _pathInDir = new THREE.Vector3();
const _pathOutDir = new THREE.Vector3();
const _bubbleSfxPos = new THREE.Vector3();


export interface TargetSpawnSpec {
  pattern: SpawnPattern;
  /** Window / close slot id when pattern === 'window' | 'close' */
  windowId?: string;
  windowSpot?: WindowSpot;
  /**
   * Path direction: true = lane forward (enter / CCW-as-authored),
   * false = reversed (exit / opposite travel).
   * For teeth: true = enter from left, false = enter from right.
   */
  pathForward?: boolean;
  /**
   * Travel lane: 0 = left gate L, 1 = right gate L,
   * 2 = dome wall U (CCW; reverse via pathForward),
   * 3 = teeth L→R flyby (scripted).
   */
  pathIndex?: number;
  /** Initial distance along a path route (world units). Used for paired path spawns. */
  pathStartOffset?: number;
  /** Lead bubble in a path pair — gets chased by a durian on the same lane. */
  pathPairLead?: boolean;
  /** Either member of a path chase pair (lead or chaser). */
  pathPair?: boolean;
}

/**
 * Pattern-based target: static window holds, close-camera rises,
 * or continuous gate-path travel.
 */
export class Target {
  readonly kind: TargetKind;
  readonly pattern: SpawnPattern;
  readonly windowId: string | null;
  /**
   * Spawned during endless Frenzy — blue glow, and escaping never costs a life
   * (even after Frenzy ends).
   */
  readonly frenzySpawned: boolean;
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
  private heartMat: THREE.MeshBasicMaterial | null = null;
  private teethOpen: THREE.Object3D | null = null;
  private teethClose: THREE.Object3D | null = null;
  private teethOpenState = true;
  private teethChompAge = 0;
  /** World X where the teeth entered (offscreen). */
  private teethEntryX = 0;
  /** Opposite offscreen exit X. */
  private teethExitX = 0;
  /** Horizontal mirror when entering from the right. */
  private teethMirrored = false;
  private teethEnterSfxPlayed = false;
  private teethExitSfxPlayed = false;
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
  private frenzyGlowMats: Array<{
    mat: THREE.Material & { opacity: number };
    baseOpacity: number;
  }> = [];
  private frenzyGlowPulse = 0;

  private waypoints: THREE.Vector3[] = [];
  private cumLen: number[] = [0];
  private pathLen = 0;
  private pathTraveled = 0;
  private from = new THREE.Vector3();
  private phase: 'rise' | 'move' | 'hold' | 'sink' | 'done' = 'move';
  private holdLeft = 0;
  private riseFromY = 0;
  private riseToY = 0;
  private riseT = 0;
  private riseDur = CLOSE_RISE_DURATION;
  private sinkT = 0;
  private sinkDur = CLOSE_SINK_DURATION;
  private sinkFromY = 0;
  private sinkToY = 0;
  private doorRetained = false;
  /** Lane index for GATE_PATHS; only gate L lanes (0–1) drive doors. */
  private pathIndex = 0;
  private pathMoveDir = new THREE.Vector3(0, 0, -1);
  private bobAmp = 0;
  private bobBaseY = 0;
  /** Hit-flash timer (seconds) for gold durian feedback. */
  private hitFlash = 0;
  private flashMats: { mat: THREE.MeshBasicMaterial; r: number; g: number; b: number }[] = [];
  /** Tutorial / scripted beats — never time out or blink away. */
  private readonly pinned: boolean;
  private sweat: SweatParticles | null = null;
  private dust: DustParticles | null = null;
  private bubbleLoop: BubbleLoopHandle | null = null;
  /** Phase for path-run squash/stretch (radians). */
  private runSquashPhase = Math.random() * Math.PI * 2;
  /** Path chase pair — keeps full run squash rate; solo path runners are slower. */
  private readonly pathPair: boolean;

  constructor(
    scene: THREE.Scene,
    kind: TargetKind,
    spec: TargetSpawnSpec,
    onEscape: (t: Target) => void,
    onFreeSlot: () => void,
    frenzySpawned = false,
    pinned = false,
  ) {
    this.kind = kind;
    this.pattern = spec.pattern;
    this.windowId = spec.windowId ?? null;
    this.frenzySpawned = frenzySpawned;
    this.pinned = pinned;
    this.pathPair = !!spec.pathPair || !!spec.pathPairLead;
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
            : kind === 'teeth'
              ? gameConfig.hitsRequired.teeth
              : gameConfig.hitsRequired.durian;
    this.hitsLeft = this.maxHits;

    const lifeRange =
      spec.pattern === 'close' && kind === 'bubble'
        ? gameConfig.closeBubbleLifetimeMs
        : gameConfig.lifetimeMs[kind];
    this.lifetime = randBetween(lifeRange.min, lifeRange.max);
    // Close-camera pops linger half as long as regular holds (bubbles use their own range).
    if (spec.pattern === 'close' && kind !== 'bubble') this.lifetime *= 0.5;

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
    } else if (kind === 'teeth') {
      const holder = new THREE.Group();
      this.teethOpen = ModelCache.cloneModel('teethOpen');
      this.teethClose = ModelCache.cloneModel('teethClose');
      this.teethClose.visible = false;
      holder.add(this.teethOpen);
      holder.add(this.teethClose);
      this.visual = holder;
      this.root.add(holder);
    } else {
      const mesh = ModelCache.createHeart();
      this.heartMat = mesh.material as THREE.MeshBasicMaterial;
      this.visual = mesh;
      this.root.add(mesh);
    }

    const proxy = ModelCache.createHitProxy();
    proxy.userData.target = this;
    this.root.add(proxy);
    this.hitObjects.push(proxy);

    if (kind === 'goldDurian') this.createHpDots();
    if (frenzySpawned) this.attachFrenzyGlow();

    this.setupPath(spec);
    if (kind === 'bubble' && spec.pathPairLead) {
      this.sweat = new SweatParticles(this.root, this.visual);
    }
    if (spec.pattern === 'path' && kind !== 'heart') {
      this.dust = new DustParticles(this.root);
      this.runSquashPhase = Math.random() * Math.PI * 2;
    }
    scene.add(this.root);
    this.root.scale.setScalar(0.01);
    if (kind === 'heart') this.visual.lookAt(CAM_X, this.root.position.y, CAM_Z);
    if (kind === 'bubble') {
      const p = this.root.position;
      this.bubbleLoop = startBubbleLoop(p.x, p.y, p.z, !!spec.pathPairLead);
    }
  }

  /**
   * Blue edge glow hugging the model silhouette (tight BackSide shells —
   * not a detached halo).
   */
  private attachFrenzyGlow(): void {
    // Heart cards use a mapped additive plane — BackSide shells would be a
    // solid rectangle around the transparent quad.
    if (this.kind === 'heart' && this.heartMat && this.visual instanceof THREE.Mesh) {
      for (const shell of [
        { scale: 1.12, opacity: 1 },
        { scale: 1.24, opacity: 0.675 },
      ]) {
        const backMat = this.heartMat.clone();
        backMat.color.setHex(0x3aa8ff);
        backMat.opacity = shell.opacity;
        backMat.depthWrite = false;
        backMat.blending = THREE.AdditiveBlending;
        backMat.transparent = true;
        this.frenzyGlowMats.push({ mat: backMat, baseOpacity: shell.opacity });
        const back = new THREE.Mesh(this.visual.geometry, backMat);
        back.scale.setScalar(shell.scale);
        back.position.z = -0.02;
        back.castShadow = false;
        back.receiveShadow = false;
        back.userData.skipSao = true;
        this.visual.add(back);
      }
      return;
    }

    // Collect first — adding children during traverse would recurse forever.
    const meshes: THREE.Mesh[] = [];
    this.visual.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.geometry) return;
      if (obj.material instanceof THREE.MeshBasicMaterial && !obj.material.visible) return;
      meshes.push(obj);
    });

    const shells: Array<{ scale: number; opacity: number; color: number }> = [
      { scale: 1.068, opacity: 1, color: 0x5ec8ff },
      { scale: 1.135, opacity: 0.825, color: 0x2a8cff },
    ];
    for (const obj of meshes) {
      for (const shell of shells) {
        const mat = new THREE.MeshBasicMaterial({
          color: shell.color,
          side: THREE.BackSide,
          transparent: true,
          opacity: shell.opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        this.frenzyGlowMats.push({ mat, baseOpacity: shell.opacity });
        const outline = new THREE.Mesh(obj.geometry, mat);
        outline.scale.setScalar(shell.scale);
        outline.renderOrder = (obj.renderOrder || 0) - 1;
        obj.add(outline);
      }
    }
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

    if (spec.pattern === 'close' && spec.windowSpot) {
      const p = spec.windowSpot;
      this.from.set(p.x, p.y, p.z);
      this.bobBaseY = p.y;
      this.riseToY = p.y;
      this.riseFromY = p.y - CLOSE_RISE_HEIGHT;
      this.riseDur = this.kind === 'bubble' ? CLOSE_BUBBLE_RISE_DURATION : CLOSE_RISE_DURATION;
      this.riseT = 0;
      this.root.position.set(p.x, this.riseFromY, p.z);
      this.phase = 'rise';
      this.bobAmp = 2.8;
      return;
    }

    this.pathIndex = spec.pathIndex ?? 0;

    // Timed teeth: full offscreen→offscreen dash (random entry side).
    if (this.kind === 'teeth' || this.pathIndex === TEETH_FLYBY_PATH_INDEX) {
      this.setupTeethPath(spec);
      return;
    }

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
    this.rebuildPathLengths(spec.pathStartOffset ?? 0);
    this.bobAmp = 0;
    this.phase = 'move';
    this.placeOnPath(this.pathTraveled);
    this.syncPathMoveDir();
    this.syncPathFacing();
    // Gate L-lanes open doors while approaching — wall routes skip this.
    if (pathUsesDoors(this.pathIndex)) this.retainDoor();
  }

  /**
   * Teeth enter from a random offscreen side and exit the opposite side.
   * `pathForward !== false` → start left; `false` → start right.
   */
  private setupTeethPath(spec: TargetSpawnSpec): void {
    const y = -0.5 + gameConfig.targetSize * 0.5;
    const fromLeft = spec.pathForward !== false;
    this.teethEntryX = fromLeft ? -TEETH_FLYBY_START_X : TEETH_FLYBY_START_X;
    this.teethExitX = -this.teethEntryX;
    // Right-side entrants start mirrored so travel direction matches art.
    this.teethMirrored = !fromLeft;
    this.teethEnterSfxPlayed = false;
    this.teethExitSfxPlayed = false;
    this.waypoints = [
      new THREE.Vector3(this.teethEntryX, y, TEETH_FLYBY_Z),
      new THREE.Vector3(this.teethExitX, y, TEETH_FLYBY_Z),
    ];
    this.rebuildPathLengths(0);
    this.bobAmp = 0;
    this.phase = 'move';
    this.placeOnPath(0);
    this.syncPathMoveDir();
    this.syncPathFacing();
  }

  /** Rebuild cumLen / pathLen from current waypoints; optionally set start offset. */
  private rebuildPathLengths(startOffset = 0): void {
    this.cumLen = [0];
    this.pathLen = 0;
    for (let i = 1; i < this.waypoints.length; i++) {
      this.pathLen += this.waypoints[i - 1]!.distanceTo(this.waypoints[i]!);
      this.cumLen.push(this.pathLen);
    }
    this.pathTraveled = Math.min(startOffset, this.pathLen);
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

    if (this.frenzySpawned && this.frenzyGlowMats.length > 0) {
      this.frenzyGlowPulse += dt * 5;
      const pulse = 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(this.frenzyGlowPulse));
      for (const entry of this.frenzyGlowMats) {
        entry.mat.opacity = entry.baseOpacity * pulse;
      }
    }

    if (this.fading) {
      this.sweat?.update(dt, this.pathMoveDir);
      this.dust?.update(dt, this.pathMoveDir, false);
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
        if (this.heartMat) this.heartMat.opacity = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
      } else {
        this.root.scale.setScalar(this.startScale * (1 - 0.7 * t));
        if (this.heartMat) this.heartMat.opacity = 1 - t;
      }
      if (t >= 1) this.destroy();
      else this.syncBubbleLoop();
      return;
    }

    // Close targets sink below the frame, then despawn once off-camera.
    if (this.phase === 'sink') {
      this.sweat?.update(dt, this.pathMoveDir);
      this.dust?.update(dt, this.pathMoveDir, false);
      this.sinkT += dt / this.sinkDur;
      const t = Math.min(1, this.sinkT);
      // Ease-in quad — starts moving right away, accelerates out of frame.
      const e = t * t;
      this.root.position.y = this.sinkFromY + (this.sinkToY - this.sinkFromY) * e;
      if (t >= 1) this.destroy();
      else this.syncBubbleLoop();
      return;
    }

    if (this.cleared || this.escaped) {
      this.syncBubbleLoop();
      return;
    }

    this.age += dt * 1000;
    // Close targets re-zero age after rising — don't replay the pop-in then.
    const doPop = this.age < 180 && !(this.pattern === 'close' && this.phase === 'hold');
    const pop = doPop ? 0.55 + 0.55 * Math.sin((this.age / 180) * Math.PI) : 1;

    if (this.phase === 'rise') {
      this.riseT += dt / this.riseDur;
      const t = Math.min(1, this.riseT);
      // Ease-out so it decelerates into the hold.
      const e = 1 - (1 - t) * (1 - t) * (1 - t);
      this.root.position.y = this.riseFromY + (this.riseToY - this.riseFromY) * e;
      if (t >= 1) {
        this.root.position.y = this.riseToY;
        this.phase = 'hold';
        this.holdLeft = this.lifetime / 1000;
        // Stay / blink timer starts once risen — not during the entrance.
        this.age = 0;
      }
    } else if (this.phase === 'move') {
      let speed = this.kind === 'teeth' ? gameConfig.teethPathSpeed : PATH_SPEED;
      if (this.pathPair && this.kind !== 'teeth') speed *= 1.3;
      this.pathTraveled += speed * dt;
      if (this.pathTraveled >= this.pathLen) {
        this.placeOnPath(this.pathLen);
        this.releaseDoor();
        this.finishEscape();
      } else {
        this.placeOnPath(this.pathTraveled);
        // Flat lawn dash — never inherit bob/pitch from other movers.
        if (this.kind === 'teeth' && this.waypoints[0]) {
          this.root.position.y = this.waypoints[0]!.y;
        }
        this.syncPathMoveDir();
        this.syncPathFacing();
        this.syncTeethFlybySfx();
        this.syncDoorForPosition();
      }
    } else if (this.phase === 'hold') {
      if (!this.pinned) this.holdLeft -= dt;
      if (this.pattern === 'window' || this.pattern === 'close') {
        this.root.position.y = this.bobBaseY + Math.sin(this.age / 220) * this.bobAmp;
      }
      if (!this.pinned && this.holdLeft <= 0) {
        this.finishEscape();
      }
    }

    this.root.scale.setScalar(pop);
    this.syncRunSquash(dt);
    this.syncTeethChomp(dt);

    if (this.kind === 'heart' && !this.knockDown) {
      this.visual.lookAt(CAM_X, this.root.position.y, CAM_Z);
    } else if (this.pattern !== 'path' || this.phase !== 'move') {
      this.visual.rotation.y = 0;
    }

    // Path movers keep going until the route ends — don't cut them mid-path.
    // Close targets telegraph exit by sinking (no blink-out). Windows still blink.
    if (this.pattern === 'window' && this.phase === 'hold' && !this.pinned) {
      if (this.age >= this.lifetime * 0.8 && this.age < this.lifetime) {
        const on = Math.sin(this.age / 60) > 0;
        if (on !== this.warned) {
          this.warned = on;
          this.visual.visible = on;
        }
      }
      if (this.age >= this.lifetime) {
        this.finishEscape();
      }
    } else if (this.pattern === 'close' && this.phase === 'hold' && !this.pinned) {
      if (this.age >= this.lifetime) {
        this.finishEscape();
      }
    }

    this.sweat?.update(dt, this.pathMoveDir);
    this.dust?.update(dt, this.pathMoveDir, this.phase === 'move' && this.pattern === 'path');
    this.syncBubbleLoop();
  }

  private syncBubbleLoop(): void {
    if (!this.bubbleLoop || this.bubbleLoop.stopped) return;
    this.root.getWorldPosition(_bubbleSfxPos);
    setBubbleLoopPosition(this.bubbleLoop, _bubbleSfxPos.x, _bubbleSfxPos.y, _bubbleSfxPos.z);
  }

  private stopBubbleSfx(): void {
    stopBubbleLoop(this.bubbleLoop);
    this.bubbleLoop = null;
  }

  /** Subtle rapid squash/stretch while path-running (not hearts/teeth), feet planted. */
  private syncRunSquash(dt: number): void {
    if (this.kind === 'heart' || this.kind === 'teeth' || this.knockDown) return;
    if (this.pattern === 'path' && this.phase === 'move') {
      // Solo path runners: 75% slower squash than chase-pair members.
      const hz = this.pathPair ? RUN_SQUASH_HZ : RUN_SQUASH_HZ * 0.25;
      this.runSquashPhase += dt * hz * Math.PI * 2;
      const s = Math.sin(this.runSquashPhase);
      const sy = 1 + s * RUN_SQUASH_AMP;
      const sxz = 1 - s * RUN_SQUASH_AMP * 0.55;
      this.visual.scale.set(sxz, sy, sxz);
      // Scale is centered on the mesh; lift so the feet stay put.
      const halfH = gameConfig.targetSize * 0.5;
      this.visual.position.y = halfH * (sy - 1);
      return;
    }
    this.visual.scale.set(1, 1, 1);
    this.visual.position.y = 0;
  }

  /** Swap open/closed teeth meshes on a fixed chomp cadence. */
  private syncTeethChomp(dt: number): void {
    if (this.kind !== 'teeth' || !this.teethOpen || !this.teethClose) return;
    if (this.knockDown || this.fading) return;
    this.teethChompAge += dt * 1000;
    if (this.teethChompAge < gameConfig.teethChompIntervalMs) return;
    this.teethChompAge = 0;
    this.teethOpenState = !this.teethOpenState;
    this.teethOpen.visible = this.teethOpenState;
    this.teethClose.visible = !this.teethOpenState;
    // Bite cue on the closed pose, only while the teeth are on-screen and not
    // fully hidden behind the keep; spatialized at the target.
    if (!this.teethOpenState && this.isTeethVisuallyExposed()) {
      const p = this.root.position;
      playChompSoundAt(p.x, p.y, p.z);
    }
  }

  /**
   * True while the teeth peek on either side of the keep (not off-screen and
   * not mid-pass behind the castle mesh).
   */
  isTeethVisuallyExposed(): boolean {
    const ax = Math.abs(this.root.position.x);
    const castleHalf = 145;
    const appearX = 520;
    return ax > castleHalf && ax < appearX;
  }

  /**
   * Flyby whooshes: first when the teeth come on-screen, then again when they
   * clear the keep and appear on the far side.
   */
  private syncTeethFlybySfx(): void {
    if (this.kind !== 'teeth' || this.knockDown || this.fading) return;
    const x = this.root.position.x;
    const fromLeft = this.teethEntryX < 0;
    // Rough on-screen edge at flyby depth; keep half-width ≈ tower line.
    const appearX = 520;
    const castleHalf = 145;

    if (!this.teethEnterSfxPlayed) {
      const appeared = fromLeft ? x >= -appearX : x <= appearX;
      if (appeared) {
        this.teethEnterSfxPlayed = true;
        playTeethFlybyEnterSound();
      }
    }

    if (this.teethEnterSfxPlayed && !this.teethExitSfxPlayed) {
      const otherSide = fromLeft ? x >= castleHalf : x <= -castleHalf;
      if (otherSide) {
        this.teethExitSfxPlayed = true;
        playTeethFlybyExitSound();
      }
    }
  }

  /** Unit direction along the current path segment (XZ-heavy travel). */
  private syncPathMoveDir(): void {
    if (this.waypoints.length < 2) return;
    for (let i = 1; i < this.cumLen.length; i++) {
      if (this.pathTraveled <= this.cumLen[i]!) {
        this.pathMoveDir.subVectors(this.waypoints[i]!, this.waypoints[i - 1]!);
        if (this.pathMoveDir.lengthSq() > 1e-6) this.pathMoveDir.normalize();
        return;
      }
    }
    const n = this.waypoints.length;
    this.pathMoveDir.subVectors(this.waypoints[n - 1]!, this.waypoints[n - 2]!);
    if (this.pathMoveDir.lengthSq() > 1e-6) this.pathMoveDir.normalize();
  }

  /** Index of the segment we are currently traveling (waypoints[i] → waypoints[i+1]). */
  private pathSegmentIndex(): number {
    for (let i = 1; i < this.cumLen.length; i++) {
      if (this.pathTraveled <= this.cumLen[i]!) return i - 1;
    }
    return Math.max(0, this.waypoints.length - 2);
  }

  /** Signed turn at end of segment: +1 = left, −1 = right, 0 = straight. */
  private turnSignAtSegmentEnd(segIdx: number): number {
    const a = this.waypoints[segIdx];
    const b = this.waypoints[segIdx + 1];
    const c = this.waypoints[segIdx + 2];
    if (!a || !b || !c) return 0;
    _pathInDir.subVectors(b, a);
    _pathOutDir.subVectors(c, b);
    if (_pathInDir.lengthSq() < 1e-6 || _pathOutDir.lengthSq() < 1e-6) return 0;
    _pathInDir.normalize();
    _pathOutDir.normalize();
    return _pathInDir.x * _pathOutDir.z - _pathInDir.z * _pathOutDir.x;
  }

  /** Y rotation so authored art (+X bubble, −X durian) points along flat world dir. */
  private artYawForDir(dx: number, dz: number): number {
    if (this.kind === 'bubble') return Math.atan2(-dz, dx);
    if (this.kind === 'durian' || this.kind === 'goldDurian') return Math.atan2(dz, -dx);
    return 0;
  }

  /** Y rotation so authored art (+X bubble, −X durian) points along ±X (side profile). */
  private artYawForProfile(side: -1 | 1): number {
    return this.artYawForDir(side, 0);
  }

  /**
   * Pick left (−X) or right (+X) profile — flat art never points down ±Z (edge-on)
   * or straight at the camera.
   */
  private pathProfileSide(): -1 | 1 {
    const mdx = this.pathMoveDir.x;
    const mdz = this.pathMoveDir.z;
    const ax = Math.abs(mdx);
    const az = Math.abs(mdz);

    if (az <= ax) {
      return mdx >= 0 ? 1 : -1;
    }

    const segIdx = this.pathSegmentIndex();
    const distToCorner = this.cumLen[segIdx + 1]! - this.pathTraveled;
    const turn = distToCorner <= PATH_TURN_LOOKAHEAD ? this.turnSignAtSegmentEnd(segIdx) : 0;
    if (turn > 0.15) return -1;
    if (turn < -0.15) return 1;

    const x = this.root.position.x;
    if (Math.abs(x) > 12) return x < 0 ? -1 : 1;

    return mdz > 0 ? 1 : -1;
  }

  /** Path movers always show a left or right profile — never edge-on or camera-facing. */
  private syncPathFacing(): void {
    if (this.pattern !== 'path' || this.phase !== 'move') return;
    if (this.kind === 'teeth') {
      // Yaw toward camera; mirror when entering from the right.
      const dx = CAM_X - this.root.position.x;
      const dz = CAM_Z - this.root.position.z;
      this.visual.rotation.set(0, Math.atan2(dx, dz), 0);
      this.visual.position.y = 0;
      this.visual.scale.set(this.teethMirrored ? -1 : 1, 1, 1);
      return;
    }
    if (this.kind !== 'bubble' && this.kind !== 'durian' && this.kind !== 'goldDurian') return;

    const mdx = this.pathMoveDir.x;
    const mdz = this.pathMoveDir.z;
    if (mdx * mdx + mdz * mdz < 1e-8) return;

    this.visual.rotation.y = this.artYawForProfile(this.pathProfileSide());
  }

  private finishEscape(): void {
    if (this.escaped || this.cleared) return;
    this.escaped = true;
    this.visual.visible = true;
    this.releaseDoor();
    this.onEscape?.(this);

    // Close pops retreat the way they came: sink below the lens, then remove.
    if (this.pattern === 'close') {
      this.phase = 'sink';
      this.sinkT = 0;
      this.sinkDur = CLOSE_SINK_DURATION;
      this.sinkFromY = this.root.position.y;
      // Sink past the rise start so the whole mesh clears the frustum.
      this.sinkToY = this.bobBaseY - CLOSE_RISE_HEIGHT;
      this.bobAmp = 0;
      return;
    }

    this.phase = 'done';
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
      this.stopBubbleSfx();
      // Settle the hit-pulse scale so the tip-over reads cleanly.
      this.root.scale.setScalar(1);
      this.visual.scale.set(1, 1, 1);
      this.visual.position.set(0, 0, 0);
      this.knockHalfH =
        (this.kind === 'heart' ? gameConfig.heartSize : gameConfig.targetSize) * 0.5;
      for (const d of this.hpDots) d.visible = false;
    }
    // Keep the spawn slot occupied until destroy so we never replace in-place
    // while this target is still visible. Spawner also cools the slot after release.
    this.releaseDoor();
  }

  destroy(): void {
    this.stopBubbleSfx();
    this.freeSlot();
    for (const d of this.hpDots) {
      d.parent?.remove(d);
      (d.material as THREE.Material).dispose();
    }
    this.hpDots = [];
    for (const entry of this.frenzyGlowMats) entry.mat.dispose();
    this.frenzyGlowMats = [];
    if (this.ownsGoldMaterials) {
      ModelCache.disposeGoldMaterials(this.visual);
      this.ownsGoldMaterials = false;
    }
    if (this.visual instanceof THREE.Mesh && this.heartMat) {
      ModelCache.disposeHeart(this.visual);
      this.heartMat = null;
    }
    this.sweat?.dispose();
    this.sweat = null;
    this.dust?.dispose();
    this.dust = null;
    this.root.parent?.remove(this.root);
  }
}
