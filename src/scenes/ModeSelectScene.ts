import { defaultTimedPreset, type GameMode, type TimedPreset } from '../config/gameConfig';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import { isCoarsePointer, tryEnterFullscreen } from '../core/display';
import { requestShakePermission } from '../core/shake';
import { clearUI, panel, bindClick } from '../ui/dom';
import { bindHighScoreBanner, highScoreBannerHtml } from '../ui/highScore';
import { OptionsMenu } from '../ui/OptionsMenu';

export class ModeSelectScene implements GameScene {
  readonly id = 'modeSelect' as const;
  private options: OptionsMenu | null = null;

  constructor(private ctx: SceneContext) {}

  enter(_data?: SceneData): void {
    this.renderMain();
    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);
  }

  update(): void {}

  exit(): void {
    this.options?.destroy();
    this.options = null;
    clearUI(this.ctx.uiRoot);
  }

  private renderMain(): void {
    this.options?.destroy();
    this.options = null;
    clearUI(this.ctx.uiRoot);
    const optionsBtn = `<button type="button" class="menu-option" data-action="options">OPTIONS</button>`;
    const ui = panel(
      'menu main-menu',
      `${highScoreBannerHtml()}
      <div class="main-menu-content">
        <img class="main-menu-logo" src="assets/logo.png" alt="Bubbles & Durians" />
        <nav class="main-menu-nav" aria-label="Main menu">
          <p class="menu-section-label">Learn</p>
          <button type="button" class="menu-option tutorial" data-mode="tutorial">HOW TO PLAY</button>
          <p class="menu-section-label">Timed</p>
          <button type="button" class="menu-option timed" data-mode="timed" data-timed="short">SHORT · 90s</button>
          <button type="button" class="menu-option timed" data-mode="timed" data-timed="medium">MEDIUM · 3 min</button>
          <button type="button" class="menu-option endless" data-mode="endless">ENDLESS MODE</button>
          <button type="button" class="menu-option" data-action="lb">VIEW LEADERBOARD</button>
          ${optionsBtn}
        </nav>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);
    bindHighScoreBanner(ui);

    ui.querySelectorAll<HTMLElement>('[data-mode]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = el.dataset.mode as GameMode;
        const timedPreset = (el.dataset.timed as TimedPreset | undefined) ?? defaultTimedPreset;
        if (isCoarsePointer()) tryEnterFullscreen();
        void requestShakePermission().then(() =>
          this.ctx.goto('play', { mode, timedPreset: mode === 'timed' ? timedPreset : undefined }),
        );
      });
    });
    bindClick(ui, '[data-action="lb"]', () => this.ctx.goto('leaderboard', { mode: 'endless' }));
    bindClick(ui, '[data-action="options"]', () => this.openOptions());
  }

  private openOptions(): void {
    clearUI(this.ctx.uiRoot);
    this.options?.destroy();
    this.options = new OptionsMenu(this.ctx.uiRoot, {
      variant: 'page',
      onBack: () => this.renderMain(),
    });
  }
}
