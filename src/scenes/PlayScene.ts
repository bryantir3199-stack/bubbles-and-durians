import * as THREE from 'three';
import { gameConfig, defaultTimedPreset, getTimedPreset, computeTimedRunTally, type TimedPreset, type TimedPresetConfig } from '../config/gameConfig';
import type { GameMode } from '../config/gameConfig';
import { GATE_PATHS, TEETH_FLYBY_PATH_INDEX } from '../config/spawnLayout';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import { createPathDebugGroup, wantsCloseOnly, wantsDomeOnly, wantsPathDebug, wantsTeethFlybyNow } from '../debug/pathDebug';
import { Target } from '../entities/Target';
import { AmmoSystem } from '../systems/Ammo';
import { Spawner } from '../systems/Spawner';
import { HUD } from '../ui/HUD';
import { TutorialCoach } from '../ui/TutorialCoach';
import { TutorialArrows, type ArrowSpec } from '../ui/TutorialArrows';
import { TutorialDirector } from '../systems/TutorialDirector';
import { isCoarsePointer } from '../core/display';
import { onDeviceShake, requestShakePermission } from '../core/shake';
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
  private timedPreset: TimedPreset = defaultTimedPreset;
  private timedConfig: TimedPresetConfig = getTimedPreset(defaultTimedPreset);
  private score = 0;
  private combo = 1;
  private comboShots = 0;
  private peakCombo = 1;
  private timeAtMaxCombo = 0;
  private bubblesHit = 0;
  private finaleScore = 0;
  private shotsFired = 0;
  private accurateHits = 0;
  private lives: number = gameConfig.startLives;
  private timeLeft = getTimedPreset(defaultTimedPreset).seconds;
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
  private tutorial: TutorialDirector | null = null;
  private tutorialCoach: TutorialCoach | null = null;
  private tutorialArrows: TutorialArrows | null = null;
  /** Timed: one-shot teeth flyby already fired this run. */
  private teethFlybySpawned = false;
  /** Timed: warning flash already shown this run. */
  private teethWarnShown = false;
  /** Timed: spawner elapsed ms when the teeth flyby should appear. */
  private teethFlybyAtMs = 0;

  constructor(private ctx: SceneContext) {}

  enter(data?: SceneData): void {
    clearUI(this.ctx.uiRoot);
    this.mode = data?.mode ?? 'endless';
    this.timedPreset = data?.timedPreset ?? defaultTimedPreset;
    this.timedConfig = getTimedPreset(this.timedPreset);
    this.score = 0;
    this.combo = 1;
    this.comboShots = 0;
    this.peakCombo = 1;
    this.timeAtMaxCombo = 0;
    this.bubblesHit = 0;
    this.finaleScore = 0;
    this.shotsFired = 0;
    this.accurateHits = 0;
    this.lives = gameConfig.startLives;
    this.timeLeft = this.timedConfig.seconds;
    this.ended = false;
    this.paused = false;
    this.frenzyMeter = 0;
    this.frenzyActive = false;
    this.frenzyTimeLeftMs = 0;
    this.teethFlybySpawned = false;
    this.teethWarnShown = false;
    this.teethFlybyAtMs = 0;
    if (this.mode === 'timed') {
      if (wantsTeethFlybyNow()) {
        // Debug: appear almost immediately so the flyby is easy to catch.
        this.teethFlybyAtMs = 1000;
      } else {
        const totalMs = this.timedConfig.seconds * 1000;
        const midMs = totalMs / 2;
        const halfWindow = gameConfig.teethFlybyMidWindowMs / 2;
        this.teethFlybyAtMs = midMs - halfWindow + Math.random() * gameConfig.teethFlybyMidWindowMs;
      }
    }
    getCastleStage()?.resetFrenzyLook();
    this.escapesArmed = this.mode === 'tutorial';
    if (!this.escapesArmed) {
      window.setTimeout(() => {
        this.escapesArmed = true;
      }, 4500);
    }

    // Static camera — no aim parallax (down 30, back 75 from prior 0/140/560)
    this.camBase.set(0, 110, 635);
    this.camKick = 0;
    this.ctx.three.camera.position.copy(this.camBase);
    this.ctx.three.camera.lookAt(0, 110, 40);

    this.ammo = new AmmoSystem();
    this.spawner = new Spawner(this.ctx.three.scene, this.mode, (t) => this.onTargetEscaped(t), {
      domeOnly: wantsDomeOnly(),
      closeOnly: wantsCloseOnly(),
      getLives: () => this.lives,
      timedFinalBoostSeconds:
        this.mode === 'timed' ? this.timedConfig.finalBoostSeconds : undefined,
    });
    this.hud = new HUD(
      this.ctx.uiRoot,
      this.mode,
      {
        onReload: () => this.onReload(),
        onPauseToggle: () => this.togglePause(),
        onMuteToggle: () => this.onMuteToggle(),
      },
      this.mode === 'timed' ? this.timedConfig : undefined,
    );
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
      if (e.pointerType === 'touch') return;
      this.hud?.setPointer(e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => {
      if (this.ended || this.paused) return;
      if (e.pointerType === 'touch') e.preventDefault();
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
    window.addEventListener('pointerdown', onDown, { passive: false });
    window.addEventListener('keydown', onKey);
    this.unsubs.push(() => window.removeEventListener('pointermove', onMove));
    this.unsubs.push(() => window.removeEventListener('pointerdown', onDown));
    this.unsubs.push(() => window.removeEventListener('keydown', onKey));

    if (isCoarsePointer()) {
      void requestShakePermission();
      this.unsubs.push(onDeviceShake(() => this.onReload()));
    }

    document.body.classList.add('playing');
    startStageBgm();
    if (this.mode === 'tutorial') this.beginTutorial();
    else this.spawner.start();
  }

  update(dt: number): void {
    if (this.ended || this.paused) return;

    if (this.mode === 'timed') {
      if (this.combo >= gameConfig.maxCombo) {
        this.timeAtMaxCombo += Math.min(dt, Math.max(0, this.timeLeft));
      }
      this.timeLeft -= dt;
      this.hud?.setTimer(this.timeLeft);
    }

    if (this.mode === 'endless' && this.frenzyActive) {
      this.frenzyTimeLeftMs -= dt * 1000;
      const fill = Math.max(0, this.frenzyTimeLeftMs / gameConfig.frenzyDurationMs);
      this.hud?.setFrenzyMeter(fill, true);
      if (this.frenzyTimeLeftMs <= 0) this.endFrenzy();
    }

    this.spawner?.update(dt, this.mode === 'timed' ? this.timeLeft : undefined);
    this.tryWarnTeethFlyby();
    this.trySpawnTeethFlyby();
    this.tutorial?.update(dt);
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

  /** Timed only: flash the exclaim warn 2s before the teeth appear. */
  private tryWarnTeethFlyby(): void {
    if (this.mode !== 'timed' || this.teethWarnShown || !this.spawner || !this.hud) return;
    const warnAt = this.teethFlybyAtMs - gameConfig.teethWarnLeadMs;
    if (this.spawner.getElapsedMs() < warnAt) return;
    this.teethWarnShown = true;
    this.hud.showTeethWarn();
  }

  /** Timed only: scripted one-shot teeth dash after early-game grace. */
  private trySpawnTeethFlyby(): void {
    if (this.mode !== 'timed' || this.teethFlybySpawned || !this.spawner) return;
    if (this.spawner.getElapsedMs() < this.teethFlybyAtMs) return;
    const spawned = this.spawner.forceSpawn('teeth', 'path', {
      pathIndex: TEETH_FLYBY_PATH_INDEX,
      // Random entry side: true = left→right approach, false = right→left.
      pathForward: Math.random() < 0.5,
    });
    if (spawned) this.teethFlybySpawned = true;
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
    this.tutorial?.destroy();
    this.tutorial = null;
    this.tutorialCoach?.destroy();
    this.tutorialCoach = null;
    this.tutorialArrows?.destroy();
    this.tutorialArrows = null;
    this.spawner?.setFrenzyActive(false);
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
    const started = this.ammo?.tryReload();
    if (started) this.tutorial?.onReload();
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
    this.shotsFired += 1;

    playShootSound();
    this.hud.playShootAnim();
    this.camKick = 1;

    const rect = this.ctx.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.pointer.x = ((clientX - rect.left) / w) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / h) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.ctx.three.camera);

    // Raycast proxies only (non-recursive)
    const hitObjs = this.spawner.targets.filter((t) => t.active).flatMap((t) => t.hitObjects);
    const hits = this.raycaster.intersectObjects(hitObjs, false);
    if (hits.length === 0) {
      // Missed shot — break combo
      this.resetCombo();
      this.tutorial?.onShot({ hit: false });
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
      this.tutorial?.onShot({ hit: false });
      return;
    }

    const destroyed = target.applyHit();
    if (this.isDurianKind(target.kind) || target.kind === 'teeth') {
      this.accurateHits += 1;
      // Regular durians fill combo on each hit. Gold durians only fill combo on defeat.
      // Teeth are a flat bonus — no combo fill.
      if (this.isDurianKind(target.kind) && (target.kind !== 'goldDurian' || destroyed)) {
        this.registerComboShot(clientX, clientY);
      }
      if (this.isDurianKind(target.kind)) {
        this.hud.spawnCrumbs(clientX, clientY);
      }
    }
    if (destroyed) this.resolveDestroyedTarget(target, clientX, clientY);
    this.tutorial?.onShot({ hit: true, kind: target.kind, destroyed });
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
      // Frenzy: score bases use 250 instead of 100 (gold scales with the same ratio).
      const frenzyScale = this.frenzyActive
        ? gameConfig.frenzyPointBase / gameConfig.points.durian
        : 1;
      const timedFinale = this.timedFinaleScoreMult();
      const points = Math.round(base * frenzyScale * timedFinale) * this.combo;
      const color = kind === 'goldDurian' ? '#FFD700' : '#7CFF7C';
      const finaleTag = timedFinale > 1 ? `${gameConfig.timedFinaleScoreMult}×` : undefined;
      this.addScore(points, clientX, clientY, color, finaleTag);
      if (this.mode === 'timed' && timedFinale > 1 && points > 0) {
        this.finaleScore += points;
      }
    } else if (kind === 'bubble') {
      playPopSound();
      this.hud?.spawnBubblePop(clientX, clientY);
      this.resetCombo();
      this.bubblesHit += 1;
      this.addScore(gameConfig.points.bubble, clientX, clientY, '#ff6b8a');
      if (this.usesLives()) this.changeLives(-1);
    } else if (kind === 'heart') {
      // Hearts grant a life without breaking the combo streak.
      this.changeLives(1);
      this.hud?.spawnFloater(clientX, clientY, '+♥', '#ff2d55');
    } else if (kind === 'teeth') {
      playSquishSound();
      // Flat 10k — no combo / finale mult so the award matches the promise.
      this.addScore(gameConfig.points.teeth, clientX, clientY, '#ffe8a0');
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
    this.tutorial?.onEscape(target.kind);
    if (!this.usesLives() || !this.escapesArmed) return;
    // During Frenzy, or for targets spawned in Frenzy (even after it ends),
    // escapes / unshot targets do not cost a life.
    if (this.frenzyActive || target.frenzySpawned) return;
    if (this.isDurianKind(target.kind)) {
      this.changeLives(-1);
      this.hud?.spawnFloater(window.innerWidth / 2, 120, 'ESCAPED!', '#ff4444');
    }
  }

  private registerComboShot(x: number, y: number): void {
    if (this.combo >= gameConfig.maxCombo) {
      this.comboShots = gameConfig.shotsPerComboLevel;
      this.peakCombo = Math.max(this.peakCombo, this.combo);
      this.hud?.setCombo(this.combo, this.comboShots);
      return;
    }

    this.comboShots += 1;
    if (this.comboShots >= gameConfig.shotsPerComboLevel) {
      this.comboShots = 0;
      this.combo += 1;
      this.peakCombo = Math.max(this.peakCombo, this.combo);
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

  /** Clock 2× during Timed’s last `finalBoostSeconds`. Endless always 1. */
  private timedFinaleScoreMult(): number {
    if (this.mode !== 'timed') return 1;
    return this.timeLeft <= this.timedConfig.finalBoostSeconds
      ? gameConfig.timedFinaleScoreMult
      : 1;
  }

  private addScore(delta: number, x: number, y: number, color: string, suffix?: string): void {
    this.score = Math.max(0, this.score + delta);
    this.hud?.setScore(this.score);
    const core = delta > 0 ? `+${delta}` : `${delta}`;
    const label = suffix ? `${core} (${suffix})` : core;
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
    this.spawner?.setFrenzyActive(true);
    getCastleStage()?.setFrenzyActive(true);
    // Bar starts full and drains to show remaining Frenzy time.
    this.hud?.setFrenzyMeter(1, true);
    this.hud?.showFrenzyAnnounce();
  }

  private endFrenzy(): void {
    if (!this.frenzyActive) return;
    this.frenzyActive = false;
    this.frenzyTimeLeftMs = 0;
    this.spawner?.setFrenzyActive(false);
    getCastleStage()?.setFrenzyActive(false);
    this.hud?.setFrenzyMeter(this.frenzyMeter / gameConfig.frenzyMeterPoints, false);
  }

  private changeLives(delta: number): void {
    // Timed mode has no lives — only the clock ends the run.
    if (!this.usesLives()) return;
    if (delta > 0) {
      this.lives = Math.min(gameConfig.maxLives, this.lives + delta);
    } else {
      this.lives = Math.max(0, this.lives + delta);
    }
    this.hud?.setLives(this.lives);
    if (this.lives <= 0 && this.mode !== 'tutorial') this.endGame();
  }

  private usesLives(): boolean {
    return this.mode === 'endless' || this.mode === 'tutorial';
  }

  private beginTutorial(): void {
    this.tutorialArrows = new TutorialArrows({
      camera: this.ctx.three.camera,
      canvas: this.ctx.canvas,
      getTarget: () => this.spawner?.targets.find((t) => t.onScreen) ?? null,
      getHudPart: (part) => this.hud?.part(part) ?? null,
    });
    this.tutorialCoach = new TutorialCoach(this.ctx.uiRoot, {
      onSkip: () => {
        if (!this.paused) this.tutorial?.skipStep();
      },
      onQuit: () => this.tutorial?.quit(),
      onBack: () => {
        if (!this.paused) this.tutorial?.backStep();
      },
      onContinue: () => {
        if (!this.paused) this.tutorial?.continueStep();
      },
    });
    this.tutorial = new TutorialDirector(
      {
        spawn: (kind, pattern, options) => {
          if (!this.spawner) return false;
          return this.spawner.forceSpawn(kind, pattern, options) !== null;
        },
        clearTargets: () => this.spawner?.clearAll(),
        reload: () => {
          this.ammo?.tryReload();
        },
        ammo: () => this.ammo?.current ?? 0,
        magSize: () => this.ammo?.max ?? gameConfig.magazineSize,
        reloading: () => this.ammo?.isReloading ?? false,
        setLives: (n) => {
          this.lives = Math.max(0, Math.min(gameConfig.maxLives, n));
          this.hud?.setLives(this.lives);
        },
        resetCombo: () => this.resetCombo(),
        setFrenzyLook: (active) => {
          this.frenzyActive = active;
          this.spawner?.setFrenzyActive(active);
          getCastleStage()?.setFrenzyActive(active);
          this.hud?.setFrenzyMeter(active ? 1 : 0, active);
          if (active) this.hud?.showFrenzyAnnounce();
        },
        setArrows: (specs: ArrowSpec[]) => this.tutorialArrows?.set(specs),
        revealCombo: () => this.hud?.revealCombo(),
        finish: () => {
          this.ended = true;
          this.ctx.goto('modeSelect');
        },
        quit: () => {
          this.ended = true;
          this.ctx.goto('modeSelect');
        },
      },
      this.tutorialCoach,
    );
    this.tutorial.start();
  }

  private endGame(): void {
    if (this.ended) return;
    this.ended = true;
    this.spawner?.stop();
    if (this.mode === 'tutorial') {
      this.ctx.goto('modeSelect');
      return;
    }
    window.setTimeout(() => {
      const timedTally =
        this.mode === 'timed'
          ? computeTimedRunTally({
              runScore: this.score,
              peakCombo: this.peakCombo,
              timeAtMaxCombo: this.timeAtMaxCombo,
              bubblesHit: this.bubblesHit,
              finaleScore: this.finaleScore,
              shotsFired: this.shotsFired,
              accurateHits: this.accurateHits,
            })
          : undefined;
      this.ctx.goto('gameOver', {
        mode: this.mode,
        timedPreset: this.mode === 'timed' ? this.timedPreset : undefined,
        score: timedTally?.total ?? this.score,
        timedTally,
      });
    }, 400);
  }
}
