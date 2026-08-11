import { gameConfig } from '../config/gameConfig';
import type { GameMode } from '../config/gameConfig';

const TOOTH_SVG = `
  <svg class="hud-tooth-icon" viewBox="0 0 40 40" aria-hidden="true">
    <ellipse cx="20" cy="22" rx="14" ry="12" fill="#ff7eb6" stroke="#2a1018" stroke-width="2.2"/>
    <path d="M8 18c2-6 6-9 12-9s10 3 12 9" fill="#ff9ec8" stroke="#2a1018" stroke-width="2"/>
    <path d="M11 20v10c0 2.2 1.6 3.4 3.2 2.6 1.4-.7 2.2-2.4 2.2-4.2V19.2
             M17.5 19.2v11c0 2 1.4 3.2 2.6 2.4 1.2-.8 2-2.4 2-4.2V19
             M23.5 19v11.2c0 2 1.5 3.2 2.8 2.4 1.2-.8 2-2.5 2-4.4V20"
          fill="#fffdf8" stroke="#2a1018" stroke-width="1.7" stroke-linejoin="round"/>
    <circle cx="14.5" cy="15.5" r="1.6" fill="#2a1018"/>
    <circle cx="25.5" cy="15.5" r="1.6" fill="#2a1018"/>
    <path d="M15 26c2.2 2.4 7.8 2.4 10 0" fill="none" stroke="#c2185b" stroke-width="1.8" stroke-linecap="round"/>
    <g transform="translate(28,8) rotate(28)">
      <rect x="0" y="0" width="5" height="10" rx="1.5" fill="#ff3b4a" stroke="#2a1018" stroke-width="1.4"/>
      <path d="M2.5 10v6" stroke="#ff3b4a" stroke-width="2.2" stroke-linecap="round"/>
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
  private reloadHint: HTMLElement;
  private onReload: () => void;

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
          <button type="button" class="hud-reload-btn" title="Reload (R / Space)">RELOAD</button>
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
    this.reloadHint = this.root.querySelector('.hud-reload-hint')!;

    if (mode === 'timed') {
      this.setTimer(gameConfig.timedSeconds);
    }

    this.root.querySelector('.hud-reload-btn')!.addEventListener('click', (e) => {
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

  private lastComboLevel = 1;

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
    // Rebuild icon row if magazine size ever differs from rendered count
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
    this.ammoPanel.classList.remove('warn');
    if (reloading) {
      this.ammoPanel.classList.add('warn');
      this.reloadHint.hidden = true;
    } else {
      this.reloadHint.hidden = current !== 0;
    }
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

  /** Crosshair shrink kick at the aim point. */
  playShootAnim(): void {
    const ch = this.root.querySelector('.crosshair') as HTMLElement | null;
    if (ch) {
      ch.classList.remove('kick');
      void ch.offsetWidth;
      ch.classList.add('kick');
      window.setTimeout(() => ch.classList.remove('kick'), 180);
    }
  }

  /** Food-crumb burst — only for successful durian hits. */
  spawnCrumbs(clientX: number, clientY: number): void {
    const colors = ['#e8c89a', '#d2a36a', '#c48a4a', '#f0d6b0', '#a8743c', '#fff1d6'];
    const count = 10 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const crumb = document.createElement('div');
      crumb.className = 'crumb';
      crumb.style.left = `${clientX}px`;
      crumb.style.top = `${clientY}px`;
      const size = 8 + Math.random() * 12;
      const dx = (Math.random() - 0.5) * 140;
      const dy = 55 + Math.random() * 120;
      const dur = 0.5 + Math.random() * 0.45;
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
    // High-contrast colors so the burst reads against the sky
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
