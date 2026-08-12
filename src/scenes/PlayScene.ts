import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';
import type { GameMode } from '../config/gameConfig';
import { GATE_PATHS } from '../config/spawnLayout';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import { createPathDebugGroup, wantsCloseOnly, wantsDomeOnly, wantsPathDebug } from '../debug/pathDebug';
import { Target } from '../entities/Target';
import { AmmoSystem } from '../systems/Ammo';
import { Spawner } from '../systems/Spawner';
import { HUD } from '../ui/HUD';
import { clearUI } from '../ui/dom';
import { getCastleStage } from '../world/CastleStage';
import {
  isMuted,
  pauseStageBgm,
  playDryFireSound,
  playGlitterSound,
  playPopSound,
  playShootSound,
  playSquishSound,
  resumeStageBgm,
  startStageBgm,
  stopStageBgm,
  toggleMute,
} from '../audio/sfx';

export class PlayScene implements GameScene {
  readonly id = 'play' as const;
  private mode: GameMode = 'endless';
  private score = 0;
  private combo = 1;
  private comboShots = 0;
  private lives: number = gameConfig.startLives;
  private timeLeft: number = gameConfig.timedSeconds;
  private ended = false;
  private paused = false;
  private spawner: Spawner | null = null;
  private ammo: AmmoSystem | null = null;
  private hud: HUD | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private unsubs: Array<() => void> = [];
  private escapesArmed = false;
  private camKick = 0;
  private camBase = new THREE.Vector3(0, 110, 635);
  /** Gold durians that already got their appear glitter cue. */
  private glitterAnnounced = new WeakSet<Target>();
  private viewFrustum = new THREE.Frustum();
  private viewProj = new THREE.Matrix4();
  private viewSphere = new THREE.Sphere();
  private pathDebug: THREE.Group | null = null;
  /** Endless: points earned toward the next frenzy (0 → frenzyMeterPoints). */
  private frenzyMeter = 0;
  private frenzyActive = false;
  /** Endless: ms remaining in the active frenzy. */
  private frenzyTimeLeftMs = 0;

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
    this.paused = false;
    this.frenzyMeter = 0;
    this.frenzyActive = false;
    this.frenzyTimeLeftMs = 0;
    getCastleStage()?.resetFrenzyLook();
    this.escapesArmed = false;
    window.setTimeout(() => {
      this.escapesArmed = true;
    }, 4500);

    // Static camera — no aim parallax (down 30, back 75 from prior 0/140/560)
    this.camBase.set(0, 110, 635);
    this.camKick = 0;
    this.ctx.three.camera.position.copy(this.camBase);
    this.ctx.three.camera.lookAt(0, 110, 40);

    this.ammo = new AmmoSystem();
    this.spawner = new Spawner(this.ctx.three.scene, this.mode, (t) => this.onTargetEscaped(t), {
      domeOnly: wantsDomeOnly(),
      closeOnly: wantsCloseOnly(),
    });
    this.hud = new HUD(this.ctx.uiRoot, this.mode, {
      onReload: () => this.onReload(),
      onPauseToggle: () => this.togglePause(),
      onMuteToggle: () => this.onMuteToggle(),
    });
    this.hud.setScore(this.score);
    this.hud.setCombo(this.combo, this.comboShots);
    this.hud.setLives(this.lives);
    this.hud.setAmmo(this.ammo.current, this.ammo.max, false);
    this.hud.setMuted(isMuted());
    this.hud.setPaused(false);
    this.hud.setFrenzyMeter(0, false);

    this.unsubs.push(this.ammo.onChange((c, m, r) => this.hud?.setAmmo(c, m, r)));

    if (wantsPathDebug()) {
      this.pathDebug = createPathDebugGroup();
      this.ctx.three.scene.add(this.pathDebug);
      // eslint-disable-next-line no-console
      console.info(
        '[path-debug] v4 crest-base',
        GATE_PATHS.slice(2).map((lane, i) => ({
          lane: i + 2,
          y: lane[0]?.y,
          halfX: Math.max(...lane.map((p) => Math.abs(p.x))),
          frontZ: Math.max(...lane.map((p) => p.z)),
          backZ: Math.min(...lane.map((p) => p.z)),
          corners: lane.length,
        })),
      );
    }

    const onMove = (e: PointerEvent) => {
      this.hud?.setPointer(e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => {
      if (this.ended || this.paused) return;
      // Ignore taps on the bottom cartoon HUD dock
      if (e.clientY > window.innerHeight - 100) return;
      this.handleShot(e.clientX, e.clientY);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.togglePause();
        return;
      }
      if (this.paused) return;
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
    startStageBgm();
    this.spawner.start();
  }

  update(dt: number): void {
    if (this.ended || this.paused) return;

    if (this.mode === 'timed') {
      this.timeLeft -= dt;
      this.hud?.setTimer(this.timeLeft);
    }

    if (this.mode === 'endless' && this.frenzyActive) {
      this.frenzyTimeLeftMs -= dt * 1000;
      if (this.frenzyTimeLeftMs <= 0) this.endFrenzy();
    }

    this.spawner?.update(dt, this.mode === 'timed' ? this.timeLeft : undefined);
    this.announceVisibleGoldDurians();

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

    if (this.mode === 'timed' && this.timeLeft <= 0) this.endGame();
  }

  /** Play glitter once the first frame a gold durian enters the camera frustum. */
  private announceVisibleGoldDurians(): void {
    if (!this.spawner) return;
    const cam = this.ctx.three.camera;
    cam.updateMatrixWorld();
    this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.viewFrustum.setFromProjectionMatrix(this.viewProj);

    for (const target of this.spawner.targets) {
      if (target.kind !== 'goldDurian' || !target.active) continue;
      if (this.glitterAnnounced.has(target)) continue;
      // Ignore the tiny pop-in frame so we don’t cue before it’s readable.
      if (target.root.scale.x < 0.35) continue;

      target.root.updateWorldMatrix(true, false);
      this.viewSphere.center.setFromMatrixPosition(target.root.matrixWorld);
      this.viewSphere.radius = gameConfig.targetSize * 0.55 * target.root.scale.x;
      if (!this.viewFrustum.intersectsSphere(this.viewSphere)) continue;

      this.glitterAnnounced.add(target);
      playGlitterSound();
    }
  }

  exit(): void {
    document.body.classList.remove('playing');
    stopStageBgm();
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.frenzyActive = false;
    this.frenzyTimeLeftMs = 0;
    this.spawner?.setEndlessRateMult(1);
    getCastleStage()?.resetFrenzyLook();
    this.spawner?.stop();
    this.spawner?.clearAll();
    this.spawner = null;
    this.ammo?.destroy();
    this.ammo = null;
    this.hud?.destroy();
    this.hud = null;
    if (this.pathDebug) {
      this.ctx.three.scene.remove(this.pathDebug);
      this.pathDebug.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      this.pathDebug = null;
    }
    clearUI(this.ctx.uiRoot);
  }

  private onReload(): void {
    if (this.ended || this.paused) return;
    this.ammo?.tryReload();
  }

  private togglePause(): void {
    if (this.ended) return;
    this.paused = !this.paused;
    this.hud?.setPaused(this.paused);
    if (this.paused) pauseStageBgm();
    else resumeStageBgm();
  }

  private onMuteToggle(): void {
    const muted = toggleMute();
    this.hud?.setMuted(muted);
  }

  private handleShot(clientX: number, clientY: number): void {
    if (this.paused || this.ended) return;
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
      playPopSound();
      this.hud?.spawnBubblePop(clientX, clientY);
      this.resetCombo();
      this.addScore(gameConfig.points.bubble, clientX, clientY, '#ff6b8a');
      if (this.mode === 'endless') this.changeLives(-1);
    } else if (kind === 'heart') {
      this.resetCombo();
      this.changeLives(1);
      this.hud?.spawnFloater(clientX, clientY, '+♥', '#ff2d55');
    }

    // Knock down (fall back 90°) instead of shrinking on kill.
    target.fadeOut(280, { knockDown: true });
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
    if (this.mode === 'endless' && delta > 0) this.addFrenzyProgress(delta);
  }

  /** Fill the frenzy meter from positive score gains (paused during frenzy). */
  private addFrenzyProgress(points: number): void {
    if (this.frenzyActive || points <= 0) return;
    this.frenzyMeter += points;
    const need = gameConfig.frenzyMeterPoints;
    if (this.frenzyMeter >= need) {
      this.startFrenzy();
      return;
    }
    this.hud?.setFrenzyMeter(this.frenzyMeter / need, false);
  }

  private startFrenzy(): void {
    if (this.mode !== 'endless' || this.frenzyActive) return;
    this.frenzyActive = true;
    this.frenzyTimeLeftMs = gameConfig.frenzyDurationMs;
    this.frenzyMeter = 0;
    this.spawner?.setEndlessRateMult(gameConfig.frenzySpawnRateMult);
    getCastleStage()?.setFrenzyActive(true);
    this.hud?.setFrenzyMeter(0, true);
    this.hud?.showFrenzyAnnounce();
  }

  private endFrenzy(): void {
    if (!this.frenzyActive) return;
    this.frenzyActive = false;
    this.frenzyTimeLeftMs = 0;
    this.spawner?.setEndlessRateMult(1);
    getCastleStage()?.setFrenzyActive(false);
    this.hud?.setFrenzyMeter(this.frenzyMeter / gameConfig.frenzyMeterPoints, false);
  }

  private changeLives(delta: number): void {
    // Timed mode has no lives — only the clock ends the run.
    if (this.mode !== 'endless') return;
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
