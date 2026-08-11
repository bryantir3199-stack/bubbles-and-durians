import { gameConfig } from '../config/gameConfig';
import type { GameMode } from '../config/gameConfig';
import { playCountdownTickSound } from '../audio/sfx';

const TOOTH_IMG = `<img class="hud-tooth-icon" src="/assets/hud/tooth.png" alt="" draggable="false" />`;

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
  private timerSecEl: HTMLElement | null = null;
  private timerMsEl: HTMLElement | null = null;
  private reloadHint: HTMLElement;
  private lastComboLevel = 1;
  private thirtyBannerShown = false;
  private lastCountdownSec = -1;

  constructor(parent: HTMLElement, mode: GameMode, _onReload: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'hud';

    const teeth = Array.from({ length: gameConfig.magazineSize }, () =>
      `<span class="hud-tooth filled">${TOOTH_IMG}</span>`,
    ).join('');

    const rightPanel =
      mode === 'timed'
        ? `
      <div class="hud-panel hud-time" aria-label="Time">
        <span class="hud-panel-label hud-time-label">TIME</span>
        <div class="hud-time-value">
          <span class="hud-time-sec">180</span>
          <span class="hud-time-dot">.</span>
          <span class="hud-time-ms">000</span>
        </div>
      </div>`
        : `
      <div class="hud-panel hud-lives" aria-label="Lives">
        <div class="hud-lives-value">${this.hearts(gameConfig.startLives)}</div>
      </div>`;

    this.root.innerHTML = `
      <div class="hud-dock">
        <div class="hud-left">
          <div class="hud-combo" aria-label="Combo" hidden>
            <span class="hud-combo-text">COMBO <span class="hud-combo-mult">2X</span></span>
          </div>
          <div class="hud-panel hud-score" aria-label="Score">
            <span class="hud-panel-label hud-score-label">SCORE</span>
            <span class="hud-score-num">0</span>
          </div>
        </div>

        <div class="hud-center">
          <div class="hud-panel hud-ammo" aria-label="Ammo">
            <span class="hud-panel-label hud-ammo-label">AMMO</span>
            <div class="hud-ammo-icons">${teeth}</div>
          </div>
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
    this.timerSecEl = this.root.querySelector('.hud-time-sec');
    this.timerMsEl = this.root.querySelector('.hud-time-ms');
    this.reloadHint = this.root.querySelector('.hud-reload-hint')!;

    if (mode === 'timed') {
      this.setTimer(gameConfig.timedSeconds);
    }
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
    let icons = this.ammoIconsEl.querySelectorAll('.hud-tooth');
    if (icons.length !== max) {
      this.ammoIconsEl.innerHTML = Array.from({ length: max }, () =>
        `<span class="hud-tooth filled">${TOOTH_IMG}</span>`,
      ).join('');
      icons = this.ammoIconsEl.querySelectorAll('.hud-tooth');
    }

    icons.forEach((el, i) => {
      const nowFilled = i < current;
      const wasEmpty = el.classList.contains('empty');
      el.classList.toggle('filled', nowFilled);
      el.classList.toggle('empty', !nowFilled);
      // Pop in only when a previously-empty pip fills (reload animation)
      if (nowFilled && wasEmpty) {
        el.classList.remove('pop-in');
        void (el as HTMLElement).offsetWidth;
        el.classList.add('pop-in');
      }
    });

    this.ammoPanel.classList.toggle('reloading', reloading);
    // Keep ammo panel visually stable — no layout-shifting empty/warn styles
    this.ammoPanel.classList.remove('empty', 'warn');
    // Center hint only when dry (not while refill animation is running)
    this.reloadHint.hidden = reloading || current !== 0;
  }

  setTimer(secondsLeft: number): void {
    if (!this.timerSecEl || !this.timerMsEl || !this.timerEl) return;
    const totalMs = Math.max(0, Math.ceil(secondsLeft * 1000));
    const s = Math.floor(totalMs / 1000);
    const ms = totalMs % 1000;
    this.timerSecEl.textContent = String(s);
    this.timerMsEl.textContent = ms.toString().padStart(3, '0');
    this.timerEl.classList.toggle('critical', secondsLeft <= 10);
    if (!this.thirtyBannerShown && secondsLeft <= 30) {
      this.thirtyBannerShown = true;
      this.showThirtySecondsBanner();
    }
    if (s >= 1 && s <= 10 && s !== this.lastCountdownSec) {
      this.lastCountdownSec = s;
      this.showCountdownBeat(s);
    }
  }

  /** One-shot marquee when timed mode hits the final 30 seconds. */
  private showThirtySecondsBanner(): void {
    const el = document.createElement('div');
    el.className = 'hud-announce hud-thirty-banner';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = '30s Remains';
    this.root.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  /** Center pop for each whole second in the final 10. */
  private showCountdownBeat(sec: number): void {
    playCountdownTickSound();
    const el = document.createElement('div');
    el.className = 'hud-announce hud-countdown';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = String(sec);
    this.root.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
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
    const count = 14 + Math.floor(Math.random() * 8);
    for (let i = 0; i < count; i++) {
      const crumb = document.createElement('div');
      crumb.className = 'crumb';
      crumb.style.left = `${clientX}px`;
      crumb.style.top = `${clientY}px`;
      const size = 10 + Math.random() * 16;
      const dx = (Math.random() - 0.5) * 200;
      const dy = 50 + Math.random() * 160;
      const dur = 0.55 + Math.random() * 0.5;
      const rot = (Math.random() - 0.5) * 520;
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
