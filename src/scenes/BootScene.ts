import type { GameScene, SceneContext, SceneData } from '../core/types';
import { dummyTimedTally, wantsBonusTallyPreview } from '../debug/pathDebug';
import { CastleStage } from '../world/CastleStage';
import { ModelCache } from '../world/ModelCache';
import { preloadSfx } from '../audio/sfx';
import { fetchModeHighScores } from '../services/leaderboard';
import { clearUI } from '../ui/dom';

export class BootScene implements GameScene {
  readonly id = 'boot' as const;
  private stage: CastleStage | null = null;

  constructor(private ctx: SceneContext) {}

  async enter(_data?: SceneData): Promise<void> {
    clearUI(this.ctx.uiRoot);

    const ui = document.createElement('div');
    ui.className = 'boot-screen';
    ui.innerHTML = `
      <div class="boot-loader">
        <div class="boot-bubble"></div>
        <div class="boot-text">
          <span class="boot-loading">LOADING</span><span class="boot-dots"><span class="boot-dot">.</span><span class="boot-dot">.</span><span class="boot-dot">.</span></span>
        </div>
      </div>
    `;
    this.ctx.uiRoot.appendChild(ui);

    this.stage = new CastleStage(this.ctx.three.scene);

    void fetchModeHighScores();
    await Promise.all([this.stage.load(), ModelCache.preload(), preloadSfx()]);
    this.ctx.markStageReady();

    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);

    if (wantsBonusTallyPreview()) {
      window.setTimeout(() => {
        this.ctx.goto('bonusTally', {
          mode: 'timed',
          timedPreset: 'short',
          timedTally: dummyTimedTally(),
        });
      }, 200);
      return;
    }

    window.setTimeout(() => this.ctx.goto('title'), 200);
  }

  update(): void {}

  exit(): void {
    clearUI(this.ctx.uiRoot);
  }
}
