import { defaultTimedPreset, type GameMode, type TimedPreset } from '../config/gameConfig';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import {
  canUseFullscreen,
  isCoarsePointer,
  isFullscreen,
  toggleFullscreen,
  tryEnterFullscreen,
} from '../core/display';
import { requestShakePermission } from '../core/shake';
import { clearUI, panel, bindClick } from '../ui/dom';
import { bindHighScoreBanner, highScoreBannerHtml } from '../ui/highScore';
import {
  getSettings,
  setGraphicsSettings,
  setControlBindings,
  resetControlBindings,
  getKeyDisplayName,
  type ControlBindings,
} from '../config/settings';
import {
  getMusicVolume,
  getSfxVolume,
  setMusicVolume,
  setSfxVolume,
  playPopSound,
} from '../audio/sfx';

type OptionsView = 'main' | 'options' | 'graphics' | 'sound' | 'controls';

export class ModeSelectScene implements GameScene {
  readonly id = 'modeSelect' as const;
  private view: OptionsView = 'main';
  private unsubFs: (() => void) | null = null;
  private rebindHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(private ctx: SceneContext) {}

  enter(_data?: SceneData): void {
    this.view = 'main';
    this.render();
    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);
  }

  update(): void {}

  exit(): void {
    this.clearFsListener();
    this.clearRebindListener();
    clearUI(this.ctx.uiRoot);
  }

  private render(): void {
    this.clearFsListener();
    this.clearRebindListener();
    clearUI(this.ctx.uiRoot);
    switch (this.view) {
      case 'options':
        this.renderOptions();
        break;
      case 'graphics':
        this.renderGraphics();
        break;
      case 'sound':
        this.renderSound();
        break;
      case 'controls':
        this.renderControls();
        break;
      default:
        this.renderMain();
    }
  }

  private renderMain(): void {
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
    bindClick(ui, '[data-action="options"]', () => {
      this.view = 'options';
      this.render();
    });
  }

  private renderOptions(): void {
    const ui = panel(
      'menu main-menu',
      `<div class="main-menu-content">
        <img class="main-menu-logo" src="assets/logo.png" alt="Bubbles & Durians" />
        <nav class="main-menu-nav" aria-label="Options">
          <p class="menu-section-label">Settings</p>
          <button type="button" class="menu-option" data-action="graphics">GRAPHICS</button>
          <button type="button" class="menu-option" data-action="sound">SOUND</button>
          <button type="button" class="menu-option" data-action="controls">CONTROLS</button>
          <button type="button" class="menu-option" data-action="back">BACK</button>
        </nav>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);

    bindClick(ui, '[data-action="graphics"]', () => {
      this.view = 'graphics';
      this.render();
    });
    bindClick(ui, '[data-action="sound"]', () => {
      this.view = 'sound';
      this.render();
    });
    bindClick(ui, '[data-action="controls"]', () => {
      this.view = 'controls';
      this.render();
    });
    bindClick(ui, '[data-action="back"]', () => {
      this.view = 'main';
      this.render();
    });
  }

  private renderGraphics(): void {
    const settings = getSettings();
    const fsOn = isFullscreen();
    const aoOn = settings.graphics.aoEnabled;
    const shadowQuality = settings.graphics.shadowQuality;

    const ui = panel(
      'menu main-menu',
      `<div class="main-menu-content">
        <img class="main-menu-logo" src="assets/logo.png" alt="Bubbles & Durians" />
        <nav class="main-menu-nav options-panel" aria-label="Graphics Settings">
          <p class="menu-section-label">Graphics</p>
          ${canUseFullscreen() ? `
          <button type="button" class="menu-option" data-action="fullscreen" aria-pressed="${fsOn}">
            FULLSCREEN · ${fsOn ? 'ON' : 'OFF'}
          </button>
          ` : ''}
          <button type="button" class="menu-option${aoOn ? ' is-on' : ''}" data-action="ao" aria-pressed="${aoOn}">
            AMBIENT OCCLUSION · ${aoOn ? 'ON' : 'OFF'}
          </button>
          <div class="options-row">
            <span class="options-label">SHADOWS</span>
            <div class="options-toggle-group" data-setting="shadows">
              <button type="button" class="options-toggle${shadowQuality === 'low' ? ' is-active' : ''}" data-value="low">LOW</button>
              <button type="button" class="options-toggle${shadowQuality === 'medium' ? ' is-active' : ''}" data-value="medium">MED</button>
              <button type="button" class="options-toggle${shadowQuality === 'high' ? ' is-active' : ''}" data-value="high">HIGH</button>
            </div>
          </div>
          <button type="button" class="menu-option" data-action="back">BACK</button>
        </nav>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);

    const fsBtn = ui.querySelector<HTMLButtonElement>('[data-action="fullscreen"]');
    if (fsBtn) {
      const sync = () => {
        const on = isFullscreen();
        fsBtn.textContent = `FULLSCREEN · ${on ? 'ON' : 'OFF'}`;
        fsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        fsBtn.classList.toggle('is-on', on);
      };
      sync();
      fsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFullscreen();
        sync();
      });
      document.addEventListener('fullscreenchange', sync);
      document.addEventListener('webkitfullscreenchange', sync as EventListener);
      this.unsubFs = () => {
        document.removeEventListener('fullscreenchange', sync);
        document.removeEventListener('webkitfullscreenchange', sync as EventListener);
      };
    }

    const aoBtn = ui.querySelector<HTMLButtonElement>('[data-action="ao"]');
    if (aoBtn) {
      aoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const current = getSettings().graphics.aoEnabled;
        setGraphicsSettings({ aoEnabled: !current });
        this.render();
      });
    }

    const shadowGroup = ui.querySelector('[data-setting="shadows"]');
    if (shadowGroup) {
      shadowGroup.querySelectorAll<HTMLButtonElement>('.options-toggle').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = btn.dataset.value as 'low' | 'medium' | 'high';
          setGraphicsSettings({ shadowQuality: val });
          this.render();
        });
      });
    }

    bindClick(ui, '[data-action="back"]', () => {
      this.view = 'options';
      this.render();
    });
  }

  private renderSound(): void {
    const musicVol = getMusicVolume();
    const sfxVol = getSfxVolume();

    const ui = panel(
      'menu main-menu',
      `<div class="main-menu-content">
        <img class="main-menu-logo" src="assets/logo.png" alt="Bubbles & Durians" />
        <nav class="main-menu-nav options-panel" aria-label="Sound Settings">
          <p class="menu-section-label">Sound</p>
          <div class="options-row">
            <span class="options-label">MUSIC</span>
            <input type="range" class="options-slider" data-setting="music" 
              min="0" max="100" value="${Math.round(musicVol * 100)}" />
            <span class="options-value" data-value="music">${Math.round(musicVol * 100)}%</span>
          </div>
          <div class="options-row">
            <span class="options-label">SFX</span>
            <input type="range" class="options-slider" data-setting="sfx"
              min="0" max="100" value="${Math.round(sfxVol * 100)}" />
            <span class="options-value" data-value="sfx">${Math.round(sfxVol * 100)}%</span>
          </div>
          <button type="button" class="menu-option" data-action="back">BACK</button>
        </nav>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);

    const musicSlider = ui.querySelector<HTMLInputElement>('[data-setting="music"]');
    const musicValue = ui.querySelector<HTMLElement>('[data-value="music"]');
    if (musicSlider && musicValue) {
      musicSlider.addEventListener('input', () => {
        const val = parseInt(musicSlider.value, 10);
        musicValue.textContent = `${val}%`;
        setMusicVolume(val / 100);
      });
    }

    const sfxSlider = ui.querySelector<HTMLInputElement>('[data-setting="sfx"]');
    const sfxValue = ui.querySelector<HTMLElement>('[data-value="sfx"]');
    if (sfxSlider && sfxValue) {
      let debounceTimer: number | null = null;
      sfxSlider.addEventListener('input', () => {
        const val = parseInt(sfxSlider.value, 10);
        sfxValue.textContent = `${val}%`;
        setSfxVolume(val / 100);
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          playPopSound();
          debounceTimer = null;
        }, 150);
      });
    }

    bindClick(ui, '[data-action="back"]', () => {
      this.view = 'options';
      this.render();
    });
  }

  private renderControls(): void {
    const settings = getSettings();
    const controls = settings.controls;

    const ui = panel(
      'menu main-menu',
      `<div class="main-menu-content">
        <img class="main-menu-logo" src="assets/logo.png" alt="Bubbles & Durians" />
        <nav class="main-menu-nav options-panel" aria-label="Control Settings">
          <p class="menu-section-label">Controls</p>
          <div class="options-row keybind-row">
            <span class="options-label">RELOAD</span>
            <button type="button" class="keybind-btn" data-bind="reload">${getKeyDisplayName(controls.reload)}</button>
          </div>
          <div class="options-row keybind-row">
            <span class="options-label">RELOAD (ALT)</span>
            <button type="button" class="keybind-btn" data-bind="reloadAlt">${getKeyDisplayName(controls.reloadAlt)}</button>
          </div>
          <div class="options-row keybind-row">
            <span class="options-label">PAUSE</span>
            <button type="button" class="keybind-btn" data-bind="pause">${getKeyDisplayName(controls.pause)}</button>
          </div>
          <button type="button" class="menu-option muted-small" data-action="reset">RESET TO DEFAULTS</button>
          <button type="button" class="menu-option" data-action="back">BACK</button>
        </nav>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);

    ui.querySelectorAll<HTMLButtonElement>('.keybind-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const bindKey = btn.dataset.bind as keyof ControlBindings;
        this.startRebinding(bindKey, btn);
      });
    });

    bindClick(ui, '[data-action="reset"]', () => {
      resetControlBindings();
      this.render();
    });

    bindClick(ui, '[data-action="back"]', () => {
      this.view = 'options';
      this.render();
    });
  }

  private startRebinding(key: keyof ControlBindings, btn: HTMLButtonElement): void {
    this.clearRebindListener();
    btn.textContent = '...';
    btn.classList.add('is-rebinding');

    this.rebindHandler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const pressedKey = e.key;
      setControlBindings({ [key]: pressedKey });
      this.clearRebindListener();
      this.render();
    };

    window.addEventListener('keydown', this.rebindHandler);
  }

  private clearRebindListener(): void {
    if (this.rebindHandler) {
      window.removeEventListener('keydown', this.rebindHandler);
      this.rebindHandler = null;
    }
  }

  private clearFsListener(): void {
    this.unsubFs?.();
    this.unsubFs = null;
  }
}
