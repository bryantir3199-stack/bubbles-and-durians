import * as THREE from 'three';
import type { TargetKind } from '../config/gameConfig';
import { gameConfig } from '../config/gameConfig';
import { ModelCache } from '../world/ModelCache';

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Hopping target around the castle: FBX for bubble/durian, sprite for gold/heart.
 */
export class Target {
  readonly kind: TargetKind;
  readonly root: THREE.Group;
  /** Object(s) used for raycast hits */
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
  private visual: THREE.Object3D;
  private spriteMat: THREE.SpriteMaterial | null = null;

  /** Ground hopping state */
  private hopT = 0;
  private hopDuration = 0.5;
  private hopHeight = 40;
  private hopFrom = new THREE.Vector3();
  private hopTo = new THREE.Vector3();
  private dwelling = false;
  private dwellLeft = 0;
  private squash = 1;

  constructor(
    scene: THREE.Scene,
    kind: TargetKind,
    position: THREE.Vector3,
    onEscape: (t: Target) => void,
  ) {
    this.kind = kind;
    this.onEscape = onEscape;
    this.root = new THREE.Group();
    this.root.position.copy(position);
    this.root.position.y = gameConfig.groundY;
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
      this.visual.traverse((o) => {
        if (o instanceof THREE.Mesh) this.hitObjects.push(o);
      });
      if (this.hitObjects.length === 0) this.hitObjects.push(this.visual);
      this.baseScale = 1;
    } else {
      const map =
        kind === 'goldDurian' ? ModelCache.getTexture('goldDurian') : ModelCache.getTexture('heart');
      this.spriteMat = new THREE.SpriteMaterial({
        map,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(this.spriteMat);
      const size = kind === 'heart' ? gameConfig.heartSize : gameConfig.goldSize;
      this.baseScale = size;
      sprite.scale.set(size, size, 1);
      this.visual = sprite;
      this.root.add(sprite);
      this.hitObjects.push(sprite);
    }

    if (kind === 'bubble' || kind === 'durian') {
      const proxy = new THREE.Mesh(
        new THREE.SphereGeometry(gameConfig.targetSize * 0.45, 8, 8),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      proxy.userData.target = this;
      this.root.add(proxy);
      this.hitObjects.push(proxy);
    }

    scene.add(this.root);

    if (kind === 'goldDurian') {
      this.createHpDots(scene);
    }

    this.setOpacity(0);
    this.beginHop();
  }

  get active(): boolean {
    return !this.cleared && !this.escaped;
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  private createHpDots(scene: THREE.Scene): void {
    const geo = new THREE.SphereGeometry(1.4, 8, 8);
    for (let i = 0; i < this.maxHits; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
      const dot = new THREE.Mesh(geo, mat);
      scene.add(dot);
      this.hpDots.push(dot);
    }
    this.layoutHpDots();
  }

  private layoutHpDots(): void {
    const spacing = 5;
    const startX = this.root.position.x - ((this.maxHits - 1) * spacing) / 2;
    this.hpDots.forEach((dot, i) => {
      const filled = i < this.hitsLeft;
      (dot.material as THREE.MeshBasicMaterial).color.setHex(filled ? 0xffd700 : 0x444444);
      dot.position.set(
        startX + i * spacing,
        this.root.position.y + this.baseScale * 0.55,
        this.root.position.z + 2,
      );
      dot.visible = this.active;
    });
  }

  private setOpacity(op: number): void {
    if (this.spriteMat) {
      this.spriteMat.opacity = op;
      return;
    }
    this.visual.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        m.transparent = true;
        m.opacity = op;
        m.depthWrite = op >= 0.99;
      }
    });
  }

  /** Returns true if this hit destroyed the target. */
  applyHit(): boolean {
    if (this.cleared || this.escaped) return true;
    this.hitsLeft -= 1;

    this.root.scale.setScalar(1.12);
    window.setTimeout(() => {
      if (this.root.parent) this.root.scale.set(1, this.squash, 1);
    }, 80);

    this.layoutHpDots();
    if (this.hitsLeft <= 0) {
      this.cleared = true;
    }
    return this.hitsLeft <= 0;
  }

  private beginHop(): void {
    const b = gameConfig.roamBounds;
    const h = gameConfig.hop;
    this.dwelling = false;
    this.hopT = 0;
    this.hopDuration = randBetween(h.durationMin, h.durationMax);
    // Bubbles hop a bit higher / floatier
    const heightScale = this.kind === 'bubble' ? 1.25 : this.kind === 'heart' ? 1.1 : 1;
    this.hopHeight = randBetween(h.heightMin, h.heightMax) * heightScale;

    this.hopFrom.set(this.root.position.x, gameConfig.groundY, this.root.position.z);

    const dist = randBetween(h.distanceMin, h.distanceMax);
    const angle = Math.random() * Math.PI * 2;
    let tx = this.hopFrom.x + Math.cos(angle) * dist;
    let tz = this.hopFrom.z + Math.sin(angle) * dist;
    tx = clamp(tx, b.minX, b.maxX);
    tz = clamp(tz, b.minZ, b.maxZ);
    // If clamp collapsed the hop, nudge toward center of yard
    if (Math.hypot(tx - this.hopFrom.x, tz - this.hopFrom.z) < 12) {
      tx = clamp(this.hopFrom.x + randBetween(-60, 60), b.minX, b.maxX);
      tz = clamp(this.hopFrom.z + randBetween(-50, 50), b.minZ, b.maxZ);
    }
    this.hopTo.set(tx, gameConfig.groundY, tz);
  }

  private land(): void {
    this.root.position.x = this.hopTo.x;
    this.root.position.y = gameConfig.groundY;
    this.root.position.z = this.hopTo.z;
    this.dwelling = true;
    this.dwellLeft = randBetween(gameConfig.hop.dwellMin, gameConfig.hop.dwellMax);
    this.squash = 0.72;
  }

  update(dt: number): void {
    if (this.cleared || this.escaped) return;

    this.age += dt * 1000;

    // Pop-in first 200ms
    if (this.age < 200) {
      const t = this.age / 200;
      this.setOpacity(t);
    } else if (this.age < 220) {
      this.setOpacity(1);
    }

    if (this.dwelling) {
      this.dwellLeft -= dt;
      // Recover squash after landing
      this.squash += (1 - this.squash) * Math.min(1, dt * 10);
      if (this.dwellLeft <= 0) this.beginHop();
    } else {
      this.hopT += dt / this.hopDuration;
      const t = Math.min(1, this.hopT);
      // Smooth horizontal lerp
      const ease = t * t * (3 - 2 * t);
      this.root.position.x = this.hopFrom.x + (this.hopTo.x - this.hopFrom.x) * ease;
      this.root.position.z = this.hopFrom.z + (this.hopTo.z - this.hopFrom.z) * ease;
      // Parabolic arc
      this.root.position.y = gameConfig.groundY + this.hopHeight * 4 * t * (1 - t);
      // Stretch in air, squash near landing
      this.squash = 1 + 0.18 * Math.sin(t * Math.PI);
      if (t >= 1) this.land();
    }

    // Apply squash/stretch to root (keep hit flash compatible)
    const s = this.age < 200 ? 0.6 + 0.5 * Math.sin((this.age / 200) * Math.PI) : 1;
    this.root.scale.set(s, s * this.squash, s);

    // Face camera (+Z) — GLBs are flat cards; avoid edge-on spins
    if (this.kind === 'bubble' || this.kind === 'durian') {
      this.visual.rotation.set(0, 0, 0);
    } else if (this.spriteMat) {
      this.spriteMat.rotation += 0.01 * (dt * 60) * (this.kind === 'goldDurian' ? 1 : 0.5);
    }

    if (this.age >= this.lifetime * 0.75 && this.age < this.lifetime) {
      const pulse = 0.55 + 0.45 * Math.sin(this.age / 60);
      this.setOpacity(pulse);
    }

    this.layoutHpDots();

    if (this.age >= this.lifetime) {
      this.escaped = true;
      this.onEscape?.(this);
      this.fadeOut();
    }
  }

  fadeOut(durationMs = 200): void {
    const start = performance.now();
    const startScale = this.root.scale.x;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      this.setOpacity(1 - t);
      this.root.scale.setScalar(startScale * (1 - 0.6 * t));
      if (t < 1) requestAnimationFrame(tick);
      else this.destroy();
    };
    requestAnimationFrame(tick);
  }

  destroy(): void {
    this.hpDots.forEach((d) => {
      d.parent?.remove(d);
      d.geometry.dispose();
      (d.material as THREE.Material).dispose();
    });
    this.hpDots = [];
    this.root.parent?.remove(this.root);
    this.spriteMat?.dispose();
    this.visual.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (
          obj.geometry.type === 'SphereGeometry' &&
          obj.material instanceof THREE.MeshBasicMaterial &&
          !obj.material.visible
        ) {
          obj.geometry.dispose();
          obj.material.dispose();
        }
      }
    });
  }
}
