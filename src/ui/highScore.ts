import type { RankedMode } from '../config/gameConfig';
import { fetchModeHighScores, type ModeHighScores, type ScoreRow } from '../services/leaderboard';

const HOLD_MS = 3000;
const FADE_MS = 140;

const MODE_CYCLE: { id: RankedMode; label: string }[] = [
  { id: 'endless', label: 'ENDLESS' },
  { id: 'timed-short', label: 'BLITZ' },
  { id: 'timed-medium', label: 'STANDARD' },
];

export function highScoreBannerHtml(): string {
  return `<p class="high-score-banner high-score-rotator" hidden><span class="high-score-mode"></span> <strong class="high-score-label">HIGH SCORE:</strong> <span class="high-score-name"></span> <span class="high-score-value"></span></p>`;
}

function paintRotator(el: HTMLElement, label: string, row: ScoreRow | null): void {
  const modeEl = el.querySelector('.high-score-mode');
  const nameEl = el.querySelector('.high-score-name');
  const valueEl = el.querySelector('.high-score-value');
  if (modeEl) modeEl.textContent = label;
  if (row) {
    const formatted = row.score.toLocaleString('en-US');
    if (nameEl) nameEl.textContent = row.player_name;
    if (valueEl) valueEl.textContent = formatted;
    el.setAttribute('aria-label', `${label} high score ${formatted} by ${row.player_name}`);
  } else {
    if (nameEl) nameEl.textContent = '';
    if (valueEl) valueEl.textContent = '---';
    el.setAttribute('aria-label', `${label} high score unavailable`);
  }
  el.hidden = false;
}

export function bindHighScoreBanner(root: ParentNode): () => void {
  const els = [
    ...root.querySelectorAll<HTMLElement>('.high-score-rotator'),
  ];
  if (els.length === 0) return () => {};

  let stopped = false;
  let holdTimer = 0;
  let fadeTimer = 0;
  let index = 0;
  let scores: ModeHighScores | null = null;

  const paint = (idx: number) => {
    if (!scores) return;
    const spec = MODE_CYCLE[idx];
    for (const el of els) {
      if (!el.isConnected) continue;
      paintRotator(el, spec.label, scores[spec.id]);
    }
  };

  const advance = () => {
    if (stopped) return;
    index = (index + 1) % MODE_CYCLE.length;
    for (const el of els) el.classList.add('is-swap');
    fadeTimer = window.setTimeout(() => {
      if (stopped) return;
      paint(index);
      for (const el of els) el.classList.remove('is-swap');
      holdTimer = window.setTimeout(advance, HOLD_MS);
    }, FADE_MS);
  };

  void fetchModeHighScores().then((result) => {
    if (stopped) return;
    scores = result;
    paint(0);
    holdTimer = window.setTimeout(advance, HOLD_MS);
  });

  return () => {
    stopped = true;
    window.clearTimeout(holdTimer);
    window.clearTimeout(fadeTimer);
  };
}
