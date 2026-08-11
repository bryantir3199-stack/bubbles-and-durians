import type { GameMode } from '../config/gameConfig';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import { clearUI, panel, bindClick } from '../ui/dom';

export class ModeSelectScene implements GameScene {
  readonly id = 'modeSelect' as const;

  constructor(private ctx: SceneContext) {}

  enter(_data?: SceneData): void {
    clearUI(this.ctx.uiRoot);
    const ui = panel(
      'menu mode-select',
      `<div class="menu-wide">
        <h1>SELECT MODE</h1>
        <div class="mode-row">
          <button type="button" class="mode-card" data-mode="endless">
            <h2>ENDLESS</h2>
            <p>3 lives<br/>Bubble hits &amp; escaped durians cost lives<br/>4 durian hits → 2x–4x combo<br/>Hearts restore HP</p>
          </button>
          <button type="button" class="mode-card timed" data-mode="timed">
            <h2>TIMED</h2>
            <p>3 minute clock<br/>Same ammo, bubbles &amp; combos<br/>No escape penalty<br/>No heart pickups</p>
          </button>
        </div>
        <button type="button" class="btn muted-btn" data-action="back">BACK</button>
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
    bindClick(ui, '[data-action="back"]', () => this.ctx.goto('title'));

    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);
  }

  update(): void {}

  exit(): void {
    clearUI(this.ctx.uiRoot);
  }
}
