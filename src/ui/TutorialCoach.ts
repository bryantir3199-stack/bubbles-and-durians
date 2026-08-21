export interface TutorialCoachContent {
  index: number;
  total: number;
  title: string;
  body: string;
  wait?: string;
  continueLabel?: string;
}

export class TutorialCoach {
  private root: HTMLElement;
  private kickerEl: HTMLElement;
  private titleEl: HTMLElement;
  private bodyEl: HTMLElement;
  private waitEl: HTMLElement;
  private nextBtn: HTMLButtonElement;

  constructor(
    parent: HTMLElement,
    private readonly callbacks: {
      onSkip: () => void;
      onQuit: () => void;
      onContinue: () => void;
    },
  ) {
    this.root = document.createElement('div');
    this.root.className = 'tut-coach';
    this.root.innerHTML = `
      <div class="tut-top">
        <span class="tut-kicker">TUTORIAL</span>
        <div class="tut-actions">
          <button type="button" class="tut-btn tut-skip">SKIP</button>
          <button type="button" class="tut-btn tut-quit">MENU</button>
        </div>
      </div>
      <h2 class="tut-title"></h2>
      <p class="tut-body" aria-live="polite"></p>
      <p class="tut-wait" hidden></p>
      <button type="button" class="tut-btn tut-next" hidden>CONTINUE</button>
    `;
    parent.appendChild(this.root);

    this.kickerEl = this.root.querySelector('.tut-kicker')!;
    this.titleEl = this.root.querySelector('.tut-title')!;
    this.bodyEl = this.root.querySelector('.tut-body')!;
    this.waitEl = this.root.querySelector('.tut-wait')!;
    this.nextBtn = this.root.querySelector('.tut-next')!;

    this.bind(this.root.querySelector('.tut-skip')!, () => this.callbacks.onSkip());
    this.bind(this.root.querySelector('.tut-quit')!, () => this.callbacks.onQuit());
    this.bind(this.nextBtn, () => this.callbacks.onContinue());
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  set(content: TutorialCoachContent): void {
    this.kickerEl.textContent = `TUTORIAL · ${content.index} / ${content.total}`;
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
    if (content.continueLabel) {
      this.nextBtn.hidden = false;
      this.nextBtn.textContent = content.continueLabel;
    } else {
      this.nextBtn.hidden = true;
    }
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
