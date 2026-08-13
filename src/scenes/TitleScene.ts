import type { GameScene, SceneContext, SceneData } from '../core/types';
import { isCoarsePointer, tryEnterFullscreen } from '../core/display';
import { requestShakePermission } from '../core/shake';
import { clearUI, panel } from '../ui/dom';

export class TitleScene implements GameScene {
  readonly id = 'title' as const;

  constructor(private ctx: SceneContext) {}

  enter(_data?: SceneData): void {
    clearUI(this.ctx.uiRoot);
    const ui = panel(
      'menu title-splash',
      `<div class="title-splash-content">
        <img class="title-logo" src="assets/logo.png" alt="Bubbles & Durians" />
        <p class="click-anywhere">${isCoarsePointer() ? 'TAP ANYWHERE' : 'CLICK ANYWHERE'}</p>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);

    const advance = () => {
      tryEnterFullscreen();
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
    ui.setAttribute('aria-label', 'Click anywhere to open the main menu');
    ui.focus({ preventScroll: true });

    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);
  }

  update(): void {}

  exit(): void {
    clearUI(this.ctx.uiRoot);
  }
}
