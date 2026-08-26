import type { TargetKind } from '../config/gameConfig';
import { gameConfig } from '../config/gameConfig';
import { isCoarsePointer } from '../core/display';
import type { SpawnPattern } from '../config/spawnLayout';
import { CLOSE_SPOTS, TEETH_FLYBY_PATH_INDEX, WINDOWS } from '../config/spawnLayout';
import type { TutorialCoach } from '../ui/TutorialCoach';
import type { ArrowSpec } from '../ui/TutorialArrows';

export interface TutorialHost {
  spawn(
    kind: TargetKind,
    pattern: SpawnPattern,
    options?: {
      frenzySpawned?: boolean;
      pinned?: boolean;
      windowId?: string;
      pathIndex?: number;
    },
  ): boolean;
  clearTargets(): void;
  reload(): void;
  ammo(): number;
  magSize(): number;
  reloading(): boolean;
  setLives(n: number): void;
  resetCombo(): void;
  setFrenzyLook(active: boolean): void;
  setArrows(specs: ArrowSpec[]): void;
  revealCombo(): void;
  showTeethWarn(): void;
  finish(): void;
  quit(): void;
}

type WaitKind =
  | 'destroy-durian'
  | 'skip-bubble'
  | 'reload'
  | 'combo'
  | 'destroy-gold'
  | 'watch-teeth'
  | 'collect-heart'
  | 'watch-escape'
  | 'destroy-frenzy';

const TOTAL_STEPS = 11;

/** Resolve combo slot at runtime — castle load replaces default window ids (sp1…). */
function comboSpawnSlot(index: number): { pattern: 'window' | 'close'; id: string } {
  const windowCount = WINDOWS.length;
  const total = windowCount + CLOSE_SPOTS.length;
  const idx = ((index % total) + total) % total;
  if (idx < windowCount) {
    return { pattern: 'window', id: WINDOWS[idx]!.id };
  }
  return { pattern: 'close', id: CLOSE_SPOTS[idx - windowCount]!.id };
}

export class TutorialDirector {
  private step = 0;
  private waiting: WaitKind | null = null;
  /** Player may tap CONTINUE to go to the next step. */
  private stepReady = false;
  private comboHits = 0;
  private comboSpotIndex = 0;
  private delay = 0;
  private pending: (() => void) | null = null;
  private ammoGate: { min: number; then: () => void } | null = null;
  private done = false;
  private readonly mobile = isCoarsePointer();
  private readonly shootVerb: string;

  constructor(
    private readonly host: TutorialHost,
    private readonly coach: TutorialCoach,
  ) {
    this.shootVerb = this.mobile ? 'Tap' : 'Click';
  }

  start(): void {
    this.go(0);
  }

  update(dt: number): void {
    if (this.done) return;
    if (this.ammoGate) {
      if (this.host.ammo() >= this.ammoGate.min && !this.host.reloading()) {
        const { then } = this.ammoGate;
        this.ammoGate = null;
        then();
      }
    }
    if (this.delay > 0) {
      this.delay -= dt;
      if (this.delay <= 0) {
        const fn = this.pending;
        this.pending = null;
        fn?.();
      }
    }
  }

  onShot(info: { hit: boolean; kind?: TargetKind; destroyed?: boolean }): void {
    if (this.done || !this.waiting) return;
    const { waiting } = this;
    if (this.stepReady && waiting !== 'skip-bubble') return;

    if (waiting === 'reload' && !info.hit) {
      this.coach.setWait(
        this.mobile
          ? 'Tap the ammo bar or hit RELOAD.'
          : 'Click the ammo bar or press SPACE or R.',
      );
      return;
    }

    if (waiting === 'skip-bubble') {
      if (info.kind === 'bubble' && info.destroyed) {
        this.after(0.55, () => this.spawnNow('bubble', 'window', { pinned: true }));
      }
      return;
    }

    if (waiting === 'watch-escape') {
      if (info.kind && (info.kind === 'durian' || info.kind === 'goldDurian') && info.destroyed) {
        this.coach.feedback(
          'Nice shot — but this step is about letting one escape.',
          'ok',
        );
      }
      return;
    }

    if (waiting === 'combo') {
      if (!info.hit) {
        this.comboHits = 0;
        this.comboSpotIndex = 0;
        this.host.resetCombo();
        this.host.clearTargets();
        this.coach.feedback('Misses reset combo. Hit 4 in a row.', 'warn');
        this.after(0.45, () => this.spawnComboDurian());
        return;
      }
      if (info.kind === 'durian' && info.destroyed) {
        this.comboHits += 1;
        if (this.comboHits >= gameConfig.shotsPerComboLevel) {
          this.taskComplete();
          return;
        }
        this.coach.setWait(`${this.comboHits} / ${gameConfig.shotsPerComboLevel} in a row`);
        this.after(0.4, () => this.spawnComboDurian(true));
      }
      return;
    }

    if (!info.destroyed) return;

    if (waiting === 'destroy-durian' && info.kind === 'durian') this.taskComplete();
    else if (waiting === 'destroy-gold' && info.kind === 'goldDurian') this.taskComplete();
    else if (waiting === 'collect-heart' && info.kind === 'heart') this.taskComplete();
    else if (waiting === 'destroy-frenzy' && this.hostIsDurian(info.kind)) this.taskComplete();
  }

  onReload(): void {
    if (this.waiting === 'reload' && !this.stepReady) this.taskComplete();
  }

  onEscape(kind: TargetKind): void {
    if (this.done || !this.waiting) return;

    // Demo flyby: keep looping while the player is on this step (CONTINUE is
    // already enabled — they can leave anytime).
    if (this.waiting === 'watch-teeth' && kind === 'teeth') {
      this.after(0.55, () => this.spawnTeethFlyby());
      return;
    }

    if (this.waiting === 'watch-escape' && this.hostIsDurian(kind)) {
      if (!this.stepReady) this.taskComplete();
      this.after(0.7, () => {
        if (this.waiting !== 'watch-escape') return;
        this.spawnNow('durian', 'window');
      });
      return;
    }

    if (this.stepReady) return;

    if (
      (this.waiting === 'destroy-gold' ||
        this.waiting === 'collect-heart' ||
        this.waiting === 'destroy-frenzy') &&
      this.matchesWait(kind)
    ) {
      this.coach.feedback('It left — here comes another.', 'warn');
      this.after(0.5, () => this.respawnForWait());
    }
  }

  skipStep(): void {
    if (this.done) return;
    this.clearWaits();
    this.host.clearTargets();
    this.host.setFrenzyLook(false);
    this.advance();
  }

  continueStep(): void {
    if (this.stepReady) this.advance();
  }

  backStep(): void {
    if (this.done || this.step <= 0) return;
    this.clearWaits();
    this.host.setFrenzyLook(false);
    this.go(this.step - 1);
  }

  quit(): void {
    this.done = true;
    this.clearWaits();
    this.host.quit();
  }

  destroy(): void {
    this.done = true;
    this.clearWaits();
    this.host.setFrenzyLook(false);
    this.host.setArrows([]);
  }

  private go(index: number): void {
    this.step = index;
    this.waiting = null;
    this.stepReady = false;
    this.comboHits = 0;
    this.host.clearTargets();
    this.host.setFrenzyLook(false);
    this.host.setArrows([]);

    switch (index) {
      case 0:
        this.prompt(
          'Welcome!',
          'Durians are taking over bubble kingdom. Defeat those stinky fruits!',
          this.mobile ? 'Tap CONTINUE to start.' : 'Click CONTINUE to start.',
          true,
        );
        break;
      case 1:
        this.waiting = 'destroy-durian';
        this.prompt(
          'Shoot the Durian',
          'Green durians are defeated in one hit and score points.',
          `${this.shootVerb} the green durian.`,
        );
        this.spawnNow('durian', 'window', { pinned: true });
        this.host.setArrows([{ kind: 'target' }]);
        break;
      case 2:
        this.waiting = 'skip-bubble';
        this.prompt(
          "Don't Shoot the Bubble",
          'Bubbles cost you points.',
          undefined,
          true,
        );
        this.spawnNow('bubble', 'window', { pinned: true });
        this.host.setArrows([{ kind: 'target' }]);
        break;
      case 3:
        this.waiting = 'combo';
        this.comboHits = 0;
        this.comboSpotIndex = 0;
        this.host.resetCombo();
        this.host.revealCombo();
        this.prompt(
          'Build a Combo',
          'Four clean durian hits in a row raises your combo, multiplying your score. Misses and bubble hits reset it.',
          'Hit 4 durians in a row.',
        );
        this.withAmmo(1, () => this.spawnComboDurian());
        this.host.setArrows([{ kind: 'target' }, { kind: 'hud', part: 'combo' }]);
        break;
      case 4:
        this.waiting = 'reload';
        this.prompt(
          'Reload',
          this.mobile
            ? 'Replenish your ammo by tapping the ammo bar or the RELOAD button.'
            : 'Replenish your ammo by clicking on the ammo bar or pressing the SPACE or R key.',
          this.host.ammo() >= this.host.magSize()
            ? 'Fire your last round, then reload.'
            : 'Reload now.',
        );
        this.host.setArrows(
          this.mobile
            ? [
                { kind: 'hud', part: 'ammo' },
                { kind: 'hud', part: 'reload' },
              ]
            : [{ kind: 'hud', part: 'ammo' }],
        );
        break;
      case 5:
        this.waiting = 'destroy-gold';
        this.prompt(
          'Gold Durian',
          'Gold durians take 4 hits but score way more.',
          'Shoot the gold durian down.',
        );
        this.withAmmo(gameConfig.hitsRequired.goldDurian, () =>
          this.spawnNow('goldDurian', 'window', { pinned: true }),
        );
        this.host.setArrows([{ kind: 'target' }, { kind: 'hud', part: 'score' }]);
        break;
      case 6:
        this.waiting = 'watch-teeth';
        this.prompt(
          'Chomping Teeth',
          'In Timed mode, chomping teeth dash behind the castle. Hit them for a huge flat bonus — watch for the warning flash!',
          undefined,
          true,
        );
        this.withAmmo(1, () => this.spawnTeethFlyby());
        this.host.setArrows([{ kind: 'target' }]);
        break;
      case 7:
        this.waiting = 'watch-escape';
        this.host.setLives(gameConfig.startLives);
        this.prompt(
          "Don't Let It Escape",
          'Durians that get away cost you a life in Endless mode.',
          'Watch a durian escape.',
        );
        this.spawnNow('durian', 'window');
        this.host.setArrows([{ kind: 'target' }, { kind: 'hud', part: 'lives' }]);
        break;
      case 8:
        this.waiting = 'collect-heart';
        this.host.setLives(Math.max(1, gameConfig.startLives - 1));
        this.prompt(
          'Grab the Heart',
          'Hearts restore lives in Endless mode.',
          'Shoot the heart.',
        );
        this.withAmmo(1, () => this.spawnNow('heart', 'window', { pinned: true }));
        this.host.setArrows([{ kind: 'target' }, { kind: 'hud', part: 'lives' }]);
        break;
      case 9:
        this.waiting = 'destroy-frenzy';
        this.host.setFrenzyLook(true);
        this.prompt(
          'Frenzy Time',
          'Score enough and the Frenzy meter fills. Get as many points if you can! Enemies that escape during a frenzy does not cost lives.',
          'Shoot the glowing durian.',
        );
        this.withAmmo(1, () =>
          this.spawnNow('durian', 'window', { frenzySpawned: true, pinned: true }),
        );
        this.host.setArrows([{ kind: 'target' }, { kind: 'hud', part: 'frenzy' }]);
        break;
      case 10:
        this.prompt(
          "You're All Set!",
          "The booth's yours now. Good luck!",
          'Tap CONTINUE to head to the menu.',
          true,
        );
        break;
      default:
        this.finish();
        break;
    }
  }

  private prompt(title: string, body: string, wait?: string, continueEnabled = false): void {
    this.stepReady = continueEnabled;
    this.coach.set({
      index: this.step + 1,
      total: TOTAL_STEPS,
      title,
      body,
      wait,
      continueEnabled,
      backEnabled: this.step > 0,
    });
  }

  /** Task done — enable CONTINUE; player advances manually. */
  private taskComplete(): void {
    if (this.stepReady) return;
    this.stepReady = true;
    this.coach.setContinueEnabled(true);
    this.coach.setWait(this.mobile ? 'Tap CONTINUE.' : 'Click CONTINUE.');
  }

  private advance(): void {
    this.clearWaits();
    this.host.setFrenzyLook(false);
    this.go(this.step + 1);
  }

  private finish(): void {
    this.done = true;
    this.clearWaits();
    this.host.setFrenzyLook(false);
    this.host.setArrows([]);
    this.host.finish();
  }

  private spawnNow(
    kind: TargetKind,
    pattern: SpawnPattern,
    options?: {
      frenzySpawned?: boolean;
      pinned?: boolean;
      windowId?: string;
      pathIndex?: number;
    },
  ): void {
    this.host.clearTargets();
    this.host.spawn(kind, pattern, options);
  }

  /** Pinned durian at the next window/close slot (never a path). */
  private spawnComboDurian(advanceSpot = false): void {
    if (advanceSpot) this.comboSpotIndex += 1;
    const slot = comboSpawnSlot(this.comboSpotIndex);
    this.host.clearTargets();
    this.host.spawn('durian', slot.pattern, { pinned: true, windowId: slot.id });
  }

  /** Warn flash, then the timed teeth flyby lane. */
  private spawnTeethFlyby(): void {
    if (this.waiting !== 'watch-teeth') return;
    this.host.clearTargets();
    this.host.showTeethWarn();
    this.after(gameConfig.teethWarnLeadMs / 1000, () => {
      if (this.waiting !== 'watch-teeth') return;
      this.host.spawn('teeth', 'path', { pathIndex: TEETH_FLYBY_PATH_INDEX });
    });
  }

  private withAmmo(min: number, then: () => void): void {
    if (this.host.ammo() >= min && !this.host.reloading()) {
      then();
      return;
    }
    this.host.reload();
    this.ammoGate = { min, then };
  }

  private after(sec: number, fn: () => void): void {
    this.delay = sec;
    this.pending = fn;
  }

  private respawnForWait(): void {
    switch (this.waiting) {
      case 'destroy-durian':
        this.spawnNow('durian', 'window', { pinned: true });
        break;
      case 'combo':
        this.comboSpotIndex = 0;
        this.spawnComboDurian();
        break;
      case 'destroy-gold':
        this.withAmmo(gameConfig.hitsRequired.goldDurian, () =>
          this.spawnNow('goldDurian', 'window', { pinned: true }),
        );
        break;
      case 'watch-teeth':
        this.spawnTeethFlyby();
        break;
      case 'collect-heart':
        this.spawnNow('heart', 'window', { pinned: true });
        break;
      case 'destroy-frenzy':
        this.spawnNow('durian', 'window', { frenzySpawned: true, pinned: true });
        break;
      default:
        break;
    }
  }

  private matchesWait(kind: TargetKind): boolean {
    switch (this.waiting) {
      case 'destroy-durian':
      case 'combo':
      case 'destroy-frenzy':
        return kind === 'durian';
      case 'destroy-gold':
        return kind === 'goldDurian';
      case 'watch-teeth':
        return kind === 'teeth';
      case 'collect-heart':
        return kind === 'heart';
      default:
        return false;
    }
  }

  private hostIsDurian(kind?: TargetKind): boolean {
    return kind === 'durian' || kind === 'goldDurian';
  }

  private clearWaits(): void {
    this.delay = 0;
    this.pending = null;
    this.ammoGate = null;
  }
}
