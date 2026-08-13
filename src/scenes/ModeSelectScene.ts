import type { GameMode } from '../config/gameConfig';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import { tryEnterFullscreen } from '../core/display';
import { clearUI, panel, bindClick } from '../ui/dom';

export class ModeSelectScene implements GameScene {
  readonly id = 'modeSelect' as const;

  constructor(private ctx: SceneContext) {}

  enter(_data?: SceneData): void {
    clearUI(this.ctx.uiRoot);
    const ui = panel(
      'menu main-menu',
      `<div class="main-menu-content">
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
        tryEnterFullscreen();
        const mode = el.dataset.mode as GameMode;
        this.ctx.goto('play', { mode });
      });
    });
    bindClick(ui, '[data-action="lb"]', () => this.ctx.goto('leaderboard', { mode: 'endless' }));

    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);
  }

  update(): void {}

  exit(): void {
    clearUI(this.ctx.uiRoot);
  }
}
