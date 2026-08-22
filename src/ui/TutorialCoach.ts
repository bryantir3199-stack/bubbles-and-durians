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

export class TutorialCoach {
  private root: HTMLElement;
  private kickerEl: HTMLElement;
  private titleEl: HTMLElement;
  private bodyEl: HTMLElement;
  private waitEl: HTMLElement;
  private nextBtn: HTMLButtonElement;
  private backBtn: HTMLButtonElement;

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
      <div class="tut-top">
        <span class="tut-kicker">HOW TO PLAY</span>
        <div class="tut-actions">
          <button type="button" class="tut-btn tut-skip">SKIP</button>
          <button type="button" class="tut-btn tut-quit">MENU</button>
        </div>
      </div>
      <h2 class="tut-title"></h2>
      <p class="tut-body" aria-live="polite"></p>
      <p class="tut-wait" hidden></p>
      <div class="tut-nav">
        <button type="button" class="tut-btn tut-back is-disabled" disabled>BACK</button>
        <button type="button" class="tut-btn tut-next is-disabled" disabled>CONTINUE</button>
      </div>
    `;
    parent.appendChild(this.root);

    this.kickerEl = this.root.querySelector('.tut-kicker')!;
    this.titleEl = this.root.querySelector('.tut-title')!;
    this.bodyEl = this.root.querySelector('.tut-body')!;
    this.waitEl = this.root.querySelector('.tut-wait')!;
    this.backBtn = this.root.querySelector('.tut-back')!;
    this.nextBtn = this.root.querySelector('.tut-next')!;

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
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  set(content: TutorialCoachContent): void {
    this.kickerEl.textContent = `HOW TO PLAY · ${content.index} / ${content.total}`;
    this.titleEl.textContent = content.title;
    this.bodyEl.textContent = content.body;
    this.waitEl.classList.remove('tut-ok', 'tut-warn');
    if (content.wait) {
      this.waitEl.hidden = false;
      this.waitEl.textContent = content.wait;
    } else {
      this.waitEl.hidden = true;
      this.waitEl.textContent = '';
    }
    this.setContinueEnabled(content.continueEnabled);
    this.setBackEnabled(content.backEnabled);
  }

  setBackEnabled(enabled: boolean): void {
    this.backBtn.disabled = !enabled;
    this.backBtn.classList.toggle('is-disabled', !enabled);
    this.backBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  }

  setContinueEnabled(enabled: boolean): void {
    this.nextBtn.disabled = !enabled;
    this.nextBtn.classList.toggle('is-disabled', !enabled);
    this.nextBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  }

  setWait(text: string): void {
    this.waitEl.hidden = false;
    this.waitEl.textContent = text;
    this.waitEl.classList.remove('tut-ok', 'tut-warn');
  }

  feedback(text: string, kind: 'ok' | 'warn'): void {
    this.waitEl.hidden = false;
    this.waitEl.textContent = text;
    this.waitEl.classList.remove('tut-ok', 'tut-warn');
    this.waitEl.classList.add(kind === 'ok' ? 'tut-ok' : 'tut-warn');
  }

  destroy(): void {
    this.root.remove();
  }

  private bind(el: HTMLElement, fn: () => void): void {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
  }
}
