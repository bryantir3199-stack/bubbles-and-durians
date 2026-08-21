import type { GameMode, TimedPreset } from '../config/gameConfig';
import { defaultTimedPreset, getTimedPreset } from '../config/gameConfig';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import { isLeaderboardConfigured, submitScore } from '../services/leaderboard';
import { clearUI, panel, bindClick } from '../ui/dom';

export class GameOverScene implements GameScene {
  readonly id = 'gameOver' as const;
  private mode: GameMode = 'endless';
  private timedPreset: TimedPreset | undefined;
  private score = 0;
  private nameValue = '';
  private submitting = false;
  private nameEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor(private ctx: SceneContext) {}

  enter(data?: SceneData): void {
    this.mode = data?.mode ?? 'endless';
    this.timedPreset = data?.timedPreset;
    this.score = data?.score ?? 0;
    this.nameValue = '';
    this.submitting = false;

    clearUI(this.ctx.uiRoot);
    const ui = panel(
      'menu game-over',
      `<div class="menu-card">
        <h1 class="danger">GAME OVER</h1>
        <p class="muted">${this.modeLabel()}</p>
        <p class="score-big">Score: ${this.score}</p>
        <p>Enter name for leaderboard</p>
        <div class="name-field" id="name-field">_</div>
        <p class="status" id="status">${isLeaderboardConfigured() ? '' : 'Offline — set .env for online scores'}</p>
        <div class="btn-row">
          <button type="button" class="btn primary" data-action="submit">SUBMIT</button>
          <button type="button" class="btn" data-action="skip">SKIP</button>
        </div>
        <button type="button" class="btn muted-btn" data-action="menu">MENU</button>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);
    this.nameEl = ui.querySelector('#name-field');
    this.statusEl = ui.querySelector('#status');

    bindClick(ui, '[data-action="submit"]', () => void this.doSubmit());
    bindClick(ui, '[data-action="skip"]', () => {
      this.ctx.goto('leaderboard', { mode: this.mode, highlightScore: this.score });
    });
    bindClick(ui, '[data-action="menu"]', () => this.ctx.goto('modeSelect'));

    this.onKey = (event: KeyboardEvent) => {
      if (this.submitting) return;
      if (event.key === 'Backspace') {
        this.nameValue = this.nameValue.slice(0, -1);
      } else if (event.key === 'Enter') {
        void this.doSubmit();
        return;
      } else if (event.key.length === 1 && this.nameValue.length < 16) {
        if (/^[a-zA-Z0-9 _\-!?.]$/.test(event.key)) {
          this.nameValue += event.key;
        }
      }
      if (this.nameEl) this.nameEl.textContent = this.nameValue.length > 0 ? this.nameValue : '_';
    };
    window.addEventListener('keydown', this.onKey);

    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);
  }

  update(): void {}

  exit(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    clearUI(this.ctx.uiRoot);
  }

  private modeLabel(): string {
    if (this.mode === 'tutorial') return 'Tutorial';
    if (this.mode === 'endless') return 'Endless Mode';
    const preset = getTimedPreset(this.timedPreset ?? defaultTimedPreset);
    return `Timed Mode · ${preset.label} (${preset.seconds}s)`;
  }

  private async doSubmit(): Promise<void> {
    if (this.submitting || !this.statusEl) return;
    this.submitting = true;
    this.statusEl.className = 'status';
    this.statusEl.textContent = 'Submitting…';

    const result = await submitScore(this.nameValue || 'Player', this.score, this.mode);
    if (!result.ok) {
      this.statusEl.className = 'status danger-text';
      this.statusEl.textContent = result.error ?? 'Submit failed';
      this.submitting = false;
      return;
    }

    this.statusEl.className = 'status ok-text';
    this.statusEl.textContent = 'Score saved!';
    window.setTimeout(() => {
      this.ctx.goto('leaderboard', { mode: this.mode, highlightScore: this.score });
    }, 500);
  }
}
