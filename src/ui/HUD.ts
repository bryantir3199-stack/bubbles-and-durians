import { gameConfig } from '../config/gameConfig';
import type { GameMode } from '../config/gameConfig';

export class HUD {
  private root: HTMLElement;
  private scoreEl: HTMLElement;
  private livesEl: HTMLElement;
  private ammoEl: HTMLElement;
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
        <button type="button" class="hud-reload-btn">RELOAD</button>
      </div>
      <div class="hud-reload-hint" hidden>RELOAD! (R)</div>
      <div class="crosshair" aria-hidden="true"></div>
    `;
    parent.appendChild(this.root);

    this.scoreEl = this.root.querySelector('.hud-score')!;
    this.livesEl = this.root.querySelector('.hud-lives')!;
    this.ammoEl = this.root.querySelector('.hud-ammo')!;
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

  setPointer(x: number, y: number): void {
    const ch = this.root.querySelector('.crosshair') as HTMLElement;
    ch.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
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
