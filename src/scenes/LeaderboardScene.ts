import type { RankedMode } from '../config/gameConfig';
import { toRankedMode } from '../config/gameConfig';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import {
  fetchScoreRank,
  fetchTopScores,
  isLeaderboardConfigured,
  type ScoreRow,
} from '../services/leaderboard';
import { clearUI, panel, bindClick, flashThen } from '../ui/dom';
import { fadeFromOverlay, fadeToBlackAndHold } from '../ui/screenFade';
import { hideResultsCrash } from '../ui/resultsCrash';

const BOARDS: { id: RankedMode; label: string }[] = [
  { id: 'endless', label: 'ENDLESS' },
  { id: 'timed-short', label: 'SHORT · 90s' },
  { id: 'timed-medium', label: 'MEDIUM · 3 MIN' },
];

export class LeaderboardScene implements GameScene {
  readonly id = 'leaderboard' as const;
  private board: RankedMode = 'endless';
  private runBoard: RankedMode | undefined;
  private runScore: number | undefined;
  private highlightScore: number | undefined;
  private playerName: string | undefined;
  private listEl: HTMLElement | null = null;
  private runEl: HTMLElement | null = null;
  private leaving = false;
  private flashTimer = 0;

  constructor(private ctx: SceneContext) {}

  enter(data?: SceneData): void {
    this.leaving = false;
    this.flashTimer = 0;
    const fromRun = data?.score != null || data?.highlightScore != null;
    if (fromRun) {
      this.runScore = data?.score;
      this.highlightScore = data?.highlightScore;
      this.playerName = data?.playerName;
      this.runBoard =
        data?.rankedMode ?? toRankedMode(data?.mode ?? 'endless', data?.timedPreset) ?? 'endless';
    } else if (data?.rankedMode == null) {
      this.runScore = undefined;
      this.highlightScore = undefined;
      this.playerName = undefined;
      this.runBoard = undefined;
    }

    this.board =
      data?.rankedMode ?? toRankedMode(data?.mode ?? 'endless', data?.timedPreset) ?? 'endless';
    clearUI(this.ctx.uiRoot);

    const tabs = BOARDS.map(
      (tab) =>
        `<button type="button" class="tab ${this.board === tab.id ? 'active' : ''}" data-board="${tab.id}">${tab.label}</button>`,
    ).join('');

    const ui = panel(
      'menu leaderboard',
      `<div class="menu-wide">
        <h1>LEADERBOARDS</h1>
        <div class="lb-run" id="lb-run" hidden></div>
        <div class="tabs">${tabs}</div>
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

    ui.querySelectorAll<HTMLElement>('[data-board]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const board = el.dataset.board as RankedMode;
        if (board === this.board) return;
        this.ctx.goto('leaderboard', { rankedMode: board });
      });
    });
    bindClick(ui, '[data-action="back"]', () => {
      if (this.leaving) return;
      const back = ui.querySelector<HTMLElement>('[data-action="back"]');
      if (!back) return;
      this.leaving = true;
      this.flashTimer = flashThen(back, () => {
        this.flashTimer = 0;
        if (this.runScore == null) {
          this.ctx.goto('modeSelect');
          return;
        }
        void fadeToBlackAndHold().then(() => {
          hideResultsCrash();
          this.ctx.goto('modeSelect');
          return fadeFromOverlay();
        });
      });
    });

    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);

    void this.loadScores();
  }

  update(): void {}

  exit(): void {
    window.clearTimeout(this.flashTimer);
    this.flashTimer = 0;
    clearUI(this.ctx.uiRoot);
  }

  private showingRun(): boolean {
    return this.runScore != null && this.runBoard === this.board;
  }

  private renderRunBanner(rank: number | null): void {
    if (!this.runEl) return;
    if (!this.showingRun() || this.runScore == null) {
      this.runEl.hidden = true;
      return;
    }
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

    const rows = await fetchTopScores(this.board, 10);
    if (!this.listEl) return;

    const highlightOnBoard = this.showingRun() && this.highlightScore != null;
    const highlightIndex = highlightOnBoard ? this.findHighlightIndex(rows) : -1;
    let rank: number | null = highlightIndex >= 0 ? highlightIndex + 1 : null;
    if (rank == null && highlightOnBoard && this.highlightScore != null) {
      rank = await fetchScoreRank(this.board, this.highlightScore);
      if (!this.listEl) return;
    }
    this.renderRunBanner(rank);

    if (rows.length === 0 && highlightIndex < 0) {
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
    if (this.showingRun() && this.highlightScore != null && highlightIndex < 0) {
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
