import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';
import type { GameMode } from '../config/gameConfig';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import { Target } from '../entities/Target';
import { AmmoSystem } from '../systems/Ammo';
import { Spawner } from '../systems/Spawner';
import { HUD } from '../ui/HUD';
import { clearUI } from '../ui/dom';

export class PlayScene implements GameScene {
  readonly id = 'play' as const;
  private mode: GameMode = 'endless';
  private score = 0;
  private lives: number = gameConfig.startLives;
  private timeLeft: number = gameConfig.timedSeconds;
  private ended = false;
  private spawner: Spawner | null = null;
  private ammo: AmmoSystem | null = null;
  private hud: HUD | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private unsubs: Array<() => void> = [];
  private muzzleLight: THREE.PointLight | null = null;
  private escapesArmed = false;

  constructor(private ctx: SceneContext) {}

  enter(data?: SceneData): void {
    clearUI(this.ctx.uiRoot);
    this.mode = data?.mode ?? 'endless';
    this.score = 0;
    this.lives = gameConfig.startLives;
    this.timeLeft = gameConfig.timedSeconds;
    this.ended = false;
    this.escapesArmed = false;
    window.setTimeout(() => {
      this.escapesArmed = true;
    }, 4500);

    // Static camera — no aim parallax
    this.ctx.three.camera.position.set(0, 140, 460);
    this.ctx.three.camera.lookAt(0, 110, 40);

    this.ammo = new AmmoSystem();
    this.spawner = new Spawner(this.ctx.three.scene, this.mode, (t) => this.onTargetEscaped(t));
    this.hud = new HUD(this.ctx.uiRoot, this.mode, () => this.onReload());
    this.hud.setScore(this.score);
    this.hud.setLives(this.lives);
    this.hud.setAmmo(this.ammo.current, this.ammo.max, false);

    this.muzzleLight = new THREE.PointLight(0xfff0aa, 0, 80, 2);
    this.ctx.three.scene.add(this.muzzleLight);

    this.unsubs.push(this.ammo.onChange((c, m, r) => this.hud?.setAmmo(c, m, r)));

    const onMove = (e: PointerEvent) => {
      this.hud?.setPointer(e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => {
      if (this.ended) return;
      if (e.clientY < 56) return;
      this.handleShot(e.clientX, e.clientY);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') this.onReload();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    this.unsubs.push(() => window.removeEventListener('pointermove', onMove));
    this.unsubs.push(() => window.removeEventListener('pointerdown', onDown));
    this.unsubs.push(() => window.removeEventListener('keydown', onKey));

    document.body.classList.add('playing');
    this.spawner.start();
  }

  update(dt: number): void {
    if (this.ended) return;
    this.spawner?.update(dt);

    if (this.mode === 'timed') {
      this.timeLeft -= dt;
      this.hud?.setTimer(this.timeLeft);
      if (this.timeLeft <= 0) this.endGame();
    }
  }

  exit(): void {
    document.body.classList.remove('playing');
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.spawner?.stop();
    this.spawner?.clearAll();
    this.spawner = null;
    this.ammo?.destroy();
    this.ammo = null;
    this.hud?.destroy();
    this.hud = null;
    if (this.muzzleLight) {
      this.ctx.three.scene.remove(this.muzzleLight);
      this.muzzleLight = null;
    }
    clearUI(this.ctx.uiRoot);
  }

  private onReload(): void {
    if (this.ended) return;
    this.ammo?.tryReload();
  }

  private handleShot(clientX: number, clientY: number): void {
    if (!this.ammo || !this.spawner || !this.hud) return;

    if (!this.ammo.canShoot()) {
      this.hud.flashDryFire();
      return;
    }
    if (!this.ammo.tryShoot()) return;

    this.pointer.x = (clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.ctx.three.camera);

    // Flash (no shadows / no extra work)
    if (this.muzzleLight) {
      this.muzzleLight.intensity = 3;
      this.muzzleLight.position.copy(this.ctx.three.camera.position);
      window.setTimeout(() => {
        if (this.muzzleLight) this.muzzleLight.intensity = 0;
      }, 50);
    }

    // Raycast proxies only (non-recursive)
    const hitObjs = this.spawner.targets.filter((t) => t.active).flatMap((t) => t.hitObjects);
    const hits = this.raycaster.intersectObjects(hitObjs, false);
    if (hits.length === 0) return;

    let target: Target | undefined;
    for (const hit of hits) {
      const t = hit.object.userData.target as Target | undefined;
      if (t?.active) {
        target = t;
        break;
      }
    }
    if (!target || !target.active) return;

    const destroyed = target.applyHit();
    if (!destroyed) return;
    this.resolveDestroyedTarget(target, clientX, clientY);
  }

  private resolveDestroyedTarget(target: Target, clientX: number, clientY: number): void {
    const { kind } = target;

    if (kind === 'durian') {
      this.addScore(gameConfig.points.durian, clientX, clientY, '#7CFF7C');
    } else if (kind === 'goldDurian') {
      this.addScore(gameConfig.points.goldDurian, clientX, clientY, '#FFD700');
    } else if (kind === 'bubble') {
      this.addScore(gameConfig.points.bubble, clientX, clientY, '#ff6b8a');
      this.changeLives(-1);
    } else if (kind === 'heart') {
      this.changeLives(1);
      this.hud?.spawnFloater(clientX, clientY, '+♥', '#ff2d55');
    }

    target.fadeOut(150);
  }

  private onTargetEscaped(target: Target): void {
    if (this.ended) return;
    if (this.mode !== 'endless' || !this.escapesArmed) return;
    if (target.kind === 'durian' || target.kind === 'goldDurian') {
      this.changeLives(-1);
      this.hud?.spawnFloater(window.innerWidth / 2, 120, 'ESCAPED!', '#ff4444');
    }
  }

  private addScore(delta: number, x: number, y: number, color: string): void {
    this.score = Math.max(0, this.score + delta);
    this.hud?.setScore(this.score);
    const label = delta > 0 ? `+${delta}` : `${delta}`;
    this.hud?.spawnFloater(x, y, label, color);
  }

  private changeLives(delta: number): void {
    if (delta > 0) {
      this.lives = Math.min(gameConfig.maxLives, this.lives + delta);
    } else {
      this.lives = Math.max(0, this.lives + delta);
    }
    this.hud?.setLives(this.lives);
    if (this.lives <= 0) this.endGame();
  }

  private endGame(): void {
    if (this.ended) return;
    this.ended = true;
    this.spawner?.stop();
    window.setTimeout(() => {
      this.ctx.goto('gameOver', { mode: this.mode, score: this.score });
    }, 400);
  }
}
