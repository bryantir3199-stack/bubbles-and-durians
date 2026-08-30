import { gameConfig } from '../config/gameConfig';
import type { GameMode, TimedPresetConfig } from '../config/gameConfig';
import { playCountdownTickSound, playTeethWarnBeepSound } from '../audio/sfx';
import { isCoarsePointer } from '../core/display';
import { OptionsMenu } from './OptionsMenu';

const TOOTH_IMG = `<img class="hud-tooth-icon" src="/assets/hud/tooth.png" alt="" draggable="false" />`;
const HEART_IMG = `<img class="hud-heart-icon" src="/assets/hud/heart.png" alt="" draggable="false" />`;

const PAUSE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1.5"/><rect x="14" y="4" width="5" height="16" rx="1.5"/></svg>`;
const PLAY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>`;
const SPEAKER_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l6-4v14l-6-4H4z"/><path d="M16.5 8.5c1.4 1.2 2.2 2.8 2.2 4.5s-.8 3.3-2.2 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.8 6c2.1 1.8 3.4 4.2 3.4 7s-1.3 5.2-3.4 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const MUTE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l6-4v14l-6-4H4z"/><path d="M17 9l5 6M22 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const RELOAD_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6V3L8 7l4 4V8a4 4 0 1 1-4 4H6a6 6 0 1 0 6-6z"/></svg>`;
const CLOCK_ICON = `<svg class="hud-clock-icon" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 1.9"/></g></svg>`;

export type HUDCallbacks = {
  onReload: () => void;
  onPauseToggle: () => void;
  onMuteToggle: () => void;
  onQuitToMenu: () => void;
};

export class HUD {
  private root: HTMLElement;
  private scoreEl: HTMLElement;
  private livesEl: HTMLElement | null = null;
  private livesPanel: HTMLElement | null = null;
  private ammoIconsEl: HTMLElement | null;
  private ammoNumEl: HTMLElement | null;
  private ammoPanel: HTMLElement | null;
  private reloadBtn: HTMLButtonElement | null = null;
  private comboEl: HTMLElement;
  private comboTextEl: HTMLElement | null = null;
  private comboMultEl: HTMLElement | null = null;
  private comboTrackEl: HTMLElement | null = null;
  private comboPips: HTMLElement[] = [];
  private timerEl: HTMLElement | null = null;
  private timerSecEl: HTMLElement | null = null;
  private timerMsEl: HTMLElement | null = null;
  private reloadHint: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  private muteBtn: HTMLButtonElement;
  private pauseOverlay: HTMLElement;
  private pauseMenu: HTMLElement;
  private pauseConfirm: HTMLElement;
  private pauseOptionsHost: HTMLElement;
  private optionsMenu: OptionsMenu | null = null;
  private callbacks: HUDCallbacks;
  private frenzyMeterEl: HTMLElement | null = null;
  private frenzyFillEl: HTMLElement | null = null;
  private lastComboLevel = 1;
  private comboBreakTimer = 0;
  private thirtyBannerShown = false;
  private lastCountdownSec = -1;
  private paused = false;
  private introSlideTimer = 0;
  private readonly mode: GameMode;
  private readonly mobile = isCoarsePointer();
  private readonly timedConfig: TimedPresetConfig | null;

  constructor(
    parent: HTMLElement,
    mode: GameMode,
    callbacks: HUDCallbacks,
    timedConfig?: TimedPresetConfig,
  ) {
    this.mode = mode;
    this.timedConfig = mode === 'timed' ? (timedConfig ?? null) : null;
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = this.mobile ? 'hud hud-mobile' : 'hud';
    if (mode !== 'tutorial') this.root.classList.add('hud-intro-off');

    const frenzyMeter =
      mode !== 'timed'
        ? `
      <div class="hud-frenzy-meter" aria-label="Frenzy meter">
        <span class="hud-frenzy-label">FRENZY</span>
        <div class="hud-frenzy-track">
          <div class="hud-frenzy-fill" style="width: 0%"></div>
        </div>
      </div>`
        : '';

    this.root.innerHTML = this.mobile
      ? this.mobileMarkup(mode, frenzyMeter)
      : this.desktopMarkup(mode, frenzyMeter);
    parent.appendChild(this.root);

    this.scoreEl = this.root.querySelector('.hud-score-num')!;
    this.livesPanel = this.root.querySelector('.hud-lives');
    this.livesEl = this.root.querySelector('.hud-lives-value');
    this.ammoIconsEl = this.root.querySelector('.hud-ammo-icons');
    this.ammoNumEl = this.root.querySelector('.hud-ammo-num');
    this.ammoPanel = this.root.querySelector('.hud-ammo, .hud-m-ammo');
    this.reloadBtn = this.root.querySelector('.hud-reload-btn');
    this.comboEl = this.root.querySelector('.hud-combo')!;
    this.comboTextEl = this.root.querySelector('.hud-combo-text');
    this.comboMultEl = this.root.querySelector('.hud-combo-mult');
    this.comboTrackEl = this.root.querySelector('.hud-combo-track');
    this.comboPips = [...this.root.querySelectorAll<HTMLElement>('.hud-combo-pip')];
    this.timerEl = this.root.querySelector('.hud-time');
    this.timerSecEl = this.root.querySelector('.hud-time-sec');
    this.timerMsEl = this.root.querySelector('.hud-time-ms');
    this.reloadHint = this.root.querySelector('.hud-reload-hint')!;
    this.pauseBtn = this.root.querySelector('.hud-pause-btn')!;
    this.muteBtn = this.root.querySelector('.hud-mute-btn')!;
    this.pauseOverlay = this.root.querySelector('.hud-pause-overlay')!;
    this.pauseMenu = this.root.querySelector('.hud-pause-menu')!;
    this.pauseConfirm = this.root.querySelector('.hud-pause-confirm')!;
    this.pauseOptionsHost = this.root.querySelector('.hud-pause-options')!;
    this.frenzyMeterEl = this.root.querySelector('.hud-frenzy-meter');
    this.frenzyFillEl = this.root.querySelector('.hud-frenzy-fill');

    const bindCtrl = (el: HTMLElement, fn: () => void) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
    };

    if (this.reloadBtn) bindCtrl(this.reloadBtn, () => callbacks.onReload());
    else if (this.ammoPanel) {
      bindCtrl(this.ammoPanel, () => callbacks.onReload());
      this.ammoPanel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          callbacks.onReload();
        }
      });
    }
    bindCtrl(this.pauseBtn, () => callbacks.onPauseToggle());
    bindCtrl(this.muteBtn, () => callbacks.onMuteToggle());
    this.bindPauseMenu();

    if (mode === 'timed' && this.timedConfig) {
      this.setTimer(this.timedConfig.seconds);
    }
  }

  private desktopMarkup(mode: GameMode, frenzyMeter: string): string {
    const timedSeconds = this.timedConfig?.seconds ?? 0;
    const teeth = Array.from({ length: gameConfig.magazineSize }, () =>
      `<span class="hud-tooth filled">${TOOTH_IMG}</span>`,
    ).join('');
    const rightPanel =
      mode === 'timed'
        ? `
      <div class="hud-panel hud-time" aria-label="Time">
        <span class="hud-panel-label hud-time-label">TIME</span>
        <div class="hud-time-value">
          <span class="hud-time-sec">${timedSeconds}</span>
          <span class="hud-time-dot">.</span>
          <span class="hud-time-ms">000</span>
        </div>
      </div>`
        : `
      <div class="hud-panel hud-lives" aria-label="Lives">
        <span class="hud-panel-label hud-lives-label">LIVES</span>
        <div class="hud-lives-value">${this.hearts(gameConfig.startLives)}</div>
      </div>`;

    return `
      <div class="hud-pause-overlay" hidden aria-hidden="true"></div>
      <div class="hud-frenzy-border" aria-hidden="true"></div>
      <div class="hud-controls">
        <button type="button" class="hud-ctrl hud-pause-btn" aria-label="Pause" title="Pause">${PAUSE_ICON}</button>
        <button type="button" class="hud-ctrl hud-mute-btn" aria-label="Mute" title="Mute" aria-pressed="false">${SPEAKER_ICON}</button>
      </div>
      ${frenzyMeter}
      ${this.pauseMenuMarkup()}
      <div class="hud-dock">
        <div class="hud-left">
          <div class="hud-combo" aria-label="Combo" hidden>
            <div class="hud-combo-badge">
              <span class="hud-combo-text">COMBO 1X</span>
            </div>
            <div class="hud-combo-track" role="meter" aria-label="Combo progress" aria-valuemin="0" aria-valuemax="${gameConfig.shotsPerComboLevel}" aria-valuenow="0">
              ${Array.from({ length: gameConfig.shotsPerComboLevel }, () => '<span class="hud-combo-pip"></span>').join('')}
            </div>
          </div>
          <div class="hud-panel hud-score" aria-label="Score">
            <span class="hud-panel-label hud-score-label">SCORE</span>
            <span class="hud-score-num">0</span>
          </div>
        </div>
        <div class="hud-center">
          <div class="hud-panel hud-ammo" role="button" tabindex="0" aria-label="Ammo — tap to reload" title="Tap to reload">
            <span class="hud-panel-label hud-ammo-label">AMMO</span>
            <div class="hud-ammo-icons">${teeth}</div>
          </div>
        </div>
        <div class="hud-right">
          ${rightPanel}
        </div>
      </div>
      <div class="hud-reload-hint" hidden>RELOAD! (tap ammo / R)</div>
      <div class="crosshair" aria-hidden="true"></div>
    `;
  }

  private mobileMarkup(mode: GameMode, frenzyMeter: string): string {
    const timedSeconds = this.timedConfig?.seconds ?? 0;
    const teeth = Array.from({ length: gameConfig.magazineSize }, () =>
      `<span class="hud-tooth filled">${TOOTH_IMG}</span>`,
    ).join('');
    const rightStat =
      mode === 'timed'
        ? `<span class="hud-m-stat hud-time" aria-label="Time">${CLOCK_ICON}<span class="hud-time-sec">${timedSeconds.toFixed(2)}</span></span>`
        : `<span class="hud-m-stat hud-lives" aria-label="Lives">LIVES <span class="hud-lives-value">${gameConfig.startLives}</span></span>`;

    return `
      <div class="hud-pause-overlay" hidden aria-hidden="true"></div>
      <div class="hud-frenzy-border" aria-hidden="true"></div>
      <div class="hud-mobile-bar">
        <div class="hud-controls">
          <button type="button" class="hud-ctrl hud-pause-btn" aria-label="Pause" title="Pause">${PAUSE_ICON}</button>
          <button type="button" class="hud-ctrl hud-mute-btn" aria-label="Mute" title="Mute" aria-pressed="false">${SPEAKER_ICON}</button>
        </div>
        <div class="hud-mobile-stats">
          <span class="hud-m-stat hud-score" aria-label="Score">SCORE <span class="hud-score-num">0</span></span>
          <span class="hud-combo" aria-label="Combo" hidden>COMBO<span class="hud-combo-mult">2X</span></span>
          <span class="hud-m-stat hud-ammo" aria-label="Ammo"><span class="hud-ammo-icons">${teeth}</span></span>
          ${rightStat}
        </div>
        <button type="button" class="hud-reload-btn" aria-label="Reload" title="Reload">${RELOAD_ICON}</button>
      </div>
      ${frenzyMeter}
      ${this.pauseMenuMarkup()}
      <div class="hud-reload-hint" hidden>RELOAD! (shake or tap reload)</div>
    `;
  }

  private pauseMenuMarkup(): string {
    return `
      <div class="hud-pause-menu" hidden>
        <div class="hud-pause-menu-title">PAUSED</div>
        <nav class="hud-pause-nav" aria-label="Pause menu">
          <button type="button" class="menu-option" data-pause="resume">RESUME</button>
          <button type="button" class="menu-option" data-pause="options">OPTIONS</button>
          <button type="button" class="menu-option" data-pause="quit">QUIT TO MAIN MENU</button>
        </nav>
      </div>
      <div class="hud-pause-confirm" hidden>
        <p class="hud-pause-confirm-copy">Are you sure you want to quit to the main menu?</p>
        <div class="hud-pause-confirm-actions">
          <button type="button" class="menu-option" data-confirm="yes">YES</button>
          <button type="button" class="menu-option" data-confirm="no">NO</button>
        </div>
      </div>
      <div class="hud-pause-options" hidden></div>
    `;
  }

  private bindPauseMenu(): void {
    const bind = (el: HTMLElement | null, fn: () => void) => {
      el?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
    };
    bind(this.pauseMenu.querySelector('[data-pause="resume"]'), () => this.callbacks.onPauseToggle());
    bind(this.pauseMenu.querySelector('[data-pause="options"]'), () => this.openPauseOptions());
    bind(this.pauseMenu.querySelector('[data-pause="quit"]'), () => this.showQuitConfirm());
    bind(this.pauseConfirm.querySelector('[data-confirm="yes"]'), () => this.callbacks.onQuitToMenu());
    bind(this.pauseConfirm.querySelector('[data-confirm="no"]'), () => this.showPauseRoot());
  }

  private showPauseRoot(): void {
    this.closePauseOptions();
    this.pauseConfirm.hidden = true;
    this.pauseMenu.hidden = false;
  }

  private showQuitConfirm(): void {
    this.closePauseOptions();
    this.pauseMenu.hidden = true;
    this.pauseConfirm.hidden = false;
  }

  private openPauseOptions(): void {
    this.pauseMenu.hidden = true;
    this.pauseConfirm.hidden = true;
    this.closePauseOptions();
    this.pauseOptionsHost.hidden = false;
    this.optionsMenu = new OptionsMenu(this.pauseOptionsHost, {
      variant: 'overlay',
      onBack: () => this.showPauseRoot(),
    });
  }

  private closePauseOptions(): void {
    this.optionsMenu?.destroy();
    this.optionsMenu = null;
    this.pauseOptionsHost.replaceChildren();
    this.pauseOptionsHost.hidden = true;
  }

  isCapturingKeys(): boolean {
    return this.optionsMenu?.isCapturingKeys() ?? false;
  }

  private hearts(lives: number): string {
    const n = Math.max(0, lives);
    if (n === 0) return '<span class="hud-heart empty"><span class="hud-heart-zero">0</span></span>';
    return Array.from({ length: n }, () =>
      `<span class="hud-heart filled">${HEART_IMG}</span>`,
    ).join('');
  }

  setScore(score: number): void {
    this.scoreEl.textContent = Math.floor(score).toLocaleString('en-US');
  }

  /**
   * Endless frenzy meter fill amount (0–1).
   * During an active frenzy the bar stays frozen and gains a hot look.
   */
  setFrenzyMeter(fill01: number, active = false): void {
    if (this.frenzyFillEl && this.frenzyMeterEl) {
      const pct = Math.max(0, Math.min(1, fill01)) * 100;
      this.frenzyFillEl.style.width = `${pct}%`;
      this.frenzyMeterEl.classList.toggle('is-active', active);
    }
    this.root.classList.toggle('is-frenzy', active);
  }

  /** Center pop for Ready? / 3 / 2 / 1 / Go! at the start of a run. */
  showStartCountdown(label: string, opts?: { tick?: boolean; go?: boolean }): void {
    if (opts?.tick) playCountdownTickSound();
    const el = document.createElement('div');
    el.className = opts?.go ? 'hud-announce hud-start-countdown is-go' : 'hud-announce hud-start-countdown';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = label;
    this.root.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  /** Large centered “FRENZY” announce at the start of a frenzy. */
  showFrenzyAnnounce(): void {
    if (this.mode === 'timed') return;
    const el = document.createElement('div');
    el.className = 'hud-announce hud-frenzy-announce';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = 'FRENZY';
    this.root.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  /** Rapid center exclaim flash warning before the timed teeth flyby. */
  showTeethWarn(): void {
    const el = document.createElement('img');
    el.className = 'hud-teeth-warn';
    el.src = '/assets/hud/exclaim.png';
    el.alt = '';
    el.draggable = false;
    el.setAttribute('aria-hidden', 'true');
    this.root.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
    // Fallback if animationend is skipped (tab background / reduced motion).
    window.setTimeout(() => el.remove(), gameConfig.teethWarnFlashMs + 80);

    // Beep on every exclaim "on" frame; each play overlaps (does not wait).
    const cycle = gameConfig.teethWarnFlashCycleMs;
    const count = gameConfig.teethWarnFlashCount;
    for (let i = 0; i < count; i++) {
      window.setTimeout(() => playTeethWarnBeepSound(), i * cycle);
    }
  }

  setCombo(multiplier: number, progressShots = 0): void {
    const max = gameConfig.maxCombo;
    const perLevel = gameConfig.shotsPerComboLevel;
    const level = Math.max(1, Math.min(max, Math.floor(multiplier)));
    const progress = Math.max(0, Math.min(perLevel, Math.floor(progressShots)));
    const filled = level >= max ? perLevel : progress;
    const active = level > 1 || progress > 0;

    if (!active) {
      const visible = !this.comboEl.hidden;
      this.comboEl.classList.remove('active', 'max', 'pop');
      this.lastComboLevel = 1;
      if (visible && !this.comboEl.classList.contains('break')) this.startComboBreak();
      return;
    }

    const appearing = this.comboEl.hidden || this.comboEl.classList.contains('break');
    this.cancelComboBreak();
    if (this.comboTextEl) this.comboTextEl.textContent = `COMBO ${level}X`;
    else if (this.comboMultEl) this.comboMultEl.textContent = `${level}X`;
    this.comboEl.hidden = false;
    this.comboEl.classList.toggle('active', active);
    this.comboEl.classList.toggle('max', level >= max);
    this.comboEl.dataset.level = String(level);
    this.comboPips.forEach((pip, i) => pip.classList.toggle('filled', i < filled));
    this.comboTrackEl?.setAttribute('aria-valuenow', String(filled));
    if (appearing || level !== this.lastComboLevel) {
      this.comboEl.classList.remove('pop');
      void this.comboEl.offsetWidth;
      this.comboEl.classList.add('pop');
    }
    this.lastComboLevel = level;
  }

  private startComboBreak(): void {
    this.comboEl.classList.remove('pop');
    this.comboEl.classList.add('break');
    const finish = () => {
      if (!this.comboEl.classList.contains('break')) return;
      this.comboEl.classList.remove('break');
      this.comboEl.hidden = true;
    };
    this.comboEl.addEventListener('animationend', finish, { once: true });
    window.clearTimeout(this.comboBreakTimer);
    this.comboBreakTimer = window.setTimeout(finish, 380);
  }

  private cancelComboBreak(): void {
    window.clearTimeout(this.comboBreakTimer);
    this.comboEl.classList.remove('break');
  }

  setLives(lives: number): void {
    if (!this.livesEl) return;
    if (this.mobile) this.livesEl.textContent = String(Math.max(0, lives));
    else this.livesEl.innerHTML = this.hearts(lives);
    this.livesPanel?.classList.toggle('critical', lives <= 1);
  }

  setAmmo(current: number, max: number, reloading: boolean): void {
    if (this.ammoNumEl) this.ammoNumEl.textContent = String(current);

    if (this.ammoIconsEl) {
      let icons = this.ammoIconsEl.querySelectorAll('.hud-tooth');
      if (icons.length !== max) {
        this.ammoIconsEl.innerHTML = Array.from({ length: max }, () =>
          `<span class="hud-tooth filled">${TOOTH_IMG}</span>`,
        ).join('');
        icons = this.ammoIconsEl.querySelectorAll('.hud-tooth');
      }

      icons.forEach((el, i) => {
        const nowFilled = i < current;
        const wasEmpty = el.classList.contains('empty');
        el.classList.toggle('filled', nowFilled);
        el.classList.toggle('empty', !nowFilled);
        if (nowFilled && wasEmpty) {
          el.classList.remove('pop-in');
          void (el as HTMLElement).offsetWidth;
          el.classList.add('pop-in');
        }
      });
    }

    this.ammoPanel?.classList.toggle('reloading', reloading);
    this.ammoPanel?.classList.remove('empty', 'warn');
    this.reloadBtn?.classList.toggle('reloading', reloading);
    this.reloadBtn?.classList.toggle('is-empty', !reloading && current === 0);
    this.reloadHint.hidden = this.paused || reloading || current !== 0;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.pauseOverlay.hidden = !paused;
    this.pauseOverlay.setAttribute('aria-hidden', paused ? 'false' : 'true');
    this.root.classList.toggle('is-paused', paused);
    this.pauseBtn.innerHTML = paused ? PLAY_ICON : PAUSE_ICON;
    this.pauseBtn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
    this.pauseBtn.title = paused ? 'Resume' : 'Pause';
    if (paused) {
      this.reloadHint.hidden = true;
      this.showPauseRoot();
    } else {
      this.closePauseOptions();
      this.pauseMenu.hidden = true;
      this.pauseConfirm.hidden = true;
    }
  }

  setMuted(muted: boolean): void {
    this.muteBtn.innerHTML = muted ? MUTE_ICON : SPEAKER_ICON;
    this.muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    this.muteBtn.title = muted ? 'Unmute' : 'Mute';
    this.muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    this.muteBtn.classList.toggle('is-muted', muted);
  }

  setTimer(secondsLeft: number): void {
    if (!this.timerEl || !this.timerSecEl) return;
    const t = Math.max(0, secondsLeft);
    if (this.mobile) {
      this.timerSecEl.textContent = t.toFixed(2);
    } else {
      if (!this.timerMsEl) return;
      const totalMs = Math.max(0, Math.ceil(t * 1000));
      const s = Math.floor(totalMs / 1000);
      const ms = totalMs % 1000;
      this.timerSecEl.textContent = String(s);
      this.timerMsEl.textContent = ms.toString().padStart(3, '0');
    }
    this.timerEl.classList.toggle('critical', t <= 10);
    const finalBoostSeconds = this.timedConfig?.finalBoostSeconds ?? 30;
    const inFinale = t > 0 && t <= finalBoostSeconds;
    this.timerEl.classList.toggle('finale', inFinale);
    if (!this.thirtyBannerShown && secondsLeft <= finalBoostSeconds) {
      this.thirtyBannerShown = true;
      this.showThirtySecondsBanner(finalBoostSeconds);
    }
    const whole = Math.floor(t);
    if (whole >= 1 && whole <= 10 && whole !== this.lastCountdownSec) {
      this.lastCountdownSec = whole;
      this.showCountdownBeat(whole);
    }
  }

  /** One-shot marquee when timed mode hits the final stretch. */
  private showThirtySecondsBanner(finalBoostSeconds: number): void {
    const el = document.createElement('div');
    el.className = 'hud-announce hud-thirty-banner';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = `FINAL ${finalBoostSeconds}s · ${gameConfig.timedFinaleScoreMult}× SCORE`;
    this.root.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  /** Center pop for each whole second in the final 10. */
  private showCountdownBeat(sec: number): void {
    playCountdownTickSound();
    const el = document.createElement('div');
    el.className = 'hud-announce hud-countdown';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = String(sec);
    this.root.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  flashDryFire(): void {
    const el = this.reloadBtn ?? this.ammoPanel;
    if (!el) return;
    el.classList.add('flash');
    window.setTimeout(() => el.classList.remove('flash'), 250);
  }

  playShootAnim(): void {
    const ch = this.root.querySelector('.crosshair') as HTMLElement | null;
    if (ch) {
      ch.classList.remove('kick');
      void ch.offsetWidth;
      ch.classList.add('kick');
      window.setTimeout(() => ch.classList.remove('kick'), 180);
    }
  }

  spawnCrumbs(clientX: number, clientY: number): void {
    const colors = ['#e8c89a', '#d2a36a', '#c48a4a', '#f0d6b0', '#a8743c', '#fff1d6'];
    const count = this.mobile ? 6 + Math.floor(Math.random() * 4) : 14 + Math.floor(Math.random() * 8);
    for (let i = 0; i < count; i++) {
      const crumb = document.createElement('div');
      crumb.className = 'crumb';
      crumb.style.left = `${clientX}px`;
      crumb.style.top = `${clientY}px`;
      const size = 10 + Math.random() * 16;
      const dx = (Math.random() - 0.5) * 200;
      const dy = 50 + Math.random() * 160;
      const dur = 0.55 + Math.random() * 0.5;
      const rot = (Math.random() - 0.5) * 520;
      crumb.style.setProperty('--s', `${size.toFixed(1)}px`);
      crumb.style.setProperty('--dx', `${dx.toFixed(1)}px`);
      crumb.style.setProperty('--dy', `${dy.toFixed(1)}px`);
      crumb.style.setProperty('--dur', `${dur.toFixed(2)}s`);
      crumb.style.setProperty('--rot', `${rot.toFixed(0)}deg`);
      crumb.style.setProperty('--c', colors[Math.floor(Math.random() * colors.length)]!);
      this.root.appendChild(crumb);
      window.setTimeout(() => crumb.remove(), Math.ceil(dur * 1000) + 40);
    }
  }

  /** Soap-bubble pop burst — radial droplets + expanding ring. */
  spawnBubblePop(clientX: number, clientY: number): void {
    const colors = ['#ff4d8d', '#2ec7ff', '#ffffff', '#ff8fc4', '#5ee1ff', '#ffe566'];
    const host = document.body;

    const flash = document.createElement('div');
    flash.className = 'bubble-pop-flash';
    flash.style.left = `${clientX}px`;
    flash.style.top = `${clientY}px`;
    host.appendChild(flash);
    window.setTimeout(() => flash.remove(), 280);

    const ring = document.createElement('div');
    ring.className = 'bubble-pop-ring';
    ring.style.left = `${clientX}px`;
    ring.style.top = `${clientY}px`;
    host.appendChild(ring);
    window.setTimeout(() => ring.remove(), 480);

    const count = this.mobile ? 8 + Math.floor(Math.random() * 4) : 16 + Math.floor(Math.random() * 8);
    for (let i = 0; i < count; i++) {
      const drop = document.createElement('div');
      drop.className = 'bubble-pop';
      drop.style.left = `${clientX}px`;
      drop.style.top = `${clientY}px`;
      const size = 10 + Math.random() * 14;
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const dist = 70 + Math.random() * 110;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const dur = 0.45 + Math.random() * 0.3;
      drop.style.setProperty('--s', `${size.toFixed(1)}px`);
      drop.style.setProperty('--dx', `${dx.toFixed(1)}px`);
      drop.style.setProperty('--dy', `${dy.toFixed(1)}px`);
      drop.style.setProperty('--dur', `${dur.toFixed(2)}s`);
      drop.style.setProperty('--c', colors[Math.floor(Math.random() * colors.length)]!);
      host.appendChild(drop);
      window.setTimeout(() => drop.remove(), Math.ceil(dur * 1000) + 40);
    }
  }

  setPointer(x: number, y: number): void {
    const ch = this.root.querySelector('.crosshair') as HTMLElement | null;
    if (!ch) return;
    ch.style.setProperty('--x', `${x}px`);
    ch.style.setProperty('--y', `${y}px`);
  }

  /** HUD chrome the tutorial arrows can lock onto. */
  part(
    name: 'ammo' | 'combo' | 'lives' | 'frenzy' | 'pause' | 'mute' | 'reload' | 'score',
  ): HTMLElement | null {
    switch (name) {
      case 'ammo':
        return this.ammoPanel;
      case 'reload':
        return this.reloadBtn;
      case 'combo':
        return this.comboEl;
      case 'lives':
        return this.livesPanel ?? this.livesEl;
      case 'frenzy':
        return this.frenzyMeterEl;
      case 'pause':
        return this.pauseBtn;
      case 'mute':
        return this.muteBtn;
      case 'score':
        return this.scoreEl;
      default:
        return null;
    }
  }

  /** Keep the combo meter visible while the tutorial talks about it. */
  revealCombo(): void {
    this.cancelComboBreak();
    this.comboEl.hidden = false;
    this.comboEl.classList.add('active');
  }

  spawnFloater(clientX: number, clientY: number, text: string, color: string): void {
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${clientX}px`;
    el.style.top = `${clientY}px`;
    this.root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('go'));
    window.setTimeout(() => el.remove(), 750);
  }

  /** Slide score / ammo / time-or-lives on after the scene fade. Resolves in 0.5s. */
  playIntroSlide(): Promise<void> {
    if (!this.root.classList.contains('hud-intro-off')) return Promise.resolve();
    void this.root.offsetWidth;
    this.root.classList.add('hud-intro-in');
    this.root.classList.remove('hud-intro-off');
    return new Promise((resolve) => {
      window.clearTimeout(this.introSlideTimer);
      this.introSlideTimer = window.setTimeout(() => {
        this.introSlideTimer = 0;
        this.root.classList.remove('hud-intro-in');
        resolve();
      }, 500);
    });
  }

  destroy(): void {
    window.clearTimeout(this.introSlideTimer);
    this.introSlideTimer = 0;
    this.closePauseOptions();
    this.root.classList.remove('hud-intro-off', 'hud-intro-in');
    this.root.remove();
  }
}
