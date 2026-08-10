import type { GameScene, SceneContext, SceneData } from '../core/types';
import { CastleStage } from '../world/CastleStage';
import { ModelCache } from '../world/ModelCache';
import { clearUI, panel } from '../ui/dom';

export class BootScene implements GameScene {
  readonly id = 'boot' as const;
  private stage: CastleStage | null = null;

  constructor(private ctx: SceneContext) {}

  async enter(_data?: SceneData): Promise<void> {
    clearUI(this.ctx.uiRoot);
    const ui = panel(
      'menu boot',
      `<div class="menu-card boot-card">
        <h1>Loading Castle…</h1>
        <div class="progress"><div class="progress-bar" id="boot-bar"></div></div>
        <p class="muted">Preparing 3D stage</p>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);

    const bar = ui.querySelector('#boot-bar') as HTMLElement;
    bar.style.width = '15%';

    this.stage = new CastleStage(this.ctx.three.scene);
    bar.style.width = '35%';

    await Promise.all([this.stage.load(), ModelCache.preload()]);
    bar.style.width = '100%';
    this.ctx.markStageReady();

    this.ctx.three.camera.position.set(0, 140, 560);
    this.ctx.three.camera.lookAt(0, 110, 40);

    window.setTimeout(() => this.ctx.goto('title'), 200);
  }

  update(): void {}

  exit(): void {
    clearUI(this.ctx.uiRoot);
  }
}
