/** Shared DOM helpers for menu screens. */

export function clearUI(root: HTMLElement): void {
  root.replaceChildren();
  root.className = 'ui-root';
}

export function panel(className: string, html: string): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  el.innerHTML = html;
  return el;
}

export function bindClick(root: HTMLElement, selector: string, fn: () => void): void {
  root.querySelector(selector)?.addEventListener('click', (e) => {
    e.stopPropagation();
    fn();
  });
}

/** Same blink used by main-menu tiles before navigating. */
export function flashThen(el: HTMLElement, next: () => void, ms = 750): number {
  el.classList.add('is-selecting');
  return window.setTimeout(next, ms);
}
