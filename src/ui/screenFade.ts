import { fadeOutMenuBgm, fadeOutResultsBgm, fadeOutStageBgm } from '../audio/sfx';

const FADE_MS = 500;
const HOLD_MS = 3000;

export type FadeTint = 'white' | 'black';

let overlay: HTMLElement | null = null;

export function attachScreenFade(host: HTMLElement): void {
  overlay = document.createElement('div');
  overlay.className = 'screen-fade';
  overlay.setAttribute('aria-hidden', 'true');
  host.appendChild(overlay);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function waitOpacityTransition(): Promise<void> {
  if (!overlay) return Promise.resolve();
  return new Promise((resolve) => {
    const el = overlay!;
    const fallback = window.setTimeout(() => {
      el.removeEventListener('transitionend', onEnd);
      resolve();
    }, FADE_MS + 80);
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== el || e.propertyName !== 'opacity') return;
      window.clearTimeout(fallback);
      el.removeEventListener('transitionend', onEnd);
      resolve();
    };
    el.addEventListener('transitionend', onEnd);
  });
}

function applyTint(tint: FadeTint): void {
  overlay?.classList.toggle('is-black', tint === 'black');
}

/** Fade the view to a solid tint, then hold for 3s. */
export async function fadeToAndHold(tint: FadeTint): Promise<void> {
  if (!overlay) return;
  applyTint(tint);
  if (tint === 'black') {
    fadeOutStageBgm(FADE_MS / 1000);
    fadeOutResultsBgm(FADE_MS / 1000);
  } else {
    fadeOutMenuBgm(FADE_MS / 1000);
  }
  overlay.classList.add('is-on');
  await waitOpacityTransition();
  await wait(HOLD_MS);
}

export function fadeToWhiteAndHold(): Promise<void> {
  return fadeToAndHold('white');
}

export function fadeToBlackAndHold(): Promise<void> {
  return fadeToAndHold('black');
}

/** Crossfade from the solid overlay into the current scene. */
export async function fadeFromOverlay(): Promise<void> {
  if (!overlay || !overlay.classList.contains('is-on')) return;
  overlay.classList.remove('is-on');
  await waitOpacityTransition();
  overlay.classList.remove('is-black');
}

/** Resolves once the overlay is gone (or if it was never shown). */
export function waitUntilFadeClear(): Promise<void> {
  if (!overlay || !overlay.classList.contains('is-on')) return Promise.resolve();
  return new Promise((resolve) => {
    const el = overlay!;
    const fallback = window.setTimeout(() => {
      el.removeEventListener('transitionend', onEnd);
      resolve();
    }, FADE_MS + 200);
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== el || e.propertyName !== 'opacity') return;
      if (el.classList.contains('is-on')) return;
      window.clearTimeout(fallback);
      el.removeEventListener('transitionend', onEnd);
      resolve();
    };
    el.addEventListener('transitionend', onEnd);
  });
}
