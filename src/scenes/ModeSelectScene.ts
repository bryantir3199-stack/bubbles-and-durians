import { defaultTimedPreset, type GameMode, type TimedPreset } from '../config/gameConfig';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import { isCoarsePointer, tryEnterFullscreen } from '../core/display';
import { requestShakePermission } from '../core/shake';
import { clearUI, panel, bindClick } from '../ui/dom';
import { bindHighScoreBanner, highScoreSlotHtml } from '../ui/highScore';
import { OptionsMenu } from '../ui/OptionsMenu';
import { paintMenuArt } from '../ui/menuArt';
import { fadeFromOverlay, fadeToWhiteAndHold } from '../ui/screenFade';
import { playGameStartSound } from '../audio/sfx';

export class ModeSelectScene implements GameScene {
  readonly id = 'modeSelect' as const;
  private options: OptionsMenu | null = null;
  private unbindHighScore: (() => void) | null = null;
  private leaving = false;
  private flashTimer = 0;

  constructor(private ctx: SceneContext) {}

  enter(_data?: SceneData): void {
    this.renderMain();
    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);
  }

  update(): void {}

  exit(): void {
    window.clearTimeout(this.flashTimer);
    this.flashTimer = 0;
    this.unbindHighScore?.();
    this.unbindHighScore = null;
    this.options?.destroy();
    this.options = null;
    clearUI(this.ctx.uiRoot);
  }

  private flashThen(tile: HTMLElement, next: () => void): void {
    tile.classList.add('is-selecting');
    this.flashTimer = window.setTimeout(next, 750);
  }

  private renderMain(): void {
    this.leaving = false;
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
            <button type="button" class="menu-tile endless" data-mode="endless">
              <img class="menu-icon menu-icon-mode" src="assets/menu-icon-endless.png" alt="" aria-hidden="true">
              Endless Mode
            </button>
            <div class="main-menu-timed">
              <button type="button" class="menu-tile timed" data-mode="timed" data-timed="short">
                <img class="menu-icon menu-icon-mode" src="assets/menu-icon-blitz.png" alt="" aria-hidden="true">
                Blitz
              </button>
              <button type="button" class="menu-tile timed" data-mode="timed" data-timed="medium">
                <img class="menu-icon menu-icon-mode" src="assets/menu-icon-standard.png" alt="" aria-hidden="true">
                Standard
              </button>
            </div>
          </div>
          <div class="main-menu-utils">
            <button type="button" class="menu-tile util tutorial" data-mode="tutorial">
              <img class="menu-icon menu-icon-util" src="assets/menu-icon-howto.png" alt="" aria-hidden="true">
              How To Play
            </button>
            <button type="button" class="menu-tile util" data-action="lb">
              <img class="menu-icon menu-icon-util" src="assets/menu-icon-leaderboard.png" alt="" aria-hidden="true">
              Leaderboard
              ${highScoreSlotHtml()}
            </button>
            <button type="button" class="menu-tile util" data-action="options">
              <img class="menu-icon menu-icon-util" src="assets/menu-icon-settings.png" alt="" aria-hidden="true">
              Settings
            </button>
          </div>
        </nav>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);
    paintMenuArt(ui);
    this.unbindHighScore = bindHighScoreBanner(ui);

    ui.querySelectorAll<HTMLElement>('[data-mode]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = el.dataset.mode as GameMode;
        const timedPreset = (el.dataset.timed as TimedPreset | undefined) ?? defaultTimedPreset;
        if (this.leaving) return;
        this.leaving = true;
        if (mode === 'endless' || mode === 'timed') playGameStartSound();
        if (isCoarsePointer()) tryEnterFullscreen();
        this.flashThen(el, () => {
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
    });
    bindClick(ui, '[data-action="lb"]', () => {
      if (this.leaving) return;
      const tile = ui.querySelector<HTMLElement>('[data-action="lb"]');
      if (!tile) return;
      this.leaving = true;
      this.flashThen(tile, () => this.ctx.goto('leaderboard', { mode: 'endless' }));
    });
    bindClick(ui, '[data-action="options"]', () => {
      if (this.leaving) return;
      const tile = ui.querySelector<HTMLElement>('[data-action="options"]');
      if (!tile) return;
      this.leaving = true;
      this.flashThen(tile, () => this.openOptions());
    });
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
