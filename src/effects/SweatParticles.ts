import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';

interface Droplet {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
}

interface PendingDrop {
  timer: number;
  fanIndex: number;
}

/** Classic anime sweat comma — bubble-blue fill, dark blue outline. */
const SWEAT_TEX = (() => {
  const c = document.createElement('canvas');
  c.width = 20;
  c.height = 26;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#b8e8ff';
  ctx.strokeStyle = '#1e5a9e';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(10, 3);
  ctx.bezierCurveTo(16, 3, 18, 10, 15, 17);
  ctx.quadraticCurveTo(10, 24, 5, 17);
  ctx.bezierCurveTo(2, 10, 4, 3, 10, 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  return tex;
})();

const SWEAT_MAT = new THREE.SpriteMaterial({
  map: SWEAT_TEX,
  transparent: true,
  opacity: 1,
  depthWrite: false,
  depthTest: true,
  toneMapped: false,
});

const _vel = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _worldBack = new THREE.Vector3();
const _localBack = new THREE.Vector3();
const _parentQuat = new THREE.Quaternion();
const _invParentQuat = new THREE.Quaternion();
const DEFAULT_TRAVEL = new THREE.Vector3(0, 0, -1);

const BUBBLE_R = gameConfig.targetSize * 0.42;
const SPAWN_Y = gameConfig.targetSize * 0.28;
/** Pause between 3-drop fan bursts. */
const BURST_INTERVAL = 0.475;
/** Stagger within a burst (1 → 2 → 3). */
const DROP_STAGGER = 0.06;
/** Fan yaw offsets for the three drops (radians) — wide anime fan. */
const FAN_YAWS = [-0.82, 0, 0.82];
/** Launch tilt from vertical toward the mirror side (~45°). */
const LAUNCH_TILT = Math.PI / 4;
const LAUNCH_UP = Math.cos(LAUNCH_TILT);
const LAUNCH_OUT = Math.sin(LAUNCH_TILT);
const POP_SPEED = 78;
const GRAVITY = 95;

function cloneMat(): THREE.SpriteMaterial {
  return SWEAT_MAT.clone();
}

/** Left profile (rotation.y ≈ π) mirrors the comma art horizontally. */
function isProfileFlipped(parent: THREE.Object3D): boolean {
  return Math.cos(parent.rotation.y) < 0;
}

function applyDropSprite(
  sprite: THREE.Sprite,
  vel: THREE.Vector3,
  scale: number,
  flip: boolean,
): void {
  const mat = sprite.material as THREE.SpriteMaterial;
  const rot = Math.atan2(-vel.x, vel.y + 4);
  const sx = scale * 0.92;
  const sy = scale * 1.18;
  if (flip) {
    mat.rotation = -rot;
    sprite.scale.set(-sx, sy, 1);
  } else {
    mat.rotation = rot;
    sprite.scale.set(sx, sy, 1);
  }
}

/**
 * Anime sweat burst for a panicked path-pair bubble — three white comma drops
 * fan outward from the temple, pop fast, fade at end of a short arc.
 *
 * Attached to `attachParent` (usually the target root) so run squash/stretch on
 * the visual does not scale the droplets. Facing comes from `facingParent`.
 */
export class SweatParticles {
  private readonly facing: THREE.Object3D;
  private readonly group = new THREE.Group();
  private readonly droplets: Droplet[] = [];
  private readonly pending: PendingDrop[] = [];
  private burstAcc = 0;
  private travelDir = DEFAULT_TRAVEL.clone();
  private readonly spawnPoint = new THREE.Vector3(-BUBBLE_R, SPAWN_Y, 0);
  private readonly sprayDir = new THREE.Vector3(-1, 0, 0);
  private lastProfileFlipped = false;

  constructor(attachParent: THREE.Object3D, facingParent: THREE.Object3D) {
    this.facing = facingParent;
    attachParent.add(this.group);
  }

  update(dt: number, travelDir?: THREE.Vector3): void {
    if (travelDir && travelDir.lengthSq() > 1e-4) {
      this.travelDir.copy(travelDir).normalize();
    }

    // Match face yaw only — do not follow visual.position (squash feet-anchor).
    this.group.position.set(0, 0, 0);
    this.group.rotation.y = this.facing.rotation.y;

    this.syncLocalBack();
    this.computeSprayLocal(this.sprayDir);
    // Authored face is +X local; sweat always erupts from the card back (−X).
    this.spawnPoint.set(-BUBBLE_R, SPAWN_Y, 0);

    const flipped = isProfileFlipped(this.facing);
    if (flipped !== this.lastProfileFlipped) {
      this.lastProfileFlipped = flipped;
      // Don't carry queued bursts across a profile flip with stale timing.
      this.pending.length = 0;
      this.burstAcc = 0;
    }

    this.burstAcc += dt;
    while (this.burstAcc >= BURST_INTERVAL) {
      this.burstAcc -= BURST_INTERVAL;
      this.queueBurst();
    }

    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i]!;
      p.timer -= dt;
      if (p.timer > 0) continue;
      this.spawnDrop(p.fanIndex);
      this.pending.splice(i, 1);
    }

    for (let i = this.droplets.length - 1; i >= 0; i--) {
      const d = this.droplets[i]!;
      d.life -= dt;
      if (d.life <= 0) {
        this.group.remove(d.sprite);
        (d.sprite.material as THREE.Material).dispose();
        this.droplets.splice(i, 1);
        continue;
      }

      d.vel.y -= GRAVITY * dt;
      d.sprite.position.addScaledVector(d.vel, dt);

      const t = d.life / d.maxLife;
      applyDropSprite(d.sprite, d.vel, d.scale, isProfileFlipped(this.facing));
      const mat = d.sprite.material as THREE.SpriteMaterial;
      mat.opacity = t > 0.25 ? 1 : t / 0.25;
    }
  }

  /** World travel → parent-local "back" (opposite motion, accounts for profile yaw). */
  private syncLocalBack(): void {
    _worldBack.set(-this.travelDir.x, 0, -this.travelDir.z);
    if (_worldBack.lengthSq() < 1e-4) {
      _localBack.set(-1, 0, 0);
      return;
    }
    _worldBack.normalize();
    this.facing.getWorldQuaternion(_parentQuat);
    _invParentQuat.copy(_parentQuat).invert();
    _localBack.copy(_worldBack).applyQuaternion(_invParentQuat);
  }

  /** Fan axis in parent-local XZ — outward from the card back (−X cheek). */
  private computeSprayLocal(out: THREE.Vector3): void {
    out.set(_localBack.x, 0, _localBack.z);
    if (out.lengthSq() < 1e-4) {
      out.set(0, 0, -1);
      return;
    }
    out.normalize();
  }

  private queueBurst(): void {
    for (let i = 0; i < 3; i++) {
      this.pending.push({
        timer: i * DROP_STAGGER,
        fanIndex: i,
      });
    }
  }

  private spawnDrop(fanIndex: number): void {
    const mirror = this.sprayDir;
    const yaw = FAN_YAWS[fanIndex] ?? 0;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const mx = mirror.x * cosY - mirror.z * sinY;
    const mz = mirror.x * sinY + mirror.z * cosY;

    _vel.set(mx * LAUNCH_OUT, LAUNCH_UP, mz * LAUNCH_OUT);
    _vel.normalize().multiplyScalar(POP_SPEED + (Math.random() - 0.5) * 8 + Math.abs(yaw) * 18);

    const sprite = new THREE.Sprite(cloneMat());
    sprite.position.copy(this.spawnPoint);
    _tangent.set(-mirror.z, 0, mirror.x);
    sprite.position.addScaledVector(_tangent, (fanIndex - 1) * 5.5);
    sprite.userData.skipSao = true;
    const scale = 7.5 + Math.random() * 1.5;
    applyDropSprite(sprite, _vel, scale, isProfileFlipped(this.facing));

    const maxLife = 0.42 + Math.random() * 0.12;
    this.group.add(sprite);
    this.droplets.push({
      sprite,
      vel: _vel.clone(),
      life: maxLife,
      maxLife,
      scale,
    });
  }

  dispose(): void {
    for (const d of this.droplets) (d.sprite.material as THREE.Material).dispose();
    this.droplets.length = 0;
    this.pending.length = 0;
    this.group.parent?.remove(this.group);
  }
}
