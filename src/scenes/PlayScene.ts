import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';
import type { GameMode } from '../config/gameConfig';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import { Target } from '../entities/Target';
import { AmmoSystem } from '../systems/Ammo';
import { Spawner } from '../systems/Spawner';
import { HUD } from '../ui/HUD';
import { clearUI } from '../ui/dom';
import { playDryFireSound, playShootSound, playSquishSound } from '../audio/sfx';

export class PlayScene implements GameScene {
  readonly id = 'play' as const;
  private mode: GameMode = 'endless';
  private score = 0;
  private combo = 1;
  private comboShots = 0;
  private lives: number = gameConfig.startLives;
  private timeLeft: number = gameConfig.timedSeconds;
  private ended = false;
  private spawner: Spawner | null = null;
  private ammo: AmmoSystem | null = null;
  private hud: HUD | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private unsubs: Array<() => void> = [];
  private escapesArmed = false;
  private camKick = 0;
  private camBase = new THREE.Vector3(0, 140, 560);

  constructor(private ctx: SceneContext) {}

  enter(data?: SceneData): void {
    clearUI(this.ctx.uiRoot);
    this.mode = data?.mode ?? 'endless';
    this.score = 0;
    this.combo = 1;
    this.comboShots = 0;
    this.lives = gameConfig.startLives;
    this.timeLeft = gameConfig.timedSeconds;
    this.ended = false;
    this.escapesArmed = false;
    window.setTimeout(() => {
      this.escapesArmed = true;
    }, 4500);

    // Static camera — no aim parallax
    this.camBase.set(0, 140, 560);
    this.camKick = 0;
    this.ctx.three.camera.position.copy(this.camBase);
    this.ctx.three.camera.lookAt(0, 110, 40);

    this.ammo = new AmmoSystem();
    this.spawner = new Spawner(this.ctx.three.scene, this.mode, (t) => this.onTargetEscaped(t));
    this.hud = new HUD(this.ctx.uiRoot, this.mode, () => this.onReload());
    this.hud.setScore(this.score);
    this.hud.setCombo(this.combo, this.comboShots);
    this.hud.setLives(this.lives);
    this.hud.setAmmo(this.ammo.current, this.ammo.max, false);

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
      if (e.key === 'r' || e.key === 'R' || e.code === 'Space') {
        if (e.code === 'Space') e.preventDefault();
        this.onReload();
      }
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

    if (this.camKick > 0) {
      this.camKick = Math.max(0, this.camKick - dt * 9);
      const k = this.camKick;
      this.ctx.three.camera.position.set(
        this.camBase.x,
        this.camBase.y + k * 2.5,
        this.camBase.z + k * 6,
      );
      this.ctx.three.camera.lookAt(0, 110, 40);
    }

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
      playDryFireSound();
      return;
    }
    if (!this.ammo.tryShoot()) return;

    playShootSound();
    this.hud.playShootAnim();
    this.camKick = 1;

    this.pointer.x = (clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.ctx.three.camera);

    // Raycast proxies only (non-recursive)
    const hitObjs = this.spawner.targets.filter((t) => t.active).flatMap((t) => t.hitObjects);
    const hits = this.raycaster.intersectObjects(hitObjs, false);
    if (hits.length === 0) {
      // Missed shot — break combo
      this.resetCombo();
      return;
    }

    let target: Target | undefined;
    for (const hit of hits) {
      const t = hit.object.userData.target as Target | undefined;
      if (t?.active) {
        target = t;
        break;
      }
    }
    if (!target || !target.active) {
      this.resetCombo();
      return;
    }

    const destroyed = target.applyHit();
    if (this.isDurianKind(target.kind)) {
      // Every successful durian hit fills the combo meter
      this.registerComboShot(clientX, clientY);
      this.hud.spawnCrumbs(clientX, clientY);
    }
    if (!destroyed) return;
    this.resolveDestroyedTarget(target, clientX, clientY);
  }

  private isDurianKind(kind: Target['kind']): boolean {
    return kind === 'durian' || kind === 'goldDurian';
  }

  private resolveDestroyedTarget(target: Target, clientX: number, clientY: number): void {
    const { kind } = target;

    if (this.isDurianKind(kind)) {
      playSquishSound();
      const base =
        kind === 'goldDurian' ? gameConfig.points.goldDurian : gameConfig.points.durian;
      const points = base * this.combo;
      const color = kind === 'goldDurian' ? '#FFD700' : '#7CFF7C';
      this.addScore(points, clientX, clientY, color);
    } else if (kind === 'bubble') {
      this.resetCombo();
      this.addScore(gameConfig.points.bubble, clientX, clientY, '#ff6b8a');
      this.changeLives(-1);
    } else if (kind === 'heart') {
      this.resetCombo();
      this.changeLives(1);
      this.hud?.spawnFloater(clientX, clientY, '+♥', '#ff2d55');
    }

    target.fadeOut(150);
  }

  private onTargetEscaped(target: Target): void {
    if (this.ended) return;
    if (this.isDurianKind(target.kind)) {
      // Missed a durian — break combo
      this.resetCombo();
    }
    if (this.mode !== 'endless' || !this.escapesArmed) return;
    if (this.isDurianKind(target.kind)) {
      this.changeLives(-1);
      this.hud?.spawnFloater(window.innerWidth / 2, 120, 'ESCAPED!', '#ff4444');
    }
  }

  private registerComboShot(x: number, y: number): void {
    if (this.combo >= gameConfig.maxCombo) {
      this.comboShots = gameConfig.shotsPerComboLevel;
      this.hud?.setCombo(this.combo, this.comboShots);
      return;
    }

    this.comboShots += 1;
    if (this.comboShots >= gameConfig.shotsPerComboLevel) {
      this.comboShots = 0;
      this.combo += 1;
      this.hud?.setCombo(this.combo, this.comboShots);
      this.hud?.spawnFloater(x, y - 36, `${this.combo}x COMBO!`, '#ffe566');
      return;
    }

    this.hud?.setCombo(this.combo, this.comboShots);
  }

  private resetCombo(): void {
    if (this.combo <= 1 && this.comboShots === 0) return;
    this.combo = 1;
    this.comboShots = 0;
    this.hud?.setCombo(this.combo, this.comboShots);
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
