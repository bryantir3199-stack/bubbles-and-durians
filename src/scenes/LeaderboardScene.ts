import type { RankedMode } from '../config/gameConfig';
import { toRankedMode } from '../config/gameConfig';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import { rankingPreviewPlace, wantsRankingPreview } from '../debug/pathDebug';
import {
  fetchScoreRank,
  fetchTopScores,
  isLeaderboardConfigured,
  RANKING_DISPLAY_COUNT,
  RANKING_STORE_CAP,
  RANKING_WINDOW,
  type ScoreRow,
} from '../services/leaderboard';
import { clearUI, panel, bindClick, flashThen } from '../ui/dom';
import { holdResultsCrash, hideResultsCrash, isResultsCrashHeld } from '../ui/resultsCrash';
import { fadeFromOverlay, fadeToBlackAndHold } from '../ui/screenFade';

const BOARDS: { id: RankedMode; label: string }[] = [
  { id: 'endless', label: 'ENDLESS' },
  { id: 'timed-short', label: 'BLITZ' },
  { id: 'timed-medium', label: 'STANDARD' },
];

const INTRO_MS = 3900;
const BOTTOM_SHIFT = '-100cqh';

export class LeaderboardScene implements GameScene {
  readonly id = 'leaderboard' as const;
  private board: RankedMode = 'endless';
  private runBoard: RankedMode | undefined;
  private runScore: number | undefined;
  private highlightScore: number | undefined;
  private playerName: string | undefined;
  private trackEl: HTMLElement | null = null;
  private viewportEl: HTMLElement | null = null;
  private outEl: HTMLElement | null = null;
  private moreEl: HTMLButtonElement | null = null;
  private boardEl: HTMLElement | null = null;
  private rows: ScoreRow[] = [];
  private highlightIndex = -1;
  private rank: number | null = null;
  private expanded = false;
  private leaving = false;
  private flashTimer = 0;
  private introTimer = 0;
  private introGen = 0;

  constructor(private ctx: SceneContext) {}

  enter(data?: SceneData): void {
    this.leaving = false;
    this.flashTimer = 0;
    this.expanded = false;
    this.rows = [];
    this.highlightIndex = -1;
    this.rank = null;
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
    document.body.classList.add('ranking-on');
    if (!isResultsCrashHeld()) holdResultsCrash();

    const tabs = BOARDS.map(
      (tab) =>
        `<button type="button" class="tab ${this.board === tab.id ? 'active' : ''}" data-board="${tab.id}">${tab.label}</button>`,
    ).join('');

    const ui = panel(
      'menu leaderboard',
      `<div class="ranking-board">
        <h1>RANKING</h1>
        <div class="tabs">${tabs}</div>
        <div class="lb-panel">
          <div class="lb-header">
            <span class="lb-left">
              <span class="lb-medal-slot" aria-hidden="true"></span>
              <span class="lb-rank" aria-label="RANK"><span class="lb-rank-label" aria-hidden="true">RAN<span class="lb-rank-k">K</span></span></span>
            </span>
            <span class="lb-name">NAME</span>
            <span class="lb-score">SCORE</span>
          </div>
          <div class="lb-viewport">
            <div class="lb-track" id="lb-list"><p class="muted">Loading\u2026</p></div>
          </div>
          <div class="lb-out" id="lb-out" hidden></div>
        </div>
        <div class="btn-row lb-actions">
          <button type="button" class="btn primary lb-more" data-action="more">SEE ALL</button>
          <button type="button" class="btn" data-action="back">BACK TO MAIN MENU</button>
        </div>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);
    this.boardEl = ui.querySelector('.ranking-board');
    this.viewportEl = ui.querySelector('.lb-viewport');
    this.trackEl = ui.querySelector('#lb-list');
    this.outEl = ui.querySelector('#lb-out');
    this.moreEl = ui.querySelector('[data-action="more"]');

    ui.querySelectorAll<HTMLElement>('[data-board]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const board = el.dataset.board as RankedMode;
        if (board === this.board) return;
        this.board = board;
        this.expanded = false;
        ui.querySelectorAll<HTMLElement>('[data-board]').forEach((tab) => {
          tab.classList.toggle('active', tab.dataset.board === board);
        });
        void this.loadScores();
      });
    });
    bindClick(ui, '[data-action="more"]', () => {
      this.expanded = !this.expanded;
      this.renderList();
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
    this.stopIntro();
    window.clearTimeout(this.flashTimer);
    this.flashTimer = 0;
    document.body.classList.remove('ranking-on');
    this.trackEl = null;
    this.viewportEl = null;
    this.outEl = null;
    this.moreEl = null;
    this.boardEl = null;
    clearUI(this.ctx.uiRoot);
  }

  private showingRun(): boolean {
    return this.runScore != null && this.runBoard === this.board;
  }

  private async loadScores(): Promise<void> {
    if (!this.trackEl) return;
    this.stopIntro();
    this.rows = [];
    this.highlightIndex = -1;
    this.rank = null;
    this.trackEl.innerHTML = '<p class="muted">Loading\u2026</p>';
    this.hideOutRow();
    this.syncMoreButton();

    if (wantsRankingPreview()) {
      this.rows = demoRanking(this.board);
      const place = rankingPreviewPlace();
      if (place != null) {
        this.runScore = this.rows[Math.min(place, this.rows.length) - 1]?.score ?? 0;
        this.runBoard = this.board;
        this.playerName = this.playerName ?? 'YOU';
        this.highlightScore = this.runScore;
        this.highlightIndex = place <= this.rows.length ? place - 1 : -1;
        this.rank = place;
      }
      this.renderList();
      return;
    }

    if (!isLeaderboardConfigured()) {
      this.trackEl.innerHTML =
        '<p class="warn-text">Configure Supabase in .env<br/>to enable online rankings</p>';
      return;
    }

    const rows = await fetchTopScores(this.board, RANKING_STORE_CAP);
    if (!this.trackEl) return;
    this.rows = rows;

    const highlightOnBoard = this.showingRun() && this.highlightScore != null;
    this.highlightIndex = highlightOnBoard ? this.findHighlightIndex(rows) : -1;
    let rank: number | null = this.highlightIndex >= 0 ? this.highlightIndex + 1 : null;
    if (rank == null && highlightOnBoard && this.highlightScore != null) {
      rank = await fetchScoreRank(this.board, this.highlightScore);
      if (!this.trackEl) return;
    }
    this.rank = rank;
    this.renderList();
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

  private renderList(): void {
    if (!this.trackEl) return;
    this.stopIntro();
    this.boardEl?.classList.toggle('is-expanded', this.expanded);
    this.boardEl?.classList.remove('is-manual');
    this.syncMoreButton();
    this.hideOutRow();

    const compact = !this.expanded;
    const visible = compact ? this.rows.slice(0, RANKING_DISPLAY_COUNT) : this.rows;
    const lines = visible
      .map((row, i) =>
        this.rowHtml(i + 1, row.player_name, row.score, i === this.highlightIndex),
      )
      .join('');

    let extras = '';
    if (compact) {
      for (let rank = visible.length + 1; rank <= RANKING_DISPLAY_COUNT; rank++) {
        extras += this.rowHtml(rank, '---', null, false, true);
      }
    }

    this.trackEl.innerHTML = lines + extras;
    this.trackEl.scrollTop = 0;
    this.trackEl.style.transform = '';
    this.trackEl.classList.remove('intro-up', 'intro-down');
    if (this.viewportEl) this.viewportEl.scrollTop = 0;

    if (this.expanded) {
      if (this.highlightIndex >= 0) {
        requestAnimationFrame(() => {
          this.trackEl?.querySelector('.lb-row.yours')?.scrollIntoView({ block: 'center' });
        });
      }
      return;
    }

    if (wantsRankingPreview() && rankingPreviewPlace() == null) {
      this.enableManualScroll(false);
      return;
    }

    this.playIntro();
  }

  private playIntro(): void {
    const track = this.trackEl;
    if (!track) return;

    const rank = this.showingRun() ? this.rank : null;
    const scrollDown = rank != null && rank > RANKING_WINDOW;
    const showOut = rank != null && rank > RANKING_DISPLAY_COUNT;
    const start = scrollDown ? '0' : BOTTOM_SHIFT;
    const gen = ++this.introGen;
    const cls = scrollDown ? 'intro-down' : 'intro-up';

    const finish = (): void => {
      if (this.introGen !== gen) return;
      this.enableManualScroll(scrollDown);
      if (showOut) this.showOutRow();
    };

    track.style.transform = `translateY(${start})`;
    void track.offsetHeight;
    track.classList.add(cls);
    this.introTimer = window.setTimeout(finish, INTRO_MS + 80);
  }

  private enableManualScroll(scrolledDown: boolean): void {
    const track = this.trackEl;
    const viewport = this.viewportEl;
    if (!track || !viewport) return;
    track.classList.remove('intro-up', 'intro-down');
    track.style.transform = '';
    this.boardEl?.classList.add('is-manual');
    viewport.scrollTop = scrolledDown ? viewport.clientHeight : 0;
  }

  private stopIntro(): void {
    this.introGen++;
    window.clearTimeout(this.introTimer);
    this.introTimer = 0;
    this.trackEl?.classList.remove('intro-up', 'intro-down', 'is-jump');
  }

  private showOutRow(): void {
    if (!this.outEl || this.rank == null || this.runScore == null) return;
    this.outEl.innerHTML = this.rowInner(
      this.rank,
      this.playerName || 'You',
      this.runScore,
    );
    this.outEl.hidden = false;
  }

  private hideOutRow(): void {
    if (!this.outEl) return;
    this.outEl.hidden = true;
    this.outEl.innerHTML = '';
  }

  private syncMoreButton(): void {
    if (!this.moreEl) return;
    this.moreEl.hidden = false;
    this.moreEl.textContent = this.expanded ? 'TOP 10' : 'SEE ALL';
    this.moreEl.setAttribute('aria-expanded', this.expanded ? 'true' : 'false');
  }

  private rowHtml(
    rank: number,
    name: string,
    score: number | null,
    yours: boolean,
    empty = false,
  ): string {
    const medal = rank <= 3 && !empty ? ` rank-${rank}` : '';
    const cls = ['lb-row', medal, yours ? 'yours' : '', empty ? 'empty' : '']
      .filter(Boolean)
      .join(' ');
    return `<div class="${cls}">${this.rowInner(rank, empty ? name : name, score, empty)}</div>`;
  }

  private rowInner(rank: number, name: string, score: number | null, empty = false): string {
    const scoreText = empty || score == null ? '------' : score.toLocaleString('en-US');
    const nameText = empty ? name : escapeHtml(name);
    const medalClass = !empty && rank <= 3 ? 'lb-medal' : 'lb-medal is-empty';
    const place = ordinalParts(rank);
    return (
      `<span class="lb-left">` +
      `<span class="lb-medal-slot"><span class="${medalClass}" aria-hidden="true"></span></span>` +
      `<span class="lb-rank"><span class="lb-rank-num">${place.n}</span><span class="lb-rank-suffix">${place.suf}</span></span>` +
      `</span>` +
      `<span class="lb-name">${nameText}</span>` +
      `<span class="lb-score">${scoreText}</span>`
    );
  }
}

function demoRanking(mode: RankedMode): ScoreRow[] {
  const names = ['ACE', 'BOB', 'CAT', 'DOT', 'EVE', 'FAY', 'GUS', 'HAL', 'IDA', 'JAY'];
  return Array.from({ length: RANKING_STORE_CAP }, (_, i) => ({
    id: `demo-${mode}-${i}`,
    player_name: names[i % names.length] ?? 'ZZZ',
    score: Math.max(100, 250000 - i * 2417),
    mode,
    created_at: new Date(Date.now() - i * 86400000).toISOString(),
  }));
}

function ordinalParts(n: number): { n: string; suf: string } {
  const v = n % 100;
  let suf = 'TH';
  if (v < 11 || v > 13) {
    if (n % 10 === 1) suf = 'ST';
    else if (n % 10 === 2) suf = 'ND';
    else if (n % 10 === 3) suf = 'RD';
  }
  return { n: String(n), suf };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
