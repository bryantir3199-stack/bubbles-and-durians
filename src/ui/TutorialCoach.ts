import { TutorialSpeaker } from './TutorialSpeaker';

export interface TutorialCoachContent {
  index: number;
  total: number;
  title: string;
  body: string;
  wait?: string;
  /** When false, CONTINUE is visible but greyed out. */
  continueEnabled: boolean;
  /** When false, BACK is visible but greyed out (first step). */
  backEnabled: boolean;
}

const TYPE_CPS = 52;

const HIGHLIGHT_RE =
  /\bgold durians?|\bgreen durians?|\bdurians?|\bbubbles\b|\bchomping teeth|\bhearts?|\bcombo\b|\bfrenzy\b|\blife\b|\blives\b|\bendless\b|\btimed\b/gi;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightClass(match: string): string {
  const m = match.toLowerCase();
  if (m.startsWith('gold')) return 'tut-hl-gold';
  if (m.startsWith('bubble')) return 'tut-hl-bubble';
  if (m.includes('teeth')) return 'tut-hl-teeth';
  if (m.startsWith('heart')) return 'tut-hl-heart';
  if (m.startsWith('combo')) return 'tut-hl-combo';
  if (m.startsWith('frenzy')) return 'tut-hl-frenzy';
  if (m.startsWith('life')) return 'tut-hl-life';
  if (m.startsWith('endless') || m.startsWith('timed')) return 'tut-hl-mode';
  return 'tut-hl-durian';
}

function formatBody(text: string): string {
  return escapeHtml(text).replace(HIGHLIGHT_RE, (m) => `<span class="${highlightClass(m)}">${m}</span>`);
}

export class TutorialCoach {
  private root: HTMLElement;
  private kickerEl: HTMLElement;
  private titleEl: HTMLElement;
  private bodyEl: HTMLElement;
  private waitEl: HTMLElement;
  private caretEl: HTMLElement;
  private typeCursorEl: HTMLElement;
  private bubbleEl: HTMLElement;
  private nextBtn: HTMLButtonElement;
  private backBtn: HTMLButtonElement;
  private speaker: TutorialSpeaker;

  private fullBody = '';
  private typedLen = 0;
  private typeCarry = 0;
  private typed = false;
  private stepContinue = false;
  private queuedWait = '';

  constructor(
    parent: HTMLElement,
    private readonly callbacks: {
      onSkip: () => void;
      onQuit: () => void;
      onBack: () => void;
      onContinue: () => void;
    },
  ) {
    this.root = document.createElement('div');
    this.root.className = 'tut-coach';
    this.root.innerHTML = `
      <div class="tut-dialogue">
        <div class="tut-bubble">
          <div class="tut-bubble-head">
            <span class="tut-kicker">HOW TO PLAY</span>
            <div class="tut-actions">
              <button type="button" class="tut-btn tut-skip">SKIP</button>
              <button type="button" class="tut-btn tut-quit">MENU</button>
            </div>
          </div>
          <h2 class="tut-title"></h2>
          <p class="tut-body" aria-live="polite">
            <span class="tut-body-text"></span><span class="tut-type-cursor" aria-hidden="true">▌</span>
          </p>
          <p class="tut-wait" hidden></p>
          <span class="tut-caret" hidden aria-hidden="true">▼</span>
          <div class="tut-nav">
            <button type="button" class="tut-btn tut-back is-disabled" disabled>BACK</button>
            <button type="button" class="tut-btn tut-next is-disabled" disabled>CONTINUE</button>
          </div>
        </div>
      </div>
    `;
    parent.appendChild(this.root);

    this.kickerEl = this.root.querySelector('.tut-kicker')!;
    this.titleEl = this.root.querySelector('.tut-title')!;
    this.bodyEl = this.root.querySelector('.tut-body-text')!;
    this.typeCursorEl = this.root.querySelector('.tut-type-cursor')!;
    this.waitEl = this.root.querySelector('.tut-wait')!;
    this.caretEl = this.root.querySelector('.tut-caret')!;
    this.bubbleEl = this.root.querySelector('.tut-bubble')!;
    this.backBtn = this.root.querySelector('.tut-back')!;
    this.nextBtn = this.root.querySelector('.tut-next')!;

    this.speaker = new TutorialSpeaker();
    this.root.querySelector('.tut-dialogue')!.insertBefore(this.speaker.el, this.bubbleEl);

    this.bind(this.root.querySelector('.tut-skip')!, () => this.callbacks.onSkip());
    this.bind(this.root.querySelector('.tut-quit')!, () => this.callbacks.onQuit());
    this.bind(this.backBtn, () => {
      if (this.backBtn.disabled) return;
      this.callbacks.onBack();
    });
    this.bind(this.nextBtn, () => {
      if (this.nextBtn.disabled) return;
      this.callbacks.onContinue();
    });

    this.bubbleEl.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement | null)?.closest('button')) return;
      e.preventDefault();
      e.stopPropagation();
      if (!this.typed) {
        this.completeType();
        return;
      }
      if (this.stepContinue) this.callbacks.onContinue();
    });
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  set(content: TutorialCoachContent): void {
    this.kickerEl.textContent = `HOW TO PLAY · ${content.index} / ${content.total}`;
    this.titleEl.textContent = content.title;
    this.fullBody = content.body;
    this.typedLen = 0;
    this.typeCarry = 0;
    this.typed = false;
    this.queuedWait = content.wait ?? '';
    this.stepContinue = content.continueEnabled;
    this.bodyEl.innerHTML = '';
    this.typeCursorEl.hidden = false;
    this.caretEl.hidden = true;
    this.waitEl.classList.remove('tut-ok', 'tut-warn');
    this.waitEl.hidden = true;
    this.waitEl.textContent = '';
    this.speaker.setTalking(true);
    this.setBackEnabled(content.backEnabled);
    this.syncContinue();
    if (!this.fullBody) this.completeType();
  }

  update(dt: number): void {
    this.speaker.update(dt);
    if (this.typed || !this.fullBody) return;

    this.typeCarry += dt * TYPE_CPS;
    let add = Math.floor(this.typeCarry);
    if (add <= 0) return;
    this.typeCarry -= add;

    while (add > 0 && this.typedLen < this.fullBody.length) {
      const ch = this.fullBody[this.typedLen]!;
      this.typedLen += 1;
      add -= 1;
      if (ch === '.' || ch === '!' || ch === '?') this.typeCarry -= 0.12;
      else if (ch === ',') this.typeCarry -= 0.05;
    }

    this.bodyEl.innerHTML = formatBody(this.fullBody.slice(0, this.typedLen));
    if (this.typedLen >= this.fullBody.length) this.completeType();
  }

  setBackEnabled(enabled: boolean): void {
    this.backBtn.disabled = !enabled;
    this.backBtn.classList.toggle('is-disabled', !enabled);
    this.backBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  }

  setContinueEnabled(enabled: boolean): void {
    this.stepContinue = enabled;
    this.syncContinue();
  }

  setWait(text: string): void {
    this.queuedWait = '';
    this.waitEl.hidden = false;
    this.waitEl.textContent = text;
    this.waitEl.classList.remove('tut-ok', 'tut-warn');
  }

  feedback(text: string, kind: 'ok' | 'warn'): void {
    this.queuedWait = '';
    this.waitEl.hidden = false;
    this.waitEl.textContent = text;
    this.waitEl.classList.remove('tut-ok', 'tut-warn');
    this.waitEl.classList.add(kind === 'ok' ? 'tut-ok' : 'tut-warn');
  }

  destroy(): void {
    this.speaker.destroy();
    this.root.remove();
  }

  private completeType(): void {
    if (this.typed) return;
    this.typed = true;
    this.typedLen = this.fullBody.length;
    this.bodyEl.innerHTML = formatBody(this.fullBody);
    this.typeCursorEl.hidden = true;
    this.speaker.setTalking(false);
    if (this.queuedWait) {
      this.waitEl.hidden = false;
      this.waitEl.textContent = this.queuedWait;
      this.queuedWait = '';
    }
    this.syncContinue();
  }

  private syncContinue(): void {
    const enabled = this.stepContinue && this.typed;
    this.nextBtn.disabled = !enabled;
    this.nextBtn.classList.toggle('is-disabled', !enabled);
    this.nextBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    this.caretEl.hidden = !enabled;
  }

  private bind(el: HTMLElement, fn: () => void): void {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
  }
}
