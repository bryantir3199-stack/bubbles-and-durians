import type { GameMode, TimedPreset, TimedRunTally } from '../config/gameConfig';
import { defaultTimedPreset, gameConfig, getTimedPreset } from '../config/gameConfig';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import {
  playTallyCalcDrumroll,
  playTallyRevealDrumroll,
  playTallyThudSound,
  stopTallyCalcDrumroll,
} from '../audio/sfx';
import { dummyTimedTally, wantsBonusTallyPreview } from '../debug/pathDebug';
import { clearUI, panel, bindClick } from '../ui/dom';
import { isResultsCrashHeld, playResultsCrash } from '../ui/resultsCrash';

interface TallyRow {
  label: string;
  target: number;
  prefix: string;
  suffix: string;
  cssClass: string;
  isTotal?: boolean;
}

export class BonusTallyScene implements GameScene {
  readonly id = 'bonusTally' as const;
  private mode: GameMode = 'timed';
  private timedPreset: TimedPreset | undefined;
  private timedTally: TimedRunTally | undefined;
  private onKey: ((e: KeyboardEvent) => void) | null = null;
  private animationHandle: number | null = null;
  private slamHitTimer = 0;
  private slamShakeTimer = 0;
  private startTimer = 0;
  private previewClick: ((e: PointerEvent) => void) | null = null;
  private continueBtn: HTMLButtonElement | null = null;

  private tallyInfoWrap: HTMLElement | null = null;
  private tallyInfoBtn: HTMLButtonElement | null = null;

  constructor(private ctx: SceneContext) {}

  async enter(data?: SceneData): Promise<void> {
    this.mode = data?.mode ?? 'timed';
    this.timedPreset = data?.timedPreset;
    this.timedTally = data?.timedTally;
    if (wantsBonusTallyPreview()) {
      this.mode = 'timed';
      this.timedPreset = this.timedPreset ?? 'short';
      this.timedTally = this.timedTally ?? dummyTimedTally();
    }

    if (!isResultsCrashHeld()) await playResultsCrash();

    clearUI(this.ctx.uiRoot);
    const ui = panel(
      'menu bonus-tally',
      `<div class="menu-card">
        <h1 class="danger">GAME OVER</h1>
        <p class="muted">${this.modeLabel()}${
          wantsBonusTallyPreview() ? '<br>Click to start tally preview' : ''
        }</p>
        ${this.scoreMarkup()}
        <div class="btn-row">
          <button type="button" class="btn primary" data-action="continue" disabled>CONTINUE</button>
        </div>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);
    this.continueBtn = ui.querySelector('[data-action="continue"]');
    this.bindBonusInfo(ui);

    bindClick(ui, '[data-action="continue"]', () => {
      this.ctx.goto('gameOver', {
        mode: this.mode,
        timedPreset: this.timedPreset,
        timedTally: this.timedTally,
      });
    });

    this.onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.setBonusInfoOpen(false);
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        if (this.continueBtn && !this.continueBtn.disabled) {
          event.preventDefault();
          this.ctx.goto('gameOver', {
            mode: this.mode,
            timedPreset: this.timedPreset,
            timedTally: this.timedTally,
          });
        }
      }
    };
    window.addEventListener('keydown', this.onKey);

    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);

    if (wantsBonusTallyPreview()) {
      this.previewClick = () => {
        this.clearPreviewClick();
        this.animateScores();
      };
      window.addEventListener('pointerdown', this.previewClick, { once: true });
    } else {
      this.startTimer = window.setTimeout(() => this.animateScores(), 180);
    }
  }

  update(): void {}

  exit(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    this.tallyInfoWrap = null;
    this.tallyInfoBtn = null;
    this.continueBtn = null;
    this.clearPreviewClick();
    window.clearTimeout(this.startTimer);
    this.startTimer = 0;
    if (this.animationHandle !== null) {
      cancelAnimationFrame(this.animationHandle);
      this.animationHandle = null;
    }
    window.clearTimeout(this.slamHitTimer);
    this.slamHitTimer = 0;
    window.clearTimeout(this.slamShakeTimer);
    this.slamShakeTimer = 0;
    stopTallyCalcDrumroll(0);
    clearUI(this.ctx.uiRoot);
  }

  private clearPreviewClick(): void {
    if (!this.previewClick) return;
    window.removeEventListener('pointerdown', this.previewClick);
    this.previewClick = null;
  }

  private modeLabel(): string {
    if (this.mode === 'tutorial') return 'How to Play';
    if (this.mode === 'endless') return 'Endless Mode';
    const preset = getTimedPreset(this.timedPreset ?? defaultTimedPreset);
    return `Timed Mode · ${preset.label} (${preset.seconds}s)`;
  }

  private getTallyRows(): TallyRow[] {
    const tally = this.timedTally;
    if (!tally) return [];

    const bonus = (n: number) => (n > 0 ? 'is-earned' : 'is-missed');
    const rows: TallyRow[] = [
      { label: 'SCORE', target: tally.runScore, prefix: '', suffix: '', cssClass: '' },
    ];

    rows.push(
      { label: 'MAX COMBO', target: tally.maxComboBonus, prefix: '+', suffix: '', cssClass: bonus(tally.maxComboBonus) },
      { label: 'COMBO HOLD', target: tally.comboHoldBonus, prefix: '+', suffix: '', cssClass: bonus(tally.comboHoldBonus) },
      { label: 'CLEAN ROUND', target: tally.cleanRoundBonus, prefix: '+', suffix: '', cssClass: bonus(tally.cleanRoundBonus) },
      { label: 'ACCURACY', target: tally.accuracyPct, prefix: '× ', suffix: '%', cssClass: tally.accuracyPct >= 100 ? 'is-earned' : tally.accuracyPct <= 0 ? 'is-missed' : '' },
      { label: 'TOTAL', target: tally.total, prefix: '', suffix: '', cssClass: 'tally-total', isTotal: true },
    );

    return rows;
  }

  private scoreMarkup(): string {
    const tally = this.timedTally;
    if (!tally) {
      return `<p class="score-big">Score: ${this.fmt(0)}</p>`;
    }

    const rows = this.getTallyRows();
    const rowsHtml = rows.map((row, i) => {
      const baseClass = `tally-row ${row.cssClass}`.trim();
      const totalClass = row.isTotal ? 'tally-total-value' : '';
      return `<div class="${baseClass}" data-row-index="${i}">
        <span>${row.label}</span>
        <span class="tally-value ${totalClass}" data-target="${row.target}" data-prefix="${row.prefix}" data-suffix="${row.suffix}">${row.prefix}0${row.suffix}</span>
      </div>`;
    }).join('\n      ');

    return `<div class="run-tally" aria-label="Round tally">
      <div class="tally-info">
        <button type="button" class="tally-info-btn" aria-label="How bonuses work" aria-expanded="false" aria-describedby="tally-info-bubble">i</button>
        <div class="tally-info-bubble" id="tally-info-bubble" role="tooltip" aria-hidden="true">${this.bonusInfoMarkup()}</div>
      </div>
      ${rowsHtml}
    </div>`;
  }

  private animateScores(): void {
    const rows = this.ctx.uiRoot.querySelectorAll<HTMLElement>('.tally-row');
    if (rows.length === 0) return;

    let currentRowIndex = 0;
    const countDurationMs = 500;
    const delayBetweenRows = 250;

    playTallyCalcDrumroll();

    const animateRow = (rowIndex: number) => {
      if (rowIndex >= rows.length) {
        stopTallyCalcDrumroll(0.08);
        if (this.continueBtn) {
          this.continueBtn.disabled = false;
        }
        return;
      }

      const row = rows[rowIndex];
      const valueEl = row.querySelector<HTMLElement>('.tally-value');
      if (!valueEl) {
        window.setTimeout(() => animateRow(rowIndex + 1), delayBetweenRows);
        return;
      }

      const target = parseInt(valueEl.dataset.target ?? '0', 10);
      const prefix = valueEl.dataset.prefix ?? '';
      const suffix = valueEl.dataset.suffix ?? '';
      const isTotal = valueEl.classList.contains('tally-total-value');

      row.classList.add('tally-row-active');

      const startTime = performance.now();
      const duration = isTotal ? countDurationMs * 2 : countDurationMs;

      const tick = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = this.easeOutQuart(progress);
        const current = Math.round(eased * target);

        valueEl.textContent = `${prefix}${this.fmt(current)}${suffix}`;

        if (progress < 1) {
          this.animationHandle = requestAnimationFrame(tick);
        } else {
          valueEl.textContent = `${prefix}${this.fmt(target)}${suffix}`;
          row.classList.remove('tally-row-active');

          if (isTotal) {
            this.slamEffect(row, valueEl);
            window.setTimeout(() => animateRow(rowIndex + 1), 650);
          } else {
            window.setTimeout(() => animateRow(rowIndex + 1), delayBetweenRows);
          }
        }
      };

      this.animationHandle = requestAnimationFrame(tick);
    };

    animateRow(currentRowIndex);
  }

  private slamEffect(row: HTMLElement, valueEl: HTMLElement): void {
    valueEl.classList.add('slam-pop');
    row.classList.add('slam-pop');

    window.clearTimeout(this.slamShakeTimer);
    this.slamShakeTimer = window.setTimeout(() => {
      this.slamShakeTimer = 0;
      const menuCard = this.ctx.uiRoot.querySelector<HTMLElement>('.menu-card');
      if (menuCard) {
        menuCard.classList.add('screen-shake');
        window.setTimeout(() => menuCard.classList.remove('screen-shake'), 500);
      }
    }, 350);

    window.clearTimeout(this.slamHitTimer);
    this.slamHitTimer = window.setTimeout(() => {
      this.slamHitTimer = 0;
      valueEl.classList.remove('slam-pop');
      row.classList.remove('slam-pop');
      stopTallyCalcDrumroll(0.06);
      playTallyRevealDrumroll();
      playTallyThudSound();
    }, 650);
  }

  private easeOutQuart(t: number): number {
    return 1 - Math.pow(1 - t, 4);
  }

  private bonusInfoMarkup(): string {
    const max = gameConfig.maxCombo;
    return `<p class="tally-info-title">Round bonuses</p>
      <ul class="tally-info-list">
        <li><strong>Max combo</strong> — hit ${max}× at least once. +${this.fmt(gameConfig.timedBonusMaxCombo)}</li>
        <li><strong>Combo hold</strong> — +${this.fmt(gameConfig.timedBonusPerSecAtMaxCombo)} per second spent at ${max}×.</li>
        <li><strong>Clean round</strong> — don't shoot any bubbles. +${this.fmt(gameConfig.timedBonusCleanRound)}</li>
        <li><strong>Accuracy</strong> — durian hits ÷ shots fired (bubbles and misses count against you). Multiplies your total. No shots is 0%.</li>
      </ul>`;
  }

  private bindBonusInfo(root: HTMLElement): void {
    const wrap = root.querySelector<HTMLElement>('.tally-info');
    const btn = root.querySelector<HTMLButtonElement>('.tally-info-btn');
    if (!wrap || !btn) return;
    this.tallyInfoWrap = wrap;
    this.tallyInfoBtn = btn;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setBonusInfoOpen(!wrap.classList.contains('is-open'));
    });

    root.addEventListener('pointerdown', (e) => {
      if (!wrap.classList.contains('is-open')) return;
      if (wrap.contains(e.target as Node)) return;
      this.setBonusInfoOpen(false);
    });
  }

  private setBonusInfoOpen(open: boolean): void {
    const wrap = this.tallyInfoWrap;
    const btn = this.tallyInfoBtn;
    if (!wrap || !btn) return;
    wrap.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    wrap.querySelector('.tally-info-bubble')?.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  private fmt(n: number): string {
    return n.toLocaleString('en-US');
  }
}
