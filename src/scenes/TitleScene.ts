import type { GameScene, SceneContext, SceneData } from '../core/types';
import { clearUI, panel, bindClick } from '../ui/dom';

export class TitleScene implements GameScene {
  readonly id = 'title' as const;

  constructor(private ctx: SceneContext) {}

  enter(_data?: SceneData): void {
    clearUI(this.ctx.uiRoot);
    const ui = panel(
      'menu title',
      `<div class="menu-card">
        <img class="logo" src="assets/logo.png" alt="Bubbles & Durians" />
        <p class="tagline">Shoot durians, dodge bubbles — free-roaming castle gallery!</p>
        <button type="button" class="btn primary" data-action="play">PLAY</button>
        <button type="button" class="btn" data-action="lb">LEADERBOARDS</button>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);
    bindClick(ui, '[data-action="play"]', () => this.ctx.goto('modeSelect'));
    bindClick(ui, '[data-action="lb"]', () => this.ctx.goto('leaderboard', { mode: 'endless' }));

    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);
  }

  update(): void {}

  exit(): void {
    clearUI(this.ctx.uiRoot);
  }
}
