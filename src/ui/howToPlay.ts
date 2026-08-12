/** Shared How to Play copy for the main-menu help modal. */

export const HOW_TO_PLAY_HTML = `
  <div class="howto-modal" role="dialog" aria-modal="true" aria-labelledby="howto-title">
    <div class="howto-card menu-card">
      <button type="button" class="howto-close" data-action="howto-close" aria-label="Close">×</button>
      <h1 id="howto-title">How to Play</h1>
      <p class="howto-lead">Shoot green. Skip bubbles. Reload.</p>
      <ul class="howto-list">
        <li><strong>Aim &amp; shoot</strong> — click or tap targets</li>
        <li><strong>Green durians</strong> — +1 point (chain hits for combo)</li>
        <li><strong>Gold durians</strong> — 4 hits, +7 points</li>
        <li><strong>Bubbles</strong> — skip them (−10 if shot; Endless also −1 life)</li>
        <li><strong>Reload</strong> — press <kbd>R</kbd> or <kbd>Space</kbd> (7 ammo)</li>
        <li><strong>Hearts</strong> — Endless only; +1 life (max 5)</li>
      </ul>
      <p class="howto-modes muted">
        <strong>Timed</strong> — 3 minutes, score only.<br />
        <strong>Endless</strong> — 3 lives; escapes cost a life.
      </p>
      <button type="button" class="btn primary" data-action="howto-close">GOT IT</button>
    </div>
  </div>
`;
