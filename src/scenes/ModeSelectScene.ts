import { defaultTimedPreset, type GameMode, type TimedPreset } from '../config/gameConfig';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import {
  canUseFullscreen,
  isCoarsePointer,
  isFullscreen,
  toggleFullscreen,
  tryEnterFullscreen,
} from '../core/display';
import { requestShakePermission } from '../core/shake';
import { clearUI, panel, bindClick } from '../ui/dom';

export class ModeSelectScene implements GameScene {
  readonly id = 'modeSelect' as const;
  private view: 'main' | 'options' = 'main';
  private unsubFs: (() => void) | null = null;

  constructor(private ctx: SceneContext) {}

  enter(_data?: SceneData): void {
    this.view = 'main';
    this.render();
    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);
  }

  update(): void {}

  exit(): void {
    this.clearFsListener();
    clearUI(this.ctx.uiRoot);
  }

  private render(): void {
    this.clearFsListener();
    clearUI(this.ctx.uiRoot);
    if (this.view === 'options') this.renderOptions();
    else this.renderMain();
  }

  private renderMain(): void {
    const optionsBtn = canUseFullscreen()
      ? `<button type="button" class="menu-option" data-action="options">OPTIONS</button>`
      : '';
    const ui = panel(
      'menu main-menu',
      `<div class="main-menu-content">
        <img class="main-menu-logo" src="assets/logo.png" alt="Bubbles & Durians" />
        <nav class="main-menu-nav" aria-label="Main menu">
          <p class="menu-section-label">Learn</p>
          <button type="button" class="menu-option tutorial" data-mode="tutorial">TUTORIAL</button>
          <p class="menu-section-label">Timed</p>
          <button type="button" class="menu-option timed" data-mode="timed" data-timed="short">SHORT · 90s</button>
          <button type="button" class="menu-option timed" data-mode="timed" data-timed="medium">MEDIUM · 3 min</button>
          <button type="button" class="menu-option endless" data-mode="endless">ENDLESS MODE</button>
          <button type="button" class="menu-option" data-action="lb">VIEW LEADERBOARD</button>
          ${optionsBtn}
        </nav>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);

    ui.querySelectorAll<HTMLElement>('[data-mode]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = el.dataset.mode as GameMode;
        const timedPreset = (el.dataset.timed as TimedPreset | undefined) ?? defaultTimedPreset;
        if (isCoarsePointer()) tryEnterFullscreen();
        void requestShakePermission().then(() =>
          this.ctx.goto('play', { mode, timedPreset: mode === 'timed' ? timedPreset : undefined }),
        );
      });
    });
    bindClick(ui, '[data-action="lb"]', () => this.ctx.goto('leaderboard', { mode: 'endless' }));
    bindClick(ui, '[data-action="options"]', () => {
      this.view = 'options';
      this.render();
    });
  }

  private renderOptions(): void {
    const ui = panel(
      'menu main-menu',
      `<div class="main-menu-content">
        <img class="main-menu-logo" src="assets/logo.png" alt="Bubbles & Durians" />
        <nav class="main-menu-nav" aria-label="Options">
          <p class="menu-section-label">Display</p>
          <button type="button" class="menu-option" data-action="fullscreen" aria-pressed="false">FULLSCREEN · OFF</button>
          <button type="button" class="menu-option" data-action="back">BACK</button>
        </nav>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);

    const fsBtn = ui.querySelector<HTMLButtonElement>('[data-action="fullscreen"]');
    if (fsBtn) {
      const sync = () => {
        const on = isFullscreen();
        fsBtn.textContent = on ? 'FULLSCREEN · ON' : 'FULLSCREEN · OFF';
        fsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        fsBtn.classList.toggle('is-on', on);
      };
      sync();
      fsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFullscreen();
        sync();
      });
      document.addEventListener('fullscreenchange', sync);
      document.addEventListener('webkitfullscreenchange', sync as EventListener);
      this.unsubFs = () => {
        document.removeEventListener('fullscreenchange', sync);
        document.removeEventListener('webkitfullscreenchange', sync as EventListener);
      };
    }

    bindClick(ui, '[data-action="back"]', () => {
      this.view = 'main';
      this.render();
    });
  }

  private clearFsListener(): void {
    this.unsubFs?.();
    this.unsubFs = null;
  }
}
