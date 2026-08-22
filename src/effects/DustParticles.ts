import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';

interface Puff {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
}

/** Soft dusty blot — tan/brown, soft edges. */
const DUST_TEX = (() => {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
  g.addColorStop(0, 'rgba(196, 168, 120, 0.85)');
  g.addColorStop(0.45, 'rgba(160, 130, 90, 0.45)');
  g.addColorStop(1, 'rgba(120, 95, 60, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(16, 16, 15, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
})();

const DUST_MAT = new THREE.SpriteMaterial({
  map: DUST_TEX,
  transparent: true,
  opacity: 1,
  depthWrite: false,
  depthTest: true,
  toneMapped: false,
});

const _back = new THREE.Vector3();
const _side = new THREE.Vector3();
const _vel = new THREE.Vector3();
const DEFAULT_TRAVEL = new THREE.Vector3(0, 0, -1);

const FEET_Y = -gameConfig.targetSize * 0.42;
const SPAWN_INTERVAL = 0.055;
const KICK_SPEED = 48;
const UP_SPEED = 26;
const GRAVITY = 55;
const MAX_PUFFS = 28;

function cloneMat(): THREE.SpriteMaterial {
  return DUST_MAT.clone();
}

/**
 * Soft dust puffs kicked behind path runners — spawn at the feet, drift
 * backward and up, fade as they expand.
 */
export class DustParticles {
  private readonly group = new THREE.Group();
  private readonly puffs: Puff[] = [];
  private spawnAcc = 0;
  private travelDir = DEFAULT_TRAVEL.clone();

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
  }

  update(dt: number, travelDir?: THREE.Vector3, active = true): void {
    if (travelDir && travelDir.lengthSq() > 1e-4) {
      this.travelDir.copy(travelDir).normalize();
    }

    if (active) {
      this.spawnAcc += dt;
      while (this.spawnAcc >= SPAWN_INTERVAL) {
        this.spawnAcc -= SPAWN_INTERVAL;
        if (this.puffs.length < MAX_PUFFS) this.spawnPuff();
      }
    } else {
      this.spawnAcc = 0;
    }

    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.sprite);
        (p.sprite.material as THREE.Material).dispose();
        this.puffs.splice(i, 1);
        continue;
      }

      p.vel.y -= GRAVITY * dt;
      p.sprite.position.addScaledVector(p.vel, dt);

      const t = p.life / p.maxLife;
      const grow = 1 + (1 - t) * 1.4;
      p.sprite.scale.setScalar(p.scale * grow);
      (p.sprite.material as THREE.SpriteMaterial).opacity = t * 0.7;
    }
  }

  private spawnPuff(): void {
    _back.set(-this.travelDir.x, 0, -this.travelDir.z);
    if (_back.lengthSq() < 1e-4) _back.set(0, 0, 1);
    else _back.normalize();
    _side.set(-_back.z, 0, _back.x);

    const lateral = (Math.random() - 0.5) * 16;
    const back = 8 + Math.random() * 10;

    const sprite = new THREE.Sprite(cloneMat());
    sprite.position.set(
      _back.x * back + _side.x * lateral,
      FEET_Y + Math.random() * 3,
      _back.z * back + _side.z * lateral,
    );
    sprite.userData.skipSao = true;

    const kick = KICK_SPEED * (0.7 + Math.random() * 0.5);
    _vel.set(
      _back.x * kick + _side.x * (Math.random() - 0.5) * 26,
      UP_SPEED * (0.55 + Math.random() * 0.7),
      _back.z * kick + _side.z * (Math.random() - 0.5) * 26,
    );

    const scale = 8 + Math.random() * 5.5;
    sprite.scale.setScalar(scale);
    (sprite.material as THREE.SpriteMaterial).opacity = 0.65;

    const maxLife = 0.28 + Math.random() * 0.18;
    this.group.add(sprite);
    this.puffs.push({
      sprite,
      vel: _vel.clone(),
      life: maxLife,
      maxLife,
      scale,
    });
  }

  dispose(): void {
    for (const p of this.puffs) (p.sprite.material as THREE.Material).dispose();
    this.puffs.length = 0;
    this.group.parent?.remove(this.group);
  }
}
