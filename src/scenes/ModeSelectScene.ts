import { defaultTimedPreset, type GameMode, type TimedPreset } from '../config/gameConfig';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import { isCoarsePointer, tryEnterFullscreen } from '../core/display';
import { requestShakePermission } from '../core/shake';
import { clearUI, panel, bindClick } from '../ui/dom';
import { bindHighScoreBanner, highScoreSlotHtml } from '../ui/highScore';
import { OptionsMenu } from '../ui/OptionsMenu';
import { fadeFromOverlay, fadeToWhiteAndHold } from '../ui/screenFade';

export class ModeSelectScene implements GameScene {
  readonly id = 'modeSelect' as const;
  private options: OptionsMenu | null = null;
  private unbindHighScore: (() => void) | null = null;
  private leaving = false;

  constructor(private ctx: SceneContext) {}

  enter(_data?: SceneData): void {
    this.leaving = false;
    this.renderMain();
    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);
  }

  update(): void {}

  exit(): void {
    this.unbindHighScore?.();
    this.unbindHighScore = null;
    this.options?.destroy();
    this.options = null;
    clearUI(this.ctx.uiRoot);
  }

  private renderMain(): void {
    this.unbindHighScore?.();
    this.unbindHighScore = null;
    this.options?.destroy();
    this.options = null;
    clearUI(this.ctx.uiRoot);
    const ui = panel(
      'menu main-menu',
      `<div class="main-menu-content main-menu-home">
        <nav class="main-menu-layout" aria-label="Main menu">
          <div class="main-menu-modes">
            <button type="button" class="menu-tile endless" data-mode="endless">Endless Mode</button>
            <div class="main-menu-timed">
              <button type="button" class="menu-tile timed" data-mode="timed" data-timed="short">Blitz</button>
              <button type="button" class="menu-tile timed" data-mode="timed" data-timed="medium">Standard</button>
            </div>
          </div>
          <div class="main-menu-utils">
            <button type="button" class="menu-tile util tutorial" data-mode="tutorial">How To Play</button>
            <button type="button" class="menu-tile util" data-action="lb">
              Leaderboard
              ${highScoreSlotHtml()}
            </button>
            <button type="button" class="menu-tile util" data-action="options">Settings</button>
          </div>
        </nav>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);
    this.unbindHighScore = bindHighScoreBanner(ui);

    ui.querySelectorAll<HTMLElement>('[data-mode]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = el.dataset.mode as GameMode;
        const timedPreset = (el.dataset.timed as TimedPreset | undefined) ?? defaultTimedPreset;
        if (this.leaving) return;
        this.leaving = true;
        if (isCoarsePointer()) tryEnterFullscreen();
        void requestShakePermission()
          .then(() => fadeToWhiteAndHold())
          .then(() => {
            this.ctx.goto('play', { mode, timedPreset: mode === 'timed' ? timedPreset : undefined });
            return fadeFromOverlay();
          })
          .catch(() => {
            this.leaving = false;
          });
      });
    });
    bindClick(ui, '[data-action="lb"]', () => this.ctx.goto('leaderboard', { mode: 'endless' }));
    bindClick(ui, '[data-action="options"]', () => this.openOptions());
  }

  private openOptions(): void {
    this.unbindHighScore?.();
    this.unbindHighScore = null;
    clearUI(this.ctx.uiRoot);
    this.options?.destroy();
    this.options = new OptionsMenu(this.ctx.uiRoot, {
      variant: 'page',
      onBack: () => this.renderMain(),
    });
  }
}
