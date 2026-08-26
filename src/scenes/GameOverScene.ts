import type { GameMode, TimedPreset, TimedRunTally } from '../config/gameConfig';
import { defaultTimedPreset, gameConfig, getTimedPreset, toRankedMode } from '../config/gameConfig';
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
import { clearUI, panel, bindClick } from '../ui/dom';

export class GameOverScene implements GameScene {
  readonly id = 'gameOver' as const;
  private mode: GameMode = 'endless';
  private timedPreset: TimedPreset | undefined;
  private score = 0;
  private timedTally: TimedRunTally | undefined;
  private letters: string[] = ['', '', ''];
  private cursor = 0;
  private submitting = false;
  private slotsEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  private tallyInfoWrap: HTMLElement | null = null;
  private tallyInfoBtn: HTMLButtonElement | null = null;

  constructor(private ctx: SceneContext) {}

  enter(data?: SceneData): void {
    this.mode = data?.mode ?? 'endless';
    this.timedPreset = data?.timedPreset;
    this.timedTally = data?.timedTally;
    this.score = data?.timedTally?.total ?? data?.score ?? 0;
    this.letters = ['', '', ''];
    this.cursor = 0;
    this.submitting = false;

    clearUI(this.ctx.uiRoot);
    const slots = Array.from({ length: PLAYER_NAME_LENGTH }, (_, i) => this.slotHtml(i)).join('');
    const ui = panel(
      'menu game-over',
      `<div class="menu-card">
        <h1 class="danger">GAME OVER</h1>
        <p class="muted">${this.modeLabel()}</p>
        ${this.scoreMarkup()}
        <div class="go-form">
          <p>Enter 3 initials</p>
          <div class="name-initials" id="name-initials">${slots}</div>
          <p class="status" id="status">${isLeaderboardConfigured() ? '' : 'Offline — set .env for online scores'}</p>
          <div class="btn-row">
            <button type="button" class="btn primary" data-action="submit">SUBMIT</button>
            <button type="button" class="btn" data-action="skip">SKIP</button>
          </div>
          <button type="button" class="btn muted-btn" data-action="menu">MENU</button>
        </div>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);
    this.slotsEl = ui.querySelector('#name-initials');
    this.statusEl = ui.querySelector('#status');
    this.bindSlots(ui);
    this.bindBonusInfo(ui);

    bindClick(ui, '[data-action="submit"]', () => void this.doSubmit());
    bindClick(ui, '[data-action="skip"]', () => {
      this.ctx.goto('leaderboard', {
        mode: this.mode,
        timedPreset: this.timedPreset,
        rankedMode: toRankedMode(this.mode, this.timedPreset) ?? 'endless',
        score: this.score,
      });
    });
    bindClick(ui, '[data-action="menu"]', () => this.ctx.goto('modeSelect'));

    this.onKey = (event: KeyboardEvent) => {
      if (this.submitting) return;
      if (event.key === 'Escape') {
        this.setBonusInfoOpen(false);
        return;
      }
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
    this.tallyInfoWrap = null;
    this.tallyInfoBtn = null;
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
      this.statusEl.textContent = 'That name isn’t allowed';
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

  private scoreMarkup(): string {
    const tally = this.timedTally;
    if (!tally) {
      return `<p class="score-big">Score: ${this.fmt(this.score)}</p>`;
    }
    const bonus = (n: number) => (n > 0 ? 'is-earned' : 'is-missed');
    const finale =
      tally.finaleScore > 0
        ? `<div class="tally-row tally-included"><span>FINALE</span><span>${this.fmt(tally.finaleScore)}</span></div>`
        : '';
    return `<div class="run-tally" aria-label="Round tally">
      <div class="tally-info">
        <button type="button" class="tally-info-btn" aria-label="How bonuses work" aria-expanded="false" aria-describedby="tally-info-bubble">i</button>
        <div class="tally-info-bubble" id="tally-info-bubble" role="tooltip" aria-hidden="true">${this.bonusInfoMarkup()}</div>
      </div>
      <div class="tally-row"><span>SCORE</span><span>${this.fmt(tally.runScore)}</span></div>
      ${finale}
      <div class="tally-row ${bonus(tally.maxComboBonus)}"><span>MAX COMBO</span><span>+${this.fmt(tally.maxComboBonus)}</span></div>
      <div class="tally-row ${bonus(tally.comboHoldBonus)}"><span>COMBO HOLD</span><span>+${this.fmt(tally.comboHoldBonus)}</span></div>
      <div class="tally-row ${bonus(tally.cleanRoundBonus)}"><span>CLEAN ROUND</span><span>+${this.fmt(tally.cleanRoundBonus)}</span></div>
      <div class="tally-row ${tally.accuracyPct >= 100 ? 'is-earned' : tally.accuracyPct <= 0 ? 'is-missed' : ''}"><span>ACCURACY</span><span>× ${tally.accuracyPct}%</span></div>
      <div class="tally-row tally-total"><span>TOTAL</span><span>${this.fmt(tally.total)}</span></div>
    </div>`;
  }

  private bonusInfoMarkup(): string {
    const max = gameConfig.maxCombo;
    const finaleSecs = getTimedPreset(this.timedPreset ?? defaultTimedPreset).finalBoostSeconds;
    return `<p class="tally-info-title">Round bonuses</p>
      <ul class="tally-info-list">
        <li><strong>Max combo</strong> — hit ${max}× at least once. +${this.fmt(gameConfig.timedBonusMaxCombo)}</li>
        <li><strong>Combo hold</strong> — +${this.fmt(gameConfig.timedBonusPerSecAtMaxCombo)} per second spent at ${max}×.</li>
        <li><strong>Clean round</strong> — don’t shoot any bubbles. +${this.fmt(gameConfig.timedBonusCleanRound)}</li>
        <li><strong>Finale</strong> — last ${finaleSecs}s, durian/gold score ${gameConfig.timedFinaleScoreMult}× (already in SCORE).</li>
        <li><strong>Accuracy</strong> — durian hits ÷ shots fired (bubbles and misses count against you). Multiplies your total. No shots is 0%.</li>
      </ul>`;
  }

  private bindBonusInfo(root: HTMLElement): void {
    const wrap = root.querySelector<HTMLElement>('.tally-info');
    const btn = root.querySelector<HTMLButtonElement>('.tally-info-btn');
    if (!wrap || !btn) return;
    this.tallyInfoWrap = wrap;
    this.tallyInfoBtn = btn;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setBonusInfoOpen(!wrap.classList.contains('is-open'));
    });

    root.addEventListener('pointerdown', (e) => {
      if (!wrap.classList.contains('is-open')) return;
      if (wrap.contains(e.target as Node)) return;
      this.setBonusInfoOpen(false);
    });
  }

  private setBonusInfoOpen(open: boolean): void {
    const wrap = this.tallyInfoWrap;
    const btn = this.tallyInfoBtn;
    if (!wrap || !btn) return;
    wrap.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    wrap.querySelector('.tally-info-bubble')?.setAttribute('aria-hidden', open ? 'false' : 'true');
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
