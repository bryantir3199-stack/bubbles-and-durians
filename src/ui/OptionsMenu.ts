import {
  canUseFullscreen,
  isFullscreen,
  toggleFullscreen,
} from '../core/display';
import {
  getSettings,
  setGraphicsSettings,
  setControlBindings,
  resetControlBindings,
  getKeyDisplayName,
  getResolutionLabel,
  RESOLUTION_SCALES,
  type ControlBindings,
  type ResolutionScale,
} from '../config/settings';
import {
  getMusicVolume,
  getSfxVolume,
  setMusicVolume,
  setSfxVolume,
  playPopSound,
} from '../audio/sfx';
import { bindClick, panel } from './dom';

type OptionsView = 'hub' | 'graphics' | 'sound' | 'controls';

export type OptionsMenuVariant = 'page' | 'overlay';

export class OptionsMenu {
  private root: HTMLElement;
  private view: OptionsView = 'hub';
  private unsubFs: (() => void) | null = null;
  private rebindHandler: ((e: KeyboardEvent) => void) | null = null;
  private capturingKeys = false;

  constructor(
    parent: HTMLElement,
    private readonly opts: {
      variant: OptionsMenuVariant;
      onBack: () => void;
    },
  ) {
    this.root = document.createElement('div');
    this.root.className =
      this.opts.variant === 'overlay' ? 'pause-options-host' : 'options-menu-host';
    parent.appendChild(this.root);
    this.render();
  }

  isCapturingKeys(): boolean {
    return this.capturingKeys;
  }

  destroy(): void {
    this.clearFsListener();
    this.clearRebindListener();
    this.root.remove();
  }

  private render(): void {
    this.clearFsListener();
    this.clearRebindListener();
    this.root.replaceChildren();
    switch (this.view) {
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
        this.renderHub();
    }
  }

  private wrap(aria: string, innerNav: string): HTMLElement {
    if (this.opts.variant === 'overlay') {
      return panel(
        'pause-options-sheet',
        `<nav class="main-menu-nav options-panel" aria-label="${aria}">${innerNav}</nav>`,
      );
    }
    return panel(
      'menu main-menu',
      `<div class="main-menu-content">
        <img class="main-menu-logo" src="assets/logo.png" alt="Bubbles & Durians" />
        <nav class="main-menu-nav options-panel" aria-label="${aria}">${innerNav}</nav>
      </div>`,
    );
  }

  private renderHub(): void {
    const ui = this.wrap(
      'Options',
      `<p class="menu-section-label">Settings</p>
       <button type="button" class="menu-option" data-action="graphics">GRAPHICS</button>
       <button type="button" class="menu-option" data-action="sound">SOUND</button>
       <button type="button" class="menu-option" data-action="controls">CONTROLS</button>
       <button type="button" class="menu-option" data-action="back">BACK</button>`,
    );
    this.root.appendChild(ui);

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
    bindClick(ui, '[data-action="back"]', () => this.opts.onBack());
  }

  private renderGraphics(): void {
    const settings = getSettings();
    const fsOn = isFullscreen();
    const aoOn = settings.graphics.aoEnabled;
    const shadowQuality = settings.graphics.shadowQuality;
    const resScale = settings.graphics.resolutionScale;

    const resolutionButtons = RESOLUTION_SCALES.map(
      (scale) =>
        `<button type="button" class="options-toggle${resScale === scale ? ' is-active' : ''}" data-value="${scale}">${getResolutionLabel(scale)}</button>`,
    ).join('');

    const ui = this.wrap(
      'Graphics Settings',
      `<p class="menu-section-label">Graphics</p>
       ${canUseFullscreen() ? `
       <button type="button" class="menu-option" data-action="fullscreen" aria-pressed="${fsOn}">
         FULLSCREEN · ${fsOn ? 'ON' : 'OFF'}
       </button>
       ` : ''}
       <div class="options-row">
         <span class="options-label">RESOLUTION</span>
         <div class="options-toggle-group" data-setting="resolution">
           ${resolutionButtons}
         </div>
       </div>
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
       <button type="button" class="menu-option" data-action="back">BACK</button>`,
    );
    this.root.appendChild(ui);

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

    const resolutionGroup = ui.querySelector('[data-setting="resolution"]');
    if (resolutionGroup) {
      resolutionGroup.querySelectorAll<HTMLButtonElement>('.options-toggle').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = parseFloat(btn.dataset.value ?? '1') as ResolutionScale;
          setGraphicsSettings({ resolutionScale: val });
          this.render();
        });
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
      this.view = 'hub';
      this.render();
    });
  }

  private renderSound(): void {
    const musicVol = getMusicVolume();
    const sfxVol = getSfxVolume();

    const ui = this.wrap(
      'Sound Settings',
      `<p class="menu-section-label">Sound</p>
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
       <button type="button" class="menu-option" data-action="back">BACK</button>`,
    );
    this.root.appendChild(ui);

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
      this.view = 'hub';
      this.render();
    });
  }

  private renderControls(): void {
    const controls = getSettings().controls;

    const ui = this.wrap(
      'Control Settings',
      `<p class="menu-section-label">Controls</p>
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
       <button type="button" class="menu-option" data-action="back">BACK</button>`,
    );
    this.root.appendChild(ui);

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
      this.view = 'hub';
      this.render();
    });
  }

  private startRebinding(key: keyof ControlBindings, btn: HTMLButtonElement): void {
    this.clearRebindListener();
    btn.textContent = '...';
    btn.classList.add('is-rebinding');
    this.capturingKeys = true;

    this.rebindHandler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const pressedKey = e.key;
      setControlBindings({ [key]: pressedKey });
      this.clearRebindListener();
      this.render();
    };

    window.addEventListener('keydown', this.rebindHandler, true);
  }

  private clearRebindListener(): void {
    this.capturingKeys = false;
    if (this.rebindHandler) {
      window.removeEventListener('keydown', this.rebindHandler, true);
      this.rebindHandler = null;
    }
  }

  private clearFsListener(): void {
    this.unsubFs?.();
    this.unsubFs = null;
  }
}
