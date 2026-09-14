import type { GameMode, TimedPreset } from '../config/gameConfig';
import { defaultTimedPreset, getTimedPreset, toRankedMode } from '../config/gameConfig';
import {
  PLAYER_NAME_CHARS,
  PLAYER_NAME_LENGTH,
  cyclePlayerChar,
  isBannedPlayerName,
  offsetPlayerChar,
  shortestPlayerSpin,
  validatePlayerName,
} from '../config/playerName';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import { isCoarsePointer } from '../core/display';
import { isLeaderboardConfigured, submitScore } from '../services/leaderboard';
import { playReelSelectSound, startResultsBgm } from '../audio/sfx';
import { clearUI, panel, bindClick, flashThen } from '../ui/dom';
import { isResultsCrashHeld, playResultsCrash } from '../ui/resultsCrash';

const REEL_SPIN_MS = 320;
const REEL_HOLD_MS = Math.round(REEL_SPIN_MS / 1.5);
const REEL_FAST_MS = Math.round(REEL_HOLD_MS / 1.5);
const REEL_HOLD_DELAY_MS = 300;

type ReelMove = { from: string; dir: 1 | -1; steps: number; fast?: boolean };

export class GameOverScene implements GameScene {
  readonly id = 'gameOver' as const;
  private mode: GameMode = 'endless';
  private timedPreset: TimedPreset | undefined;
  private score = 0;
  private bubblesHit: number | undefined;
  private peakCombo: number | undefined;
  private letters: string[] = ['A', 'A', 'A'];
  private cursor = 0;
  private submitting = false;
  private slotsEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;
  private onKeyUp: ((e: KeyboardEvent) => void) | null = null;
  private onPointerUp: (() => void) | null = null;
  private onBlockScroll: ((event: Event) => void) | null = null;
  private flashTimer = 0;
  private reelTimers: number[] = [0, 0, 0];
  private reelGen: number[] = [0, 0, 0];
  private reelBusy: boolean[] = [false, false, false];
  private reelQueue: ReelMove[][] = [[], [], []];
  private holding: { index: number; dir: 1 | -1 } | null = null;
  private holdFast = false;
  private holdDelayTimer = 0;
  private swipe: { index: number; pointerId: number; startY: number } | null = null;
  private cruise: {
    index: number;
    dir: 1 | -1;
    progress: number;
    lastTs: number;
    speed: number;
    stopping: boolean;
    raf: number;
    moved: number;
  } | null = null;

  constructor(private ctx: SceneContext) {}

  async enter(data?: SceneData): Promise<void> {
    this.mode = data?.mode ?? 'endless';
    this.timedPreset = data?.timedPreset;
    this.score = data?.timedTally?.total ?? data?.score ?? 0;
    this.bubblesHit = data?.bubblesHit;
    this.peakCombo = data?.peakCombo;
    this.letters = ['A', 'A', 'A'];
    this.cursor = 0;
    this.submitting = false;
    this.flashTimer = 0;
    this.reelTimers = [0, 0, 0];
    this.reelGen = [0, 0, 0];
    this.reelBusy = [false, false, false];
    this.reelQueue = [[], [], []];
    this.holding = null;
    this.holdFast = false;
    this.holdDelayTimer = 0;
    this.swipe = null;
    this.stopCruiseImmediate();

    if (!isResultsCrashHeld()) await playResultsCrash(this.headline());
    startResultsBgm();

    clearUI(this.ctx.uiRoot);
    const slots = Array.from({ length: PLAYER_NAME_LENGTH }, (_, i) => this.slotHtml(i)).join('');
    const ui = panel(
      'menu game-over',
      `<div class="menu-card">
        <h1 class="danger">${this.headline()}</h1>
        <p class="muted">${this.modeLabel()}</p>
        <p class="score-big">Score: ${this.fmt(this.score)}</p>
        ${this.endlessStatsMarkup()}
        <div class="go-form">
          <p class="go-prompt">Enter your <strong>3 initials</strong></p>
          <div class="name-initials" id="name-initials">${slots}</div>
          <p class="status" id="status">${isLeaderboardConfigured() ? '' : 'Offline — set .env for online scores'}</p>
          <div class="btn-row">
            <button type="button" class="btn primary" data-action="submit">SUBMIT</button>
            <button type="button" class="btn" data-action="skip">SKIP</button>
          </div>
        </div>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);
    this.slotsEl = ui.querySelector('#name-initials');
    this.statusEl = ui.querySelector('#status');
    this.bindSlots(ui);

    bindClick(ui, '[data-action="submit"]', () => void this.doSubmit());
    bindClick(ui, '[data-action="skip"]', () => this.goSkip());

    this.onKey = (event: KeyboardEvent) => {
      if (this.submitting) return;
      if (event.key === 'Backspace') {
        event.preventDefault();
        this.backspace();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        void this.doSubmit();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.setCursor(this.cursor - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.setCursor(this.cursor + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!event.repeat) this.beginHold(this.cursor, -1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!event.repeat) this.beginHold(this.cursor, 1);
      } else if (event.key.length === 1) {
        const ch = event.key.toUpperCase();
        if (PLAYER_NAME_CHARS.includes(ch)) {
          event.preventDefault();
          this.setLetter(this.cursor, ch, true);
        }
      }
    };
    window.addEventListener('keydown', this.onKey);
    this.onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') this.endHold();
    };
    window.addEventListener('keyup', this.onKeyUp);
    this.onPointerUp = () => {
      this.swipe = null;
      this.endHold();
    };
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    this.onBlockScroll = (event) => event.preventDefault();
    window.addEventListener('touchmove', this.onBlockScroll, { passive: false });
    window.addEventListener('wheel', this.onBlockScroll, { passive: false });

    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);
    this.redrawSlots();
  }

  update(): void {}

  exit(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    if (this.onKeyUp) window.removeEventListener('keyup', this.onKeyUp);
    this.onKeyUp = null;
    if (this.onPointerUp) {
      window.removeEventListener('pointerup', this.onPointerUp);
      window.removeEventListener('pointercancel', this.onPointerUp);
    }
    this.onPointerUp = null;
    if (this.onBlockScroll) {
      window.removeEventListener('touchmove', this.onBlockScroll);
      window.removeEventListener('wheel', this.onBlockScroll);
    }
    this.onBlockScroll = null;
    this.swipe = null;
    this.endHold();
    this.stopCruiseImmediate();
    window.clearTimeout(this.flashTimer);
    this.flashTimer = 0;
    this.reelTimers.forEach((timer) => window.clearTimeout(timer));
    this.reelTimers = [0, 0, 0];
    this.reelBusy = [false, false, false];
    this.reelQueue = [[], [], []];
    clearUI(this.ctx.uiRoot);
  }

  private goLeaderboard(extra?: { highlightScore?: number; playerName?: string }): void {
    this.ctx.goto('leaderboard', {
      mode: this.mode,
      timedPreset: this.timedPreset,
      rankedMode: toRankedMode(this.mode, this.timedPreset) ?? 'endless',
      score: this.score,
      ...extra,
    });
  }

  private goSkip(): void {
    if (this.submitting || this.flashTimer) return;
    const skip = this.ctx.uiRoot.querySelector<HTMLElement>('[data-action="skip"]');
    if (!skip) return;
    this.flashTimer = flashThen(skip, () => {
      this.flashTimer = 0;
      this.goLeaderboard();
    });
  }

  private slotHtml(index: number): string {
    const cells = Array.from({ length: 5 }, () => '<span class="name-reel-char"></span>').join('');
    return `<div class="name-slot" data-slot="${index}">
      <button type="button" class="name-step" data-cycle="-1" data-slot="${index}" aria-label="Previous letter">▲</button>
      <button type="button" class="name-letter" data-slot="${index}" aria-label="Initial ${index + 1}">
        <span class="name-reel" data-reel>${cells}</span>
        <span class="name-reel-shade" aria-hidden="true"></span>
      </button>
      <button type="button" class="name-step" data-cycle="1" data-slot="${index}" aria-label="Next letter">▼</button>
    </div>`;
  }

  private bindSlots(root: HTMLElement): void {
    root.querySelectorAll<HTMLButtonElement>('.name-step').forEach((btn) => {
      btn.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const index = Number(btn.dataset.slot);
        const dir = Number(btn.dataset.cycle);
        if (!Number.isInteger(index) || (dir !== 1 && dir !== -1)) return;
        this.beginHold(index, dir);
      });
    });
    root.querySelectorAll<HTMLElement>('.name-letter').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        const index = Number(el.dataset.slot);
        if (!Number.isInteger(index)) return;
        this.setCursor(index);
      });
      if (!isCoarsePointer()) return;
      el.addEventListener('pointerdown', (event) => this.onSlotSwipeStart(event, el));
      el.addEventListener('pointermove', (event) => this.onSlotSwipeMove(event));
      el.addEventListener('pointerup', (event) => this.onSlotSwipeEnd(event, el));
      el.addEventListener('pointercancel', (event) => this.onSlotSwipeEnd(event, el));
    });
  }

  private onSlotSwipeStart(event: PointerEvent, el: HTMLElement): void {
    if (event.button !== 0 || this.submitting) return;
    const index = Number(el.dataset.slot);
    if (!Number.isInteger(index)) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      /* capture is best-effort on some browsers */
    }
    this.setCursor(index);
    this.swipe = { index, pointerId: event.pointerId, startY: event.clientY };
  }

  private onSlotSwipeMove(event: PointerEvent): void {
    const swipe = this.swipe;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const dy = event.clientY - swipe.startY;
    const threshold = 18;
    let dir: 1 | -1 | 0 = 0;
    if (dy <= -threshold) dir = 1;
    else if (dy >= threshold) dir = -1;
    if (!dir) return;
    if (this.holding?.index === swipe.index && this.holding.dir === dir) return;
    this.beginHold(swipe.index, dir);
  }

  private onSlotSwipeEnd(event: PointerEvent, el: HTMLElement): void {
    if (!this.swipe || this.swipe.pointerId !== event.pointerId) return;
    try {
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    this.swipe = null;
    this.endHold();
  }

  private setCursor(index: number): void {
    this.cursor = Math.max(0, Math.min(PLAYER_NAME_LENGTH - 1, index));
    this.redrawSlots();
  }

  private beginHold(index: number, dir: 1 | -1): void {
    if (this.cruise && !this.cruise.stopping && this.cruise.index === index && this.cruise.dir === dir) {
      return;
    }
    this.stopCruiseImmediate();
    this.abortReel(index);
    this.holding = { index, dir };
    this.holdFast = false;
    this.cursor = index;
    if (this.slotsEl) {
      this.slotsEl.querySelectorAll<HTMLElement>('.name-slot').forEach((slot, i) => {
        slot.classList.toggle('is-active', i === this.cursor);
      });
    }
    this.reelBusy[index] = true;
    const reel = this.reelEl(index);
    if (reel) {
      reel.classList.remove('is-spinning', 'is-spin-up', 'is-spin-down');
      this.paintStrip(reel, this.letters[index] || 'A', 1, 1);
    }
    this.cruise = {
      index,
      dir,
      progress: 0,
      lastTs: 0,
      speed: 1 / REEL_HOLD_MS,
      stopping: false,
      raf: 0,
      moved: 0,
    };
    this.cruise.raf = window.requestAnimationFrame((ts) => this.tickCruise(ts));
    this.holdDelayTimer = window.setTimeout(() => {
      if (!this.cruise || this.cruise.stopping || this.cruise.index !== index) return;
      this.holdFast = true;
      this.cruise.speed = 1 / REEL_FAST_MS;
    }, REEL_HOLD_DELAY_MS);
  }

  private endHold(): void {
    window.clearTimeout(this.holdDelayTimer);
    this.holdDelayTimer = 0;
    this.holding = null;
    this.holdFast = false;
    if (!this.cruise || this.cruise.stopping) return;
    this.cruise.stopping = true;
    if (!this.cruise.raf) {
      this.cruise.raf = window.requestAnimationFrame((ts) => this.tickCruise(ts));
    }
  }

  private setLetter(index: number, ch: string, advance: boolean): void {
    const from = this.letters[index] || 'A';
    this.abortReel(index);
    this.letters[index] = ch;
    if (advance && index < PLAYER_NAME_LENGTH - 1) this.cursor = index + 1;
    else this.cursor = index;
    if (this.slotsEl) {
      this.slotsEl.classList.toggle('is-blocked', isBannedPlayerName(this.currentName()));
      this.slotsEl.querySelectorAll<HTMLElement>('.name-slot').forEach((slot, i) => {
        slot.classList.toggle('is-active', i === this.cursor);
      });
    }
    if (from === ch) {
      this.settleReel(index, ch);
    } else {
      const spin = shortestPlayerSpin(from, ch);
      this.reelQueue[index].push({ from, dir: spin.dir, steps: Math.max(1, spin.steps) });
      if (!this.reelBusy[index]) this.pumpReel(index);
    }
    this.syncStatus();
  }

  private cycle(index: number, dir: 1 | -1): void {
    const from = this.letters[index] ?? 'A';
    this.letters[index] = cyclePlayerChar(from, dir);
    this.cursor = index;
    if (this.slotsEl) {
      this.slotsEl.classList.toggle('is-blocked', isBannedPlayerName(this.currentName()));
      this.slotsEl.querySelectorAll<HTMLElement>('.name-slot').forEach((slot, i) => {
        slot.classList.toggle('is-active', i === this.cursor);
      });
    }
    this.reelQueue[index].push({ from, dir, steps: 1, fast: this.holdFast });
    if (!this.reelBusy[index]) this.pumpReel(index);
    this.syncStatus();
  }

  private backspace(): void {
    this.abortReel(this.cursor);
    if (this.letters[this.cursor]) {
      this.letters[this.cursor] = '';
    } else if (this.cursor > 0) {
      this.cursor -= 1;
      this.letters[this.cursor] = '';
    }
    this.redrawSlots();
    this.syncStatus();
  }

  private currentName(): string {
    return this.letters.join('');
  }

  private redrawSlots(): void {
    if (!this.slotsEl) return;
    const banned = isBannedPlayerName(this.currentName());
    this.slotsEl.classList.toggle('is-blocked', banned);
    this.slotsEl.querySelectorAll<HTMLElement>('.name-slot').forEach((slot, i) => {
      slot.classList.toggle('is-active', i === this.cursor);
      if (this.reelBusy[i] || this.cruise?.index === i) return;
      this.settleReel(i, this.letters[i] ?? 'A');
    });
  }

  private reelEl(index: number): HTMLElement | null {
    return this.slotsEl?.querySelectorAll<HTMLElement>('.name-slot')[index]?.querySelector('[data-reel]') ?? null;
  }

  private ensureReelCells(reel: HTMLElement, count: number): HTMLElement[] {
    while (reel.childElementCount < count) {
      const cell = document.createElement('span');
      cell.className = 'name-reel-char';
      reel.appendChild(cell);
    }
    while (reel.childElementCount > count) reel.lastElementChild?.remove();
    return [...reel.querySelectorAll<HTMLElement>('.name-reel-char')];
  }

  private paintStrip(reel: HTMLElement, from: string, dir: 1 | -1, steps: number): void {
    const extra = Math.max(0, steps - 1);
    const count = 5 + extra;
    const cells = this.ensureReelCells(reel, count);
    const center = dir === 1 ? 2 : 2 + extra;
    reel.style.setProperty('--reel-center', String(center));
    reel.style.setProperty('--reel-steps', String(steps));
    cells.forEach((cell, i) => {
      cell.textContent = offsetPlayerChar(from, i - center);
    });
  }

  private settleReel(index: number, current: string): void {
    const reel = this.reelEl(index);
    if (!reel) return;
    this.paintStrip(reel, current || 'A', 1, 1);
    reel.classList.remove('is-spinning', 'is-spin-up', 'is-spin-down');
    reel.style.transition = 'none';
    reel.style.transform = '';
    void reel.offsetHeight;
    reel.style.removeProperty('transition');
    reel.style.removeProperty('transform');
  }

  private stopCruiseImmediate(): void {
    if (!this.cruise) return;
    const index = this.cruise.index;
    window.cancelAnimationFrame(this.cruise.raf);
    this.cruise = null;
    this.holding = null;
    this.holdFast = false;
    window.clearTimeout(this.holdDelayTimer);
    this.holdDelayTimer = 0;
    this.reelBusy[index] = false;
    this.settleReel(index, this.letters[index] || 'A');
  }

  private cruiseMetrics(reel: HTMLElement): { idle: number; cell: number } {
    const windowH = reel.parentElement?.getBoundingClientRect().height ?? 0;
    const cell = reel.querySelector('.name-reel-char')?.getBoundingClientRect().height ?? 0;
    return { idle: windowH / 2 - 2.5 * cell, cell };
  }

  private applyCruiseTransform(): void {
    if (!this.cruise) return;
    const reel = this.reelEl(this.cruise.index);
    if (!reel) return;
    const { idle, cell } = this.cruiseMetrics(reel);
    const y = idle - this.cruise.dir * this.cruise.progress * cell;
    reel.style.transition = 'none';
    reel.style.transform = `translateY(${y}px)`;
  }

  private commitCruiseCell(): void {
    if (!this.cruise) return;
    const index = this.cruise.index;
    this.letters[index] = cyclePlayerChar(this.letters[index] || 'A', this.cruise.dir);
    this.cruise.moved += 1;
    const reel = this.reelEl(index);
    if (reel) this.paintStrip(reel, this.letters[index] || 'A', 1, 1);
    playReelSelectSound();
    this.syncStatus();
  }

  private tickCruise(ts: number): void {
    const cruise = this.cruise;
    if (!cruise) return;
    if (!cruise.lastTs) cruise.lastTs = ts;
    const dt = Math.min(32, ts - cruise.lastTs);
    cruise.lastTs = ts;
    cruise.progress += cruise.speed * dt;

    if (cruise.stopping) {
      if (cruise.progress >= 1) {
        this.commitCruiseCell();
        const index = cruise.index;
        window.cancelAnimationFrame(cruise.raf);
        this.cruise = null;
        this.reelBusy[index] = false;
        this.settleReel(index, this.letters[index] || 'A');
        return;
      }
    } else {
      while (cruise.progress >= 1) {
        cruise.progress -= 1;
        this.commitCruiseCell();
      }
    }

    this.applyCruiseTransform();
    cruise.raf = window.requestAnimationFrame((next) => this.tickCruise(next));
  }

  private abortReel(index: number): void {
    if (this.cruise?.index === index) this.stopCruiseImmediate();
    this.reelGen[index] += 1;
    window.clearTimeout(this.reelTimers[index]);
    this.reelTimers[index] = 0;
    this.reelBusy[index] = false;
    this.reelQueue[index] = [];
  }

  private pumpReel(index: number): void {
    const next = this.reelQueue[index].shift();
    if (!next) {
      this.reelBusy[index] = false;
      this.settleReel(index, this.letters[index] ?? 'A');
      return;
    }
    this.reelBusy[index] = true;
    this.spinReel(index, next, () => this.pumpReel(index));
  }

  private spinReel(index: number, move: ReelMove, done: () => void): void {
    const reel = this.reelEl(index);
    if (!reel) {
      done();
      return;
    }

    const steps = Math.max(1, move.steps);
    let landed = move.from;
    for (let i = 0; i < steps; i++) landed = cyclePlayerChar(landed, move.dir);

    this.paintStrip(reel, move.from, move.dir, steps);
    reel.classList.remove('is-spinning', 'is-spin-up', 'is-spin-down');
    reel.style.transition = 'none';
    reel.style.transform = '';
    void reel.offsetHeight;
    reel.style.removeProperty('transform');

    const duration = move.fast
      ? REEL_FAST_MS
      : steps === 1
        ? REEL_SPIN_MS
        : Math.min(520, 260 + steps * 18);
    reel.style.transition = `transform ${duration}ms cubic-bezier(0.33, 0.12, 0.18, 1)`;

    const gen = this.reelGen[index];
    let finished = false;
    let crossed = 0;
    let watchRaf = 0;
    const cell = this.cruiseMetrics(reel).cell || 1;
    const readY = (): number => {
      const t = getComputedStyle(reel).transform;
      if (!t || t === 'none') return 0;
      return new DOMMatrix(t).m42;
    };

    const tickCrossings = (originY: number): void => {
      if (finished || gen !== this.reelGen[index]) return;
      const passed = Math.min(steps, Math.floor(Math.abs(readY() - originY) / cell + 1e-4));
      while (crossed < passed) {
        crossed += 1;
        playReelSelectSound();
      }
      if (crossed < steps) {
        watchRaf = window.requestAnimationFrame(() => tickCrossings(originY));
      }
    };

    const finish = (): void => {
      if (finished || gen !== this.reelGen[index]) return;
      finished = true;
      window.cancelAnimationFrame(watchRaf);
      window.clearTimeout(this.reelTimers[index]);
      this.reelTimers[index] = 0;
      reel.removeEventListener('transitionend', onEnd);
      while (crossed < steps) {
        crossed += 1;
        playReelSelectSound();
      }
      this.settleReel(index, landed);
      done();
    };

    const onEnd = (event: TransitionEvent): void => {
      if (event.propertyName !== 'transform' || event.target !== reel) return;
      finish();
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (gen !== this.reelGen[index]) return;
        reel.addEventListener('transitionend', onEnd);
        const originY = readY();
        reel.classList.add('is-spinning', move.dir === 1 ? 'is-spin-up' : 'is-spin-down');
        watchRaf = window.requestAnimationFrame(() => tickCrossings(originY));
        this.reelTimers[index] = window.setTimeout(finish, duration + 60);
      });
    });
  }

  private syncStatus(): void {
    if (!this.statusEl || this.submitting) return;
    if (!isLeaderboardConfigured()) return;
    const name = this.currentName();
    if (name.length === PLAYER_NAME_LENGTH && isBannedPlayerName(name)) {
      this.statusEl.className = 'status danger-text';
      this.statusEl.textContent = "That name isn't allowed";
      return;
    }
    this.statusEl.className = 'status';
    this.statusEl.textContent = '';
  }

  private modeLabel(): string {
    if (this.mode === 'tutorial') return 'How to Play';
    if (this.mode === 'endless') return 'Endless Mode';
    const preset = getTimedPreset(this.timedPreset ?? defaultTimedPreset);
    return `Timed Mode · ${preset.label} (${preset.seconds}s)`;
  }

  /** Matches the brief plaque-slam flash text — never rendered visibly, kept for a11y/no-CSS fallback. */
  private headline(): string {
    return this.mode === 'timed' ? "TIME'S UP" : 'GAME OVER';
  }

  /** Endless-only run flavor under the score — skipped when the stats weren't handed off from PlayScene. */
  private endlessStatsMarkup(): string {
    if (this.mode !== 'endless') return '';
    if (this.peakCombo === undefined && this.bubblesHit === undefined) return '';
    const parts: string[] = [];
    if (this.peakCombo !== undefined && this.peakCombo > 1) {
      parts.push(`Best combo <strong>${this.peakCombo}×</strong>`);
    }
    if (this.bubblesHit !== undefined) {
      const label = this.bubblesHit === 1 ? 'bubble' : 'bubbles';
      parts.push(`<strong class="${this.bubblesHit > 0 ? 'danger-text' : ''}">${this.bubblesHit}</strong> ${label} popped`);
    }
    if (!parts.length) return '';
    return `<p class="go-flavor">${parts.join(' · ')}</p>`;
  }

  private fmt(n: number): string {
    return n.toLocaleString('en-US');
  }

  private async doSubmit(): Promise<void> {
    if (this.submitting || this.flashTimer || !this.statusEl) return;
    const parsed = validatePlayerName(this.currentName());
    if (!parsed.ok) {
      this.statusEl.className = 'status danger-text';
      this.statusEl.textContent = parsed.error;
      return;
    }

    this.submitting = true;
    this.statusEl.className = 'status';
    this.statusEl.textContent = 'Submitting…';

    const result = await submitScore(parsed.name, this.score, this.mode, this.timedPreset);
    if (!result.ok) {
      this.statusEl.className = 'status danger-text';
      this.statusEl.textContent = result.error ?? 'Submit failed';
      this.submitting = false;
      return;
    }

    this.statusEl.className = 'status ok-text';
    this.statusEl.textContent = 'Score saved!';
    const submit = this.ctx.uiRoot.querySelector<HTMLElement>('[data-action="submit"]');
    if (!submit) {
      this.goLeaderboard({ highlightScore: this.score, playerName: parsed.name });
      return;
    }
    this.flashTimer = flashThen(submit, () => {
      this.flashTimer = 0;
      this.goLeaderboard({ highlightScore: this.score, playerName: parsed.name });
    });
  }
}
