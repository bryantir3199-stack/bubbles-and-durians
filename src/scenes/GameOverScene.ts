import type { GameMode, TimedPreset } from '../config/gameConfig';
import { defaultTimedPreset, getTimedPreset, toRankedMode } from '../config/gameConfig';
import {
  PLAYER_NAME_CHARS,
  PLAYER_NAME_LENGTH,
  cyclePlayerChar,
  isBannedPlayerName,
  validatePlayerName,
} from '../config/playerName';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import { isCoarsePointer } from '../core/display';
import { isLeaderboardConfigured, submitScore } from '../services/leaderboard';
import { startResultsBgm } from '../audio/sfx';
import { clearUI, panel, bindClick } from '../ui/dom';
import { isResultsCrashHeld, playResultsCrash } from '../ui/resultsCrash';

export class GameOverScene implements GameScene {
  readonly id = 'gameOver' as const;
  private mode: GameMode = 'endless';
  private timedPreset: TimedPreset | undefined;
  private score = 0;
  private letters: string[] = ['', '', ''];
  private cursor = 0;
  private submitting = false;
  private slotsEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor(private ctx: SceneContext) {}

  async enter(data?: SceneData): Promise<void> {
    this.mode = data?.mode ?? 'endless';
    this.timedPreset = data?.timedPreset;
    this.score = data?.timedTally?.total ?? data?.score ?? 0;
    this.letters = ['', '', ''];
    this.cursor = 0;
    this.submitting = false;

    if (!isResultsCrashHeld()) await playResultsCrash();
    startResultsBgm();

    clearUI(this.ctx.uiRoot);
    const slots = Array.from({ length: PLAYER_NAME_LENGTH }, (_, i) => this.slotHtml(i)).join('');
    const ui = panel(
      'menu game-over',
      `<div class="menu-card">
        <h1 class="danger">${this.modeLabel()}</h1>
        <p class="score-big">Score: ${this.fmt(this.score)}</p>
        <div class="go-form">
          <p>Enter 3 initials</p>
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
    bindClick(ui, '[data-action="skip"]', () => {
      this.ctx.goto('leaderboard', {
        mode: this.mode,
        timedPreset: this.timedPreset,
        rankedMode: toRankedMode(this.mode, this.timedPreset) ?? 'endless',
        score: this.score,
      });
    });

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
        this.cycle(this.cursor, 1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.cycle(this.cursor, -1);
      } else if (event.key.length === 1) {
        const ch = event.key.toUpperCase();
        if (PLAYER_NAME_CHARS.includes(ch)) {
          event.preventDefault();
          this.setLetter(this.cursor, ch, true);
        }
      }
    };
    window.addEventListener('keydown', this.onKey);

    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);
    this.redrawSlots();
  }

  update(): void {}

  exit(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    clearUI(this.ctx.uiRoot);
  }

  private slotHtml(index: number): string {
    return `<div class="name-slot" data-slot="${index}">
      <button type="button" class="name-step" data-cycle="1" data-slot="${index}" aria-label="Next letter">▲</button>
      <button type="button" class="name-letter" data-slot="${index}">_</button>
      <button type="button" class="name-step" data-cycle="-1" data-slot="${index}" aria-label="Previous letter">▼</button>
    </div>`;
  }

  private bindSlots(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = Number(el.dataset.slot);
        if (!Number.isInteger(index)) return;
        const cycle = Number((el as HTMLElement).dataset.cycle);
        if (cycle === 1 || cycle === -1) {
          this.setCursor(index);
          this.cycle(index, cycle);
          return;
        }
        if (el.classList.contains('name-letter')) {
          this.setCursor(index);
          if (isCoarsePointer()) this.cycle(index, 1);
        }
      });
    });
  }

  private setCursor(index: number): void {
    this.cursor = Math.max(0, Math.min(PLAYER_NAME_LENGTH - 1, index));
    this.redrawSlots();
  }

  private setLetter(index: number, ch: string, advance: boolean): void {
    this.letters[index] = ch;
    if (advance && index < PLAYER_NAME_LENGTH - 1) this.cursor = index + 1;
    else this.cursor = index;
    this.redrawSlots();
    this.syncStatus();
  }

  private cycle(index: number, dir: 1 | -1): void {
    this.letters[index] = cyclePlayerChar(this.letters[index] ?? '', dir);
    this.redrawSlots();
    this.syncStatus();
  }

  private backspace(): void {
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
      const letter = slot.querySelector('.name-letter');
      if (letter) letter.textContent = this.letters[i] || '_';
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

  private fmt(n: number): string {
    return n.toLocaleString('en-US');
  }

  private async doSubmit(): Promise<void> {
    if (this.submitting || !this.statusEl) return;
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
    window.setTimeout(() => {
      this.ctx.goto('leaderboard', {
        mode: this.mode,
        timedPreset: this.timedPreset,
        rankedMode: toRankedMode(this.mode, this.timedPreset) ?? 'endless',
        score: this.score,
        highlightScore: this.score,
        playerName: parsed.name,
      });
    }, 500);
  }
}
