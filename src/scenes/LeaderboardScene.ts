import type { GameMode } from '../config/gameConfig';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import {
  fetchTopScores,
  isLeaderboardConfigured,
  type ScoreRow,
} from '../services/leaderboard';
import { clearUI, panel, bindClick } from '../ui/dom';

export class LeaderboardScene implements GameScene {
  readonly id = 'leaderboard' as const;
  private mode: GameMode = 'endless';
  private listEl: HTMLElement | null = null;

  constructor(private ctx: SceneContext) {}

  enter(data?: SceneData): void {
    this.mode = data?.mode ?? 'endless';
    clearUI(this.ctx.uiRoot);

    const ui = panel(
      'menu leaderboard',
      `<div class="menu-wide">
        <h1>LEADERBOARDS</h1>
        <div class="tabs">
          <button type="button" class="tab ${this.mode === 'endless' ? 'active' : ''}" data-mode="endless">ENDLESS</button>
          <button type="button" class="tab ${this.mode === 'timed' ? 'active' : ''}" data-mode="timed">TIMED</button>
        </div>
        <div class="lb-panel">
          <div class="lb-list" id="lb-list"><p class="muted">Loading…</p></div>
        </div>
        <button type="button" class="btn muted-btn" data-action="back">BACK</button>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);
    this.listEl = ui.querySelector('#lb-list');

    ui.querySelectorAll<HTMLElement>('[data-mode]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = el.dataset.mode as GameMode;
        if (mode === this.mode) return;
        this.ctx.goto('leaderboard', { mode });
      });
    });
    bindClick(ui, '[data-action="back"]', () => this.ctx.goto('modeSelect'));

    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);

    void this.loadScores();
  }

  update(): void {}

  exit(): void {
    clearUI(this.ctx.uiRoot);
  }

  private async loadScores(): Promise<void> {
    if (!this.listEl) return;

    if (!isLeaderboardConfigured()) {
      this.listEl.innerHTML =
        '<p class="warn-text">Configure Supabase in .env<br/>to enable online leaderboards</p>';
      return;
    }

    const rows = await fetchTopScores(this.mode, 10);
    if (!this.listEl) return;

    if (rows.length === 0) {
      this.listEl.innerHTML = '<p class="muted">No scores yet — be the first!</p>';
      return;
    }
    this.renderRows(rows);
  }

  private renderRows(rows: ScoreRow[]): void {
    if (!this.listEl) return;
    const header = `<div class="lb-header"># &nbsp; NAME &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; SCORE</div>`;
    const lines = rows
      .map((row, i) => {
        const rank = `${i + 1}.`.padEnd(3, ' ');
        const name = row.player_name.padEnd(14, ' ').slice(0, 14);
        const cls = i === 0 ? 'gold' : '';
        return `<div class="lb-row ${cls}">${rank} ${name} ${row.score}</div>`;
      })
      .join('');
    this.listEl.innerHTML = header + lines;
  }
}
