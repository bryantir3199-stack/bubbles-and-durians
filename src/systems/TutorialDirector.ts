import type { TargetKind } from '../config/gameConfig';
import { gameConfig } from '../config/gameConfig';
import { isCoarsePointer } from '../core/display';
import type { SpawnPattern } from '../config/spawnLayout';
import type { TutorialCoach } from '../ui/TutorialCoach';

export interface TutorialHost {
  spawn(
    kind: TargetKind,
    pattern: SpawnPattern,
    options?: { frenzySpawned?: boolean },
  ): boolean;
  clearTargets(): void;
  reload(): void;
  ammo(): number;
  magSize(): number;
  reloading(): boolean;
  setLives(n: number): void;
  resetCombo(): void;
  setFrenzyLook(active: boolean): void;
  finish(): void;
  quit(): void;
}

type WaitKind =
  | 'continue'
  | 'destroy-durian'
  | 'skip-bubble'
  | 'reload'
  | 'combo'
  | 'destroy-gold'
  | 'collect-heart'
  | 'watch-escape'
  | 'destroy-close'
  | 'destroy-path'
  | 'destroy-frenzy';

const TOTAL_STEPS = 12;

export class TutorialDirector {
  private step = 0;
  private waiting: WaitKind | null = null;
  private comboHits = 0;
  private delay = 0;
  private pending: (() => void) | null = null;
  private ammoGate: { min: number; then: () => void } | null = null;
  private done = false;
  private readonly mobile = isCoarsePointer();
  private readonly shootVerb: string;
  private readonly reloadHow: string;

  constructor(
    private readonly host: TutorialHost,
    private readonly coach: TutorialCoach,
  ) {
    this.shootVerb = this.mobile ? 'Tap' : 'Click';
    this.reloadHow = this.mobile
      ? 'tap RELOAD or shake the device'
      : 'press R / Space, or tap the ammo bar';
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

    if (waiting === 'reload' && !info.hit) {
      this.coach.setWait('Mag has space — now reload.');
      return;
    }

    if (waiting === 'skip-bubble') {
      if (info.kind === 'bubble' && info.destroyed) {
        this.host.setLives(gameConfig.startLives);
        this.coach.feedback(
          'Bubbles cost −1000 and, in Endless, a life. Let this next one leave.',
          'warn',
        );
        this.after(0.55, () => this.spawnNow('bubble', 'window'));
      }
      return;
    }

    if (waiting === 'watch-escape') {
      if (info.kind && (info.kind === 'durian' || info.kind === 'goldDurian') && info.destroyed) {
        this.coach.feedback(
          'Nice shot. In Endless, an unshot durian that leaves still costs a life.',
          'ok',
        );
        this.after(0.7, () => this.advance());
      }
      return;
    }

    if (waiting === 'combo') {
      if (!info.hit) {
        this.comboHits = 0;
        this.host.resetCombo();
        this.host.clearTargets();
        this.coach.feedback('Misses break combo. Start a new streak of 4.', 'warn');
        this.after(0.45, () => this.spawnNow('durian', 'window'));
        return;
      }
      if (info.kind === 'durian' && info.destroyed) {
        this.comboHits += 1;
        if (this.comboHits >= gameConfig.shotsPerComboLevel) {
          this.after(0.55, () => this.advance());
          return;
        }
        this.coach.setWait(`${this.comboHits} / ${gameConfig.shotsPerComboLevel} clean hits`);
        this.after(0.4, () => this.spawnNow('durian', 'window'));
      }
      return;
    }

    if (!info.destroyed) return;

    if (waiting === 'destroy-durian' && info.kind === 'durian') this.advance();
    else if (waiting === 'destroy-gold' && info.kind === 'goldDurian') this.advance();
    else if (waiting === 'collect-heart' && info.kind === 'heart') this.advance();
    else if (waiting === 'destroy-close' && this.hostIsDurian(info.kind)) this.advance();
    else if (waiting === 'destroy-path' && this.hostIsDurian(info.kind)) this.advance();
    else if (waiting === 'destroy-frenzy' && this.hostIsDurian(info.kind)) this.advance();
  }

  onReload(): void {
    if (this.waiting === 'reload') this.advance();
  }

  onEscape(kind: TargetKind): void {
    if (this.done || !this.waiting) return;

    if (this.waiting === 'skip-bubble' && kind === 'bubble') {
      this.coach.feedback('Good — bubbles that leave do not cost a life.', 'ok');
      this.after(0.55, () => this.advance());
      return;
    }

    if (this.waiting === 'watch-escape' && this.hostIsDurian(kind)) {
      this.after(0.7, () => {
        this.host.setLives(gameConfig.startLives);
        this.advance();
      });
      return;
    }

    if (
      (this.waiting === 'destroy-durian' ||
        this.waiting === 'combo' ||
        this.waiting === 'destroy-gold' ||
        this.waiting === 'collect-heart' ||
        this.waiting === 'destroy-close' ||
        this.waiting === 'destroy-path' ||
        this.waiting === 'destroy-frenzy') &&
      this.matchesWait(kind)
    ) {
      if (this.waiting === 'combo') {
        this.comboHits = 0;
        this.host.resetCombo();
        this.coach.feedback('It got away — combo drops. Try a new streak.', 'warn');
      } else {
        this.coach.feedback('It left — here comes another.', 'warn');
      }
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
    if (this.waiting === 'continue') this.advance();
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
  }

  private go(index: number): void {
    this.step = index;
    this.waiting = null;
    this.comboHits = 0;
    this.host.clearTargets();
    this.host.setFrenzyLook(false);

    switch (index) {
      case 0:
        this.prompt(
          'The booth',
          `${this.shootVerb} to shoot. We'll walk every rule — durians, bubbles, ammo, combo, gold, lives, and Frenzy.`,
          'Let’s go',
        );
        break;
      case 1:
        this.waiting = 'destroy-durian';
        this.prompt(
          'Green durians',
          `${this.shootVerb} the durian. One hit, +${gameConfig.points.durian} points.`,
          undefined,
          'Shoot the green one',
        );
        this.spawnNow('durian', 'window');
        break;
      case 2:
        this.waiting = 'skip-bubble';
        this.prompt(
          'Skip bubbles',
          `Pink bubbles are traps: ${gameConfig.points.bubble} score, and −1 life in Endless. Do not shoot this one — let it leave.`,
          undefined,
          'Wait it out',
        );
        this.spawnNow('bubble', 'window');
        break;
      case 3:
        this.waiting = 'reload';
        this.prompt(
          'Reload',
          `Magazine holds ${gameConfig.magazineSize}. You can reload whenever it is not full — ${this.reloadHow}. Empty mag clicks and shows RELOAD.`,
          undefined,
          this.host.ammo() >= this.host.magSize()
            ? 'Fire a shot, then reload'
            : 'Reload now',
        );
        break;
      case 4:
        this.waiting = 'combo';
        this.comboHits = 0;
        this.host.resetCombo();
        this.prompt(
          'Combo',
          `${gameConfig.shotsPerComboLevel} clean durian hits raise the multiplier (up to ${gameConfig.maxCombo}x). Misses, bubbles, and escaped durians break it.`,
          undefined,
          `0 / ${gameConfig.shotsPerComboLevel} clean hits`,
        );
        this.withAmmo(1, () => this.spawnNow('durian', 'window'));
        break;
      case 5:
        this.waiting = 'destroy-gold';
        this.prompt(
          'Gold durians',
          `Gold takes ${gameConfig.hitsRequired.goldDurian} hits and scores +${gameConfig.points.goldDurian}. Dump the mag — watch the pips.`,
          undefined,
          'Shoot it 4 times',
        );
        this.withAmmo(gameConfig.hitsRequired.goldDurian, () =>
          this.spawnNow('goldDurian', 'window'),
        );
        break;
      case 6:
        this.waiting = 'collect-heart';
        this.host.setLives(Math.max(1, gameConfig.startLives - 1));
        this.prompt(
          'Hearts',
          `Hearts grant +1 life (max ${gameConfig.maxLives}) and never break combo. Endless only — Timed has no lives.`,
          undefined,
          'Collect the heart',
        );
        this.withAmmo(1, () => this.spawnNow('heart', 'window'));
        break;
      case 7:
        this.waiting = 'watch-escape';
        this.host.setLives(gameConfig.startLives);
        this.prompt(
          'Escapes',
          'In Endless, a durian that leaves costs a life. Windows blink before they go. Let this one walk.',
          undefined,
          'Do not shoot — watch it leave',
        );
        this.spawnNow('durian', 'window');
        break;
      case 8:
        this.waiting = 'destroy-close';
        this.prompt(
          'Close pops',
          'Some targets jump up near the camera. Same rule: durians yes, bubbles no. Close bubbles are faster — still skip them.',
          undefined,
          'Pop the close durian',
        );
        this.withAmmo(1, () => this.spawnNow('durian', 'close'));
        break;
      case 9:
        this.waiting = 'destroy-path';
        this.prompt(
          'Movers',
          'Others walk the castle gates and walls. Shoot before they leave the route.',
          undefined,
          'Hit the walking durian',
        );
        this.withAmmo(1, () => this.spawnNow('durian', 'path'));
        break;
      case 10:
        this.waiting = 'destroy-frenzy';
        this.host.setFrenzyLook(true);
        this.prompt(
          'Frenzy',
          `Endless: the top bar fills from points. Every ${gameConfig.frenzyMeterPoints.toLocaleString('en-US')} starts a ${gameConfig.frenzyDurationMs / 1000}s rush — faster spawns, bigger scores, fewer bubbles. Blue-glow targets never cost a life on escape.`,
          undefined,
          'Shoot the glowing durian',
        );
        this.withAmmo(1, () => this.spawnNow('durian', 'window', { frenzySpawned: true }));
        break;
      case 11:
        this.prompt(
          'Pick a mode',
          this.mobile
            ? 'Timed is a clock (no lives, no hearts). Endless is 3 lives + Frenzy. Pause and mute sit up top.'
            : 'Timed is a clock (no lives, no hearts; the last stretch speeds up). Endless is 3 lives + Frenzy. Esc pauses. Mute anytime.',
          'I’m ready',
        );
        break;
      default:
        this.finish();
        break;
    }
  }

  private prompt(title: string, body: string, continueLabel?: string, wait?: string): void {
    if (continueLabel) this.waiting = 'continue';
    this.coach.set({
      index: this.step + 1,
      total: TOTAL_STEPS,
      title,
      body,
      wait,
      continueLabel,
    });
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
    this.host.finish();
  }

  private spawnNow(
    kind: TargetKind,
    pattern: SpawnPattern,
    options?: { frenzySpawned?: boolean },
  ): void {
    this.host.clearTargets();
    this.host.spawn(kind, pattern, options);
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
        this.spawnNow('durian', 'window');
        break;
      case 'combo':
        this.spawnNow('durian', 'window');
        break;
      case 'destroy-gold':
        this.withAmmo(gameConfig.hitsRequired.goldDurian, () =>
          this.spawnNow('goldDurian', 'window'),
        );
        break;
      case 'collect-heart':
        this.spawnNow('heart', 'window');
        break;
      case 'destroy-close':
        this.spawnNow('durian', 'close');
        break;
      case 'destroy-path':
        this.spawnNow('durian', 'path');
        break;
      case 'destroy-frenzy':
        this.spawnNow('durian', 'window', { frenzySpawned: true });
        break;
      default:
        break;
    }
  }

  private matchesWait(kind: TargetKind): boolean {
    switch (this.waiting) {
      case 'destroy-durian':
      case 'combo':
      case 'destroy-close':
      case 'destroy-path':
      case 'destroy-frenzy':
        return kind === 'durian';
      case 'destroy-gold':
        return kind === 'goldDurian';
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
