import type { GameScene, SceneContext, SceneData } from '../core/types';
import { isCoarsePointer, tryEnterFullscreen } from '../core/display';
import { requestShakePermission } from '../core/shake';
import { clearUI, panel } from '../ui/dom';
import { bindHighScoreBanner, highScoreBannerHtml } from '../ui/highScore';

export class TitleScene implements GameScene {
  readonly id = 'title' as const;
  private unbindHighScore: (() => void) | null = null;

  constructor(private ctx: SceneContext) {}

  enter(_data?: SceneData): void {
    clearUI(this.ctx.uiRoot);
    const ui = panel(
      'menu title-splash',
      `${highScoreBannerHtml()}
      <div class="title-splash-content">
        <img class="title-logo" src="assets/title-logo.png" alt="Bubbles & Durians" />
        <p class="click-anywhere">
          <span class="prompt-click">CLICK ANYWHERE TO START</span>
          <span class="prompt-tap">TAP ANYWHERE TO START</span>
        </p>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);
    this.unbindHighScore = bindHighScoreBanner(ui);
    this.ctx.canvas.style.visibility = 'hidden';
    document.body.style.background = '#fff800';

    const advance = () => {
      if (isCoarsePointer()) tryEnterFullscreen();
      void requestShakePermission().then(() => this.ctx.goto('modeSelect'));
    };
    ui.addEventListener('click', advance);
    ui.addEventListener('keydown', (e: Event) => {
      const key = (e as KeyboardEvent).key;
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        advance();
      }
    });
    ui.tabIndex = 0;
    ui.setAttribute('role', 'button');
    ui.setAttribute(
      'aria-label',
      document.documentElement.classList.contains('touch-ui')
        ? 'Tap anywhere to open the main menu'
        : 'Click anywhere to open the main menu',
    );
    ui.focus({ preventScroll: true });

    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);
  }

  update(): void {}

  exit(): void {
    this.unbindHighScore?.();
    this.unbindHighScore = null;
    this.ctx.canvas.style.visibility = '';
    document.body.style.background = '';
    clearUI(this.ctx.uiRoot);
  }
}
