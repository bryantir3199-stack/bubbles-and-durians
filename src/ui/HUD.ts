import { gameConfig } from '../config/gameConfig';
import type { GameMode } from '../config/gameConfig';

export class HUD {
  private root: HTMLElement;
  private scoreEl: HTMLElement;
  private livesEl: HTMLElement;
  private ammoEl: HTMLElement;
  private comboEl: HTMLElement;
  private comboMultEl: HTMLElement;
  private comboFillEl: HTMLElement;
  private timerEl: HTMLElement | null = null;
  private reloadHint: HTMLElement;
  private onReload: () => void;

  constructor(parent: HTMLElement, mode: GameMode, onReload: () => void) {
    this.onReload = onReload;
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-bar">
        <span class="hud-score">Score: 0</span>
        <span class="hud-lives">${this.livesLabel(gameConfig.startLives)}</span>
        <span class="hud-ammo">Ammo: ${gameConfig.magazineSize}/${gameConfig.magazineSize}</span>
        ${mode === 'timed' ? `<span class="hud-timer">${this.formatTime(gameConfig.timedSeconds)}</span>` : ''}
        <div class="hud-combo" aria-label="Combo meter">
          <span class="hud-combo-label">Combo</span>
          <div class="hud-combo-track">
            <div class="hud-combo-fill" style="width: 0%"></div>
          </div>
          <span class="hud-combo-mult">x1</span>
        </div>
        <button type="button" class="hud-reload-btn">RELOAD</button>
      </div>
      <div class="hud-reload-hint" hidden>RELOAD! (R / Space)</div>
      <div class="crosshair" aria-hidden="true"></div>
    `;
    parent.appendChild(this.root);

    this.scoreEl = this.root.querySelector('.hud-score')!;
    this.livesEl = this.root.querySelector('.hud-lives')!;
    this.ammoEl = this.root.querySelector('.hud-ammo')!;
    this.comboEl = this.root.querySelector('.hud-combo')!;
    this.comboMultEl = this.root.querySelector('.hud-combo-mult')!;
    this.comboFillEl = this.root.querySelector('.hud-combo-fill')!;
    this.timerEl = this.root.querySelector('.hud-timer');
    this.reloadHint = this.root.querySelector('.hud-reload-hint')!;

    this.root.querySelector('.hud-reload-btn')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onReload();
    });
  }

  private livesLabel(lives: number): string {
    return `Lives: ${'♥'.repeat(Math.max(0, lives))}${lives === 0 ? '0' : ''}`;
  }

  private formatTime(seconds: number): string {
    const s = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `Time: ${m}:${r.toString().padStart(2, '0')}`;
  }

  setScore(score: number): void {
    this.scoreEl.textContent = `Score: ${score}`;
  }

  setCombo(multiplier: number, progressShots = 0): void {
    const max = gameConfig.maxCombo;
    const perLevel = gameConfig.shotsPerComboLevel;
    const level = Math.max(1, Math.min(max, Math.floor(multiplier)));
    const progress = Math.max(0, Math.min(perLevel, Math.floor(progressShots)));
    this.comboMultEl.textContent = `x${level}`;
    // Fill shows progress toward the next combo level (full when maxed)
    const fillPct = level >= max ? 100 : (progress / perLevel) * 100;
    this.comboFillEl.style.width = `${fillPct}%`;
    this.comboEl.classList.toggle('active', level > 1 || progress > 0);
    this.comboEl.classList.toggle('max', level >= max);
    this.comboEl.dataset.level = String(level);
  }

  setLives(lives: number): void {
    this.livesEl.textContent = this.livesLabel(lives);
  }

  setAmmo(current: number, max: number, reloading: boolean): void {
    if (reloading) {
      this.ammoEl.textContent = 'Ammo: Reloading…';
      this.ammoEl.classList.add('warn');
      this.reloadHint.hidden = true;
    } else {
      this.ammoEl.textContent = `Ammo: ${current}/${max}`;
      this.ammoEl.classList.toggle('empty', current === 0);
      this.ammoEl.classList.remove('warn');
      this.reloadHint.hidden = current !== 0;
    }
  }

  setTimer(secondsLeft: number): void {
    if (!this.timerEl) return;
    this.timerEl.textContent = this.formatTime(secondsLeft);
    this.timerEl.classList.toggle('critical', secondsLeft <= 10);
  }

  flashDryFire(): void {
    this.ammoEl.classList.add('flash');
    window.setTimeout(() => this.ammoEl.classList.remove('flash'), 250);
  }

  /** Crosshair shrink kick + food-crumb burst at the aim point. */
  playShootAnim(clientX: number, clientY: number): void {
    const ch = this.root.querySelector('.crosshair') as HTMLElement | null;
    if (ch) {
      ch.classList.remove('kick');
      // Retrigger CSS animation
      void ch.offsetWidth;
      ch.classList.add('kick');
      window.setTimeout(() => ch.classList.remove('kick'), 180);
    }

    this.spawnCrumbs(clientX, clientY);
  }

  private spawnCrumbs(clientX: number, clientY: number): void {
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
