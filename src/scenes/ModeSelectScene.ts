import type { GameMode } from '../config/gameConfig';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import { markFirstRunCueSeen } from '../services/preferences';
import { clearUI, panel, bindClick } from '../ui/dom';
import { HOW_TO_PLAY_HTML } from '../ui/howToPlay';

export class ModeSelectScene implements GameScene {
  readonly id = 'modeSelect' as const;
  private howtoEl: HTMLElement | null = null;
  private onEsc: ((e: KeyboardEvent) => void) | null = null;

  constructor(private ctx: SceneContext) {}

  enter(_data?: SceneData): void {
    clearUI(this.ctx.uiRoot);
    const ui = panel(
      'menu main-menu',
      `<button type="button" class="help-btn" data-action="help" aria-label="How to play">?</button>
      <div class="main-menu-content">
        <img class="main-menu-logo" src="assets/logo.png" alt="Bubbles & Durians" />
        <nav class="main-menu-nav" aria-label="Main menu">
          <button type="button" class="menu-option timed" data-mode="timed">TIMED MODE</button>
          <button type="button" class="menu-option endless" data-mode="endless">ENDLESS MODE</button>
          <button type="button" class="menu-option" data-action="lb">VIEW LEADERBOARD</button>
        </nav>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);

    ui.querySelectorAll<HTMLElement>('[data-mode]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = el.dataset.mode as GameMode;
        this.ctx.goto('play', { mode });
      });
    });
    bindClick(ui, '[data-action="lb"]', () => this.ctx.goto('leaderboard', { mode: 'endless' }));
    bindClick(ui, '[data-action="help"]', () => this.openHowTo());

    this.onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.howtoEl) this.closeHowTo();
    };
    window.addEventListener('keydown', this.onEsc);

    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);
  }

  private openHowTo(): void {
    if (this.howtoEl) return;
    markFirstRunCueSeen();
    const wrap = document.createElement('div');
    wrap.innerHTML = HOW_TO_PLAY_HTML;
    this.howtoEl = wrap.firstElementChild as HTMLElement;
    this.ctx.uiRoot.appendChild(this.howtoEl);

    const close = () => this.closeHowTo();
    this.howtoEl.querySelectorAll('[data-action="howto-close"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        close();
      });
    });
    this.howtoEl.addEventListener('click', (e) => {
      if (e.target === this.howtoEl) close();
    });
  }

  private closeHowTo(): void {
    this.howtoEl?.remove();
    this.howtoEl = null;
  }

  update(): void {}

  exit(): void {
    if (this.onEsc) window.removeEventListener('keydown', this.onEsc);
    this.onEsc = null;
    this.closeHowTo();
    clearUI(this.ctx.uiRoot);
  }
}
