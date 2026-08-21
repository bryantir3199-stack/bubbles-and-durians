import { fetchHighScore } from '../services/leaderboard';

export function highScoreBannerHtml(): string {
  return `<p class="high-score-banner" hidden><strong class="high-score-label">HIGH SCORE:</strong> <span class="high-score-name"></span> <span class="high-score-value"></span></p>`;
}

export function bindHighScoreBanner(root: ParentNode): void {
  const banner = root.querySelector<HTMLElement>('.high-score-banner');
  if (!banner) return;

  void fetchHighScore().then((row) => {
    if (!row || !banner.isConnected) return;
    const name = banner.querySelector('.high-score-name');
    const value = banner.querySelector('.high-score-value');
    if (name) name.textContent = row.player_name;
    if (value) value.textContent = row.score.toLocaleString('en-US');
    banner.setAttribute('aria-label', `High score ${row.score.toLocaleString('en-US')} by ${row.player_name}`);
    banner.hidden = false;
  });
}
