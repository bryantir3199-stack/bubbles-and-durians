import { gameConfig } from '../config/gameConfig';
import type { GameMode } from '../config/gameConfig';

/** Wind-up chattering-teeth ammo pip — bold denture silhouette. */
const TOOTH_SVG = `
  <svg class="hud-tooth-icon" viewBox="0 0 52 52" aria-hidden="true">
    <!-- upper gum -->
    <path d="M6 18c0-8 8-14 20-14s20 6 20 14v6c0 3-4 5-20 5S6 27 6 24z"
          fill="#ff6aa2" stroke="#1a1018" stroke-width="2.6" stroke-linejoin="round"/>
    <!-- upper teeth -->
    <rect x="11" y="20" width="7" height="13" rx="2.2" fill="#fffef8" stroke="#1a1018" stroke-width="2"/>
    <rect x="20" y="19" width="8" height="15" rx="2.2" fill="#fffef8" stroke="#1a1018" stroke-width="2"/>
    <rect x="30.5" y="20" width="7" height="13" rx="2.2" fill="#fffef8" stroke="#1a1018" stroke-width="2"/>
    <!-- lower gum -->
    <path d="M9 36c0 7 7 11 17 11s17-4 17-11c0-2.5-4-4-17-4S9 33.5 9 36z"
          fill="#ff4f90" stroke="#1a1018" stroke-width="2.6" stroke-linejoin="round"/>
    <!-- lower teeth -->
    <rect x="13" y="30" width="6.5" height="9" rx="2" fill="#fffef8" stroke="#1a1018" stroke-width="2"/>
    <rect x="21.5" y="29" width="7.5" height="10" rx="2" fill="#fffef8" stroke="#1a1018" stroke-width="2"/>
    <rect x="31" y="30" width="6.5" height="9" rx="2" fill="#fffef8" stroke="#1a1018" stroke-width="2"/>
    <!-- eyes -->
    <circle cx="16.5" cy="14" r="2.3" fill="#1a1018"/>
    <circle cx="31.5" cy="14" r="2.3" fill="#1a1018"/>
    <!-- smile line -->
    <path d="M17 26.5c3 1.8 11 1.8 14 0" fill="none" stroke="#c2185b" stroke-width="1.8" stroke-linecap="round"/>
    <!-- wind-up key -->
    <g transform="translate(40 4) rotate(20)">
      <circle cx="6" cy="6" r="5" fill="none" stroke="#ff2436" stroke-width="3"/>
      <circle cx="6" cy="6" r="1.8" fill="#ff2436"/>
      <path d="M6 11v8" stroke="#ff2436" stroke-width="3" stroke-linecap="round"/>
    </g>
  </svg>
`;

export class HUD {
  private root: HTMLElement;
  private scoreEl: HTMLElement;
  private livesEl: HTMLElement | null = null;
  private livesPanel: HTMLElement | null = null;
  private ammoIconsEl: HTMLElement;
  private ammoPanel: HTMLElement;
  private comboEl: HTMLElement;
  private comboMultEl: HTMLElement;
  private timerEl: HTMLElement | null = null;
  private timerMinEl: HTMLElement | null = null;
  private timerSecEl: HTMLElement | null = null;
  private reloadBtn: HTMLButtonElement;
  private reloadHint: HTMLElement;
  private onReload: () => void;
  private lastComboLevel = 1;

  constructor(parent: HTMLElement, mode: GameMode, onReload: () => void) {
    this.onReload = onReload;
    this.root = document.createElement('div');
    this.root.className = 'hud';

    const teeth = Array.from({ length: gameConfig.magazineSize }, () =>
      `<span class="hud-tooth filled">${TOOTH_SVG}</span>`,
    ).join('');

    const rightPanel =
      mode === 'timed'
        ? `
      <div class="hud-panel hud-time" aria-label="Time">
        <div class="hud-panel-base"></div>
        <div class="hud-panel-body">
          <span class="hud-panel-label">TIME</span>
          <div class="hud-time-value">
            <span class="hud-time-min">3</span>
            <span class="hud-time-sec">00</span>
          </div>
        </div>
      </div>`
        : `
      <div class="hud-panel hud-lives" aria-label="Lives">
        <div class="hud-panel-base"></div>
        <div class="hud-panel-body">
          <span class="hud-panel-label">LIVES</span>
          <div class="hud-lives-value">${this.hearts(gameConfig.startLives)}</div>
        </div>
      </div>`;

    this.root.innerHTML = `
      <div class="hud-dock">
        <div class="hud-left">
          <div class="hud-combo" aria-label="Combo" hidden>
            <span class="hud-combo-text">COMBO <span class="hud-combo-mult">2X</span></span>
          </div>
          <div class="hud-panel hud-score" aria-label="Score">
            <div class="hud-panel-base"></div>
            <div class="hud-panel-body">
              <span class="hud-panel-label">SCORE</span>
              <span class="hud-score-value">
                <span class="hud-score-num">0</span>
              </span>
            </div>
          </div>
        </div>

        <div class="hud-center">
          <div class="hud-panel hud-ammo" aria-label="Ammo">
            <div class="hud-panel-base"></div>
            <div class="hud-panel-body">
              <span class="hud-panel-label">AMMO</span>
              <div class="hud-ammo-icons">${teeth}</div>
            </div>
          </div>
          <button type="button" class="hud-reload-btn" hidden title="Reload (R / Space)">RELOAD</button>
        </div>

        <div class="hud-right">
          ${rightPanel}
        </div>
      </div>
      <div class="hud-reload-hint" hidden>RELOAD! (R / Space)</div>
      <div class="crosshair" aria-hidden="true"></div>
    `;
    parent.appendChild(this.root);

    this.scoreEl = this.root.querySelector('.hud-score-num')!;
    this.livesPanel = this.root.querySelector('.hud-lives');
    this.livesEl = this.root.querySelector('.hud-lives-value');
    this.ammoIconsEl = this.root.querySelector('.hud-ammo-icons')!;
    this.ammoPanel = this.root.querySelector('.hud-ammo')!;
    this.comboEl = this.root.querySelector('.hud-combo')!;
    this.comboMultEl = this.root.querySelector('.hud-combo-mult')!;
    this.timerEl = this.root.querySelector('.hud-time');
    this.timerMinEl = this.root.querySelector('.hud-time-min');
    this.timerSecEl = this.root.querySelector('.hud-time-sec');
    this.reloadBtn = this.root.querySelector('.hud-reload-btn')!;
    this.reloadHint = this.root.querySelector('.hud-reload-hint')!;

    if (mode === 'timed') {
      this.setTimer(gameConfig.timedSeconds);
    }

    this.reloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onReload();
    });
  }

  private hearts(lives: number): string {
    const n = Math.max(0, lives);
    if (n === 0) return '<span class="hud-heart empty">0</span>';
    return Array.from({ length: n }, () => '<span class="hud-heart">♥</span>').join('');
  }

  setScore(score: number): void {
    this.scoreEl.textContent = String(score);
  }

  setCombo(multiplier: number, progressShots = 0): void {
    const max = gameConfig.maxCombo;
    const level = Math.max(1, Math.min(max, Math.floor(multiplier)));
    const progress = Math.max(0, Math.floor(progressShots));
    const active = level > 1 || progress > 0;
    this.comboMultEl.textContent = `${level}X`;
    this.comboEl.hidden = !active;
    this.comboEl.classList.toggle('active', active);
    this.comboEl.classList.toggle('max', level >= max);
    this.comboEl.dataset.level = String(level);
    if (active && level !== this.lastComboLevel) {
      this.comboEl.classList.remove('pop');
      void this.comboEl.offsetWidth;
      this.comboEl.classList.add('pop');
    }
    this.lastComboLevel = level;
  }

  setLives(lives: number): void {
    if (!this.livesEl) return;
    this.livesEl.innerHTML = this.hearts(lives);
    this.livesPanel?.classList.toggle('critical', lives <= 1);
  }

  setAmmo(current: number, max: number, reloading: boolean): void {
    const icons = this.ammoIconsEl.querySelectorAll('.hud-tooth');
    if (icons.length !== max) {
      this.ammoIconsEl.innerHTML = Array.from({ length: max }, () =>
        `<span class="hud-tooth filled">${TOOTH_SVG}</span>`,
      ).join('');
    }
    this.ammoIconsEl.querySelectorAll('.hud-tooth').forEach((el, i) => {
      el.classList.toggle('filled', i < current);
      el.classList.toggle('empty', i >= current);
    });
    this.ammoPanel.classList.toggle('reloading', reloading);
    this.ammoPanel.classList.toggle('empty', !reloading && current === 0);
    this.ammoPanel.classList.toggle('warn', reloading);
    // Match reference art: only surface RELOAD when the mag is empty / mid-reload
    this.reloadBtn.hidden = !(reloading || current === 0);
    this.reloadHint.hidden = reloading || current !== 0;
  }

  setTimer(secondsLeft: number): void {
    if (!this.timerMinEl || !this.timerSecEl || !this.timerEl) return;
    const s = Math.max(0, Math.ceil(secondsLeft));
    const m = Math.floor(s / 60);
    const r = s % 60;
    this.timerMinEl.textContent = String(m);
    this.timerSecEl.textContent = r.toString().padStart(2, '0');
    this.timerEl.classList.toggle('critical', secondsLeft <= 10);
  }

  flashDryFire(): void {
    this.ammoPanel.classList.add('flash');
    window.setTimeout(() => this.ammoPanel.classList.remove('flash'), 250);
  }

  playShootAnim(): void {
    const ch = this.root.querySelector('.crosshair') as HTMLElement | null;
    if (ch) {
      ch.classList.remove('kick');
      void ch.offsetWidth;
      ch.classList.add('kick');
      window.setTimeout(() => ch.classList.remove('kick'), 180);
    }
  }

  spawnCrumbs(clientX: number, clientY: number): void {
    const colors = ['#e8c89a', '#d2a36a', '#c48a4a', '#f0d6b0', '#a8743c', '#fff1d6'];
    const count = 10 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const crumb = document.createElement('div');
      crumb.className = 'crumb';
      crumb.style.left = `${clientX}px`;
      crumb.style.top = `${clientY}px`;
      const size = 3 + Math.random() * 5;
      const dx = (Math.random() - 0.5) * 56;
      const dy = 28 + Math.random() * 54;
      const dur = 0.4 + Math.random() * 0.35;
      const rot = (Math.random() - 0.5) * 420;
      crumb.style.setProperty('--s', `${size.toFixed(1)}px`);
      crumb.style.setProperty('--dx', `${dx.toFixed(1)}px`);
      crumb.style.setProperty('--dy', `${dy.toFixed(1)}px`);
      crumb.style.setProperty('--dur', `${dur.toFixed(2)}s`);
      crumb.style.setProperty('--rot', `${rot.toFixed(0)}deg`);
      crumb.style.setProperty('--c', colors[Math.floor(Math.random() * colors.length)]!);
      this.root.appendChild(crumb);
      window.setTimeout(() => crumb.remove(), Math.ceil(dur * 1000) + 40);
    }
  }

  /** Soap-bubble pop burst — radial droplets + expanding ring. */
  spawnBubblePop(clientX: number, clientY: number): void {
    const colors = ['#ff4d8d', '#2ec7ff', '#ffffff', '#ff8fc4', '#5ee1ff', '#ffe566'];
    const host = document.body;

    const flash = document.createElement('div');
    flash.className = 'bubble-pop-flash';
    flash.style.left = `${clientX}px`;
    flash.style.top = `${clientY}px`;
    host.appendChild(flash);
    window.setTimeout(() => flash.remove(), 280);

    const ring = document.createElement('div');
    ring.className = 'bubble-pop-ring';
    ring.style.left = `${clientX}px`;
    ring.style.top = `${clientY}px`;
    host.appendChild(ring);
    window.setTimeout(() => ring.remove(), 480);

    const count = 16 + Math.floor(Math.random() * 8);
    for (let i = 0; i < count; i++) {
      const drop = document.createElement('div');
      drop.className = 'bubble-pop';
      drop.style.left = `${clientX}px`;
      drop.style.top = `${clientY}px`;
      const size = 10 + Math.random() * 14;
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const dist = 70 + Math.random() * 110;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const dur = 0.45 + Math.random() * 0.3;
      drop.style.setProperty('--s', `${size.toFixed(1)}px`);
      drop.style.setProperty('--dx', `${dx.toFixed(1)}px`);
      drop.style.setProperty('--dy', `${dy.toFixed(1)}px`);
      drop.style.setProperty('--dur', `${dur.toFixed(2)}s`);
      drop.style.setProperty('--c', colors[Math.floor(Math.random() * colors.length)]!);
      host.appendChild(drop);
      window.setTimeout(() => drop.remove(), Math.ceil(dur * 1000) + 40);
    }
  }

  setPointer(x: number, y: number): void {
    const ch = this.root.querySelector('.crosshair') as HTMLElement;
    ch.style.setProperty('--x', `${x}px`);
    ch.style.setProperty('--y', `${y}px`);
  }

  spawnFloater(clientX: number, clientY: number, text: string, color: string): void {
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${clientX}px`;
    el.style.top = `${clientY}px`;
    this.root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('go'));
    window.setTimeout(() => el.remove(), 750);
  }

  destroy(): void {
    this.root.remove();
  }
}
