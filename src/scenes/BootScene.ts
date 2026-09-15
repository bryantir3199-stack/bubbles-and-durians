import type { GameScene, SceneContext, SceneData } from '../core/types';
import {
  dummyTimedTally,
  wantsBonusTallyPreview,
  wantsGameOverPreview,
  wantsRankingPreview,
  wantsTeethFlybyNow,
} from '../debug/pathDebug';
import { preloadSfx } from '../audio/sfx';
import { preloadResultsCrash } from '../ui/resultsCrash';
import { fetchModeHighScores } from '../services/leaderboard';
import { clearUI } from '../ui/dom';

export class BootScene implements GameScene {
  readonly id = 'boot' as const;

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

    void fetchModeHighScores();
    await Promise.all([preloadSfx(), preloadResultsCrash()]);

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

    if (wantsRankingPreview()) {
      window.setTimeout(() => {
        this.ctx.goto('leaderboard', { mode: 'endless' });
      }, 200);
      return;
    }

    const gameOverPreview = wantsGameOverPreview();
    if (gameOverPreview) {
      window.setTimeout(() => {
        if (gameOverPreview === 'timed') {
          this.ctx.goto('gameOver', {
            mode: 'timed',
            timedPreset: 'short',
            timedTally: dummyTimedTally(),
          });
        } else {
          this.ctx.goto('gameOver', {
            mode: 'endless',
            score: 128_400,
            bubblesHit: 3,
            peakCombo: 5,
          });
        }
      }, 200);
      return;
    }

    if (wantsTeethFlybyNow()) {
      window.setTimeout(() => {
        void this.ctx.ensurePlayWorld().then(() => {
          this.ctx.goto('play', { mode: 'timed', timedPreset: 'short' });
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
