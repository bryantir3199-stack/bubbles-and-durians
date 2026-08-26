import type { GameMode, TimedPreset, TimedRunTally } from '../config/gameConfig';
import { defaultTimedPreset, gameConfig, getTimedPreset } from '../config/gameConfig';
import type { GameScene, SceneContext, SceneData } from '../core/types';
import { clearUI, panel, bindClick } from '../ui/dom';

export class BonusTallyScene implements GameScene {
  readonly id = 'bonusTally' as const;
  private mode: GameMode = 'timed';
  private timedPreset: TimedPreset | undefined;
  private timedTally: TimedRunTally | undefined;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  private tallyInfoWrap: HTMLElement | null = null;
  private tallyInfoBtn: HTMLButtonElement | null = null;

  constructor(private ctx: SceneContext) {}

  enter(data?: SceneData): void {
    this.mode = data?.mode ?? 'timed';
    this.timedPreset = data?.timedPreset;
    this.timedTally = data?.timedTally;

    clearUI(this.ctx.uiRoot);
    const ui = panel(
      'menu bonus-tally',
      `<div class="menu-card">
        <h1 class="danger">GAME OVER</h1>
        <p class="muted">${this.modeLabel()}</p>
        ${this.scoreMarkup()}
        <div class="btn-row">
          <button type="button" class="btn primary" data-action="continue">CONTINUE</button>
        </div>
      </div>`,
    );
    this.ctx.uiRoot.appendChild(ui);
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
        event.preventDefault();
        this.ctx.goto('gameOver', {
          mode: this.mode,
          timedPreset: this.timedPreset,
          timedTally: this.timedTally,
        });
      }
    };
    window.addEventListener('keydown', this.onKey);

    this.ctx.three.camera.position.set(0, 110, 635);
    this.ctx.three.camera.lookAt(0, 110, 40);
  }

  update(): void {}

  exit(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    this.tallyInfoWrap = null;
    this.tallyInfoBtn = null;
    clearUI(this.ctx.uiRoot);
  }

  private modeLabel(): string {
    if (this.mode === 'tutorial') return 'How to Play';
    if (this.mode === 'endless') return 'Endless Mode';
    const preset = getTimedPreset(this.timedPreset ?? defaultTimedPreset);
    return `Timed Mode · ${preset.label} (${preset.seconds}s)`;
  }

  private scoreMarkup(): string {
    const tally = this.timedTally;
    if (!tally) {
      return `<p class="score-big">Score: ${this.fmt(0)}</p>`;
    }
    const bonus = (n: number) => (n > 0 ? 'is-earned' : 'is-missed');
    const finale =
      tally.finaleScore > 0
        ? `<div class="tally-row tally-included"><span>FINALE</span><span>${this.fmt(tally.finaleScore)}</span></div>`
        : '';
    return `<div class="run-tally" aria-label="Round tally">
      <div class="tally-info">
        <button type="button" class="tally-info-btn" aria-label="How bonuses work" aria-expanded="false" aria-describedby="tally-info-bubble">i</button>
        <div class="tally-info-bubble" id="tally-info-bubble" role="tooltip" aria-hidden="true">${this.bonusInfoMarkup()}</div>
      </div>
      <div class="tally-row"><span>SCORE</span><span>${this.fmt(tally.runScore)}</span></div>
      ${finale}
      <div class="tally-row ${bonus(tally.maxComboBonus)}"><span>MAX COMBO</span><span>+${this.fmt(tally.maxComboBonus)}</span></div>
      <div class="tally-row ${bonus(tally.comboHoldBonus)}"><span>COMBO HOLD</span><span>+${this.fmt(tally.comboHoldBonus)}</span></div>
      <div class="tally-row ${bonus(tally.cleanRoundBonus)}"><span>CLEAN ROUND</span><span>+${this.fmt(tally.cleanRoundBonus)}</span></div>
      <div class="tally-row ${tally.accuracyPct >= 100 ? 'is-earned' : tally.accuracyPct <= 0 ? 'is-missed' : ''}"><span>ACCURACY</span><span>× ${tally.accuracyPct}%</span></div>
      <div class="tally-row tally-total"><span>TOTAL</span><span>${this.fmt(tally.total)}</span></div>
    </div>`;
  }

  private bonusInfoMarkup(): string {
    const max = gameConfig.maxCombo;
    const finaleSecs = getTimedPreset(this.timedPreset ?? defaultTimedPreset).finalBoostSeconds;
    return `<p class="tally-info-title">Round bonuses</p>
      <ul class="tally-info-list">
        <li><strong>Max combo</strong> — hit ${max}× at least once. +${this.fmt(gameConfig.timedBonusMaxCombo)}</li>
        <li><strong>Combo hold</strong> — +${this.fmt(gameConfig.timedBonusPerSecAtMaxCombo)} per second spent at ${max}×.</li>
        <li><strong>Clean round</strong> — don't shoot any bubbles. +${this.fmt(gameConfig.timedBonusCleanRound)}</li>
        <li><strong>Finale</strong> — last ${finaleSecs}s, durian/gold score ${gameConfig.timedFinaleScoreMult}× (already in SCORE).</li>
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
