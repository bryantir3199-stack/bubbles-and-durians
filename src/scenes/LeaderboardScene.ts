import type { GameMode } from '../config/gameConfig';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import {
  fetchScoreRank,
  fetchTopScores,
  isLeaderboardConfigured,
  type ScoreRow,
} from '../services/leaderboard';
import { clearUI, panel, bindClick } from '../ui/dom';

export class LeaderboardScene implements GameScene {
  readonly id = 'leaderboard' as const;
  private mode: GameMode = 'endless';
  private runScore: number | undefined;
  private highlightScore: number | undefined;
  private playerName: string | undefined;
  private listEl: HTMLElement | null = null;
  private runEl: HTMLElement | null = null;

  constructor(private ctx: SceneContext) {}

  enter(data?: SceneData): void {
    this.mode = data?.mode ?? 'endless';
    this.runScore = data?.score;
    this.highlightScore = data?.highlightScore;
    this.playerName = data?.playerName;
    clearUI(this.ctx.uiRoot);

    const ui = panel(
      'menu leaderboard',
      `<div class="menu-wide">
        <h1>LEADERBOARDS</h1>
        <div class="lb-run" id="lb-run" hidden></div>
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
    this.runEl = ui.querySelector('#lb-run');
    this.renderRunBanner(null);

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

  private renderRunBanner(rank: number | null): void {
    if (!this.runEl || this.runScore == null) return;
    const score = this.runScore.toLocaleString('en-US');
    let detail: string;
    if (this.highlightScore == null) {
      detail = 'not submitted';
    } else if (rank != null) {
      detail = `rank #${rank}`;
    } else {
      detail = '…';
    }
    this.runEl.innerHTML =
      `<p class="lb-run-label">YOUR RUN</p>` +
      `<p class="lb-run-line"><span class="lb-run-score">${score}</span>` +
      `<span class="lb-run-detail">${detail}</span></p>`;
    this.runEl.hidden = false;
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

    const highlightIndex = this.findHighlightIndex(rows);
    let rank: number | null = highlightIndex >= 0 ? highlightIndex + 1 : null;
    if (rank == null && this.highlightScore != null) {
      rank = await fetchScoreRank(this.mode, this.highlightScore);
      if (!this.listEl) return;
    }
    this.renderRunBanner(rank);

    if (rows.length === 0 && highlightIndex < 0 && this.highlightScore == null) {
      this.listEl.innerHTML = '<p class="muted">No scores yet — be the first!</p>';
      return;
    }
    this.renderRows(rows, highlightIndex, rank);
  }

  private findHighlightIndex(rows: ScoreRow[]): number {
    if (this.highlightScore == null) return -1;
    const score = this.highlightScore;
    const name = this.playerName;
    if (name) {
      const named = rows.findIndex((row) => row.score === score && row.player_name === name);
      if (named >= 0) return named;
    }
    return rows.findIndex((row) => row.score === score);
  }

  private renderRows(rows: ScoreRow[], highlightIndex: number, rank: number | null): void {
    if (!this.listEl) return;
    const header = `<div class="lb-header"><span>#</span><span>NAME</span><span>SCORE</span><span></span></div>`;
    const lines = rows
      .map((row, i) => this.rowHtml(i + 1, row.player_name, row.score, i === 0, i === highlightIndex))
      .join('');

    let extra = '';
    if (this.highlightScore != null && highlightIndex < 0) {
      extra =
        (rows.length > 0 ? `<div class="lb-gap">· · ·</div>` : '') +
        this.rowHtml(
          rank ?? '—',
          this.playerName || 'You',
          this.highlightScore,
          false,
          true,
        );
    }

    this.listEl.innerHTML = header + lines + extra;
  }

  private rowHtml(
    rank: number | string,
    name: string,
    score: number,
    gold: boolean,
    yours: boolean,
  ): string {
    const rankLabel = typeof rank === 'number' ? `${rank}.` : `${rank}`;
    const cls = ['lb-row', gold ? 'gold' : '', yours ? 'yours' : ''].filter(Boolean).join(' ');
    const you = yours ? '<span class="lb-you">YOU</span>' : '<span class="lb-you"></span>';
    return (
      `<div class="${cls}">` +
      `<span class="lb-rank">${rankLabel}</span>` +
      `<span class="lb-name">${escapeHtml(name)}</span>` +
      `<span class="lb-score">${score.toLocaleString('en-US')}</span>` +
      you +
      `</div>`
    );
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
