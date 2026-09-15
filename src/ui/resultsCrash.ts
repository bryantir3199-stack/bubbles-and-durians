import { playResultsSlamSound, stopResultsBgm } from '../audio/sfx';

const SLAM_MS = 320;
const IMPACT_MS = Math.round(SLAM_MS * 0.72);
const HIT_MS = 380;

let overlay: HTMLElement | null = null;
let playing = false;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function attachResultsCrash(host: HTMLElement): void {
  overlay = document.createElement('div');
  overlay.className = 'results-crash';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML =
    '<div class="results-crash-bleed">' +
    '<div class="results-crash-pane results-crash-top"></div>' +
    '<div class="results-crash-pane results-crash-bottom"></div>' +
    '<div class="results-crash-flash"></div>' +
    '</div>';
  host.appendChild(overlay);
}

export function isResultsCrashHeld(): boolean {
  return !!overlay?.classList.contains('is-held');
}

export function hideResultsCrash(): void {
  stopResultsBgm();
  if (!overlay) return;
  overlay.className = 'results-crash';
  document.body.classList.remove('results-crash-on');
  playing = false;
}

/** Show the results plaque immediately, with no slam. */
export function holdResultsCrash(): void {
  if (!overlay) return;
  overlay.className = 'results-crash is-held';
  document.body.classList.add('results-crash-on');
  playing = false;
}

/**
 * Split plaque slams together from off-screen, then stays as the results backdrop.
 */
export async function playResultsCrash(): Promise<void> {
  if (!overlay) return;
  if (overlay.classList.contains('is-held') || playing) return;

  playing = true;
  overlay.className = 'results-crash is-playing';
  document.body.classList.add('results-crash-on');
  overlay.getBoundingClientRect();
  overlay.classList.add('is-slam');
  await wait(IMPACT_MS);
  playResultsSlamSound();
  overlay.classList.add('is-hit');
  await wait(SLAM_MS - IMPACT_MS + HIT_MS);
  overlay.classList.remove('is-playing', 'is-slam', 'is-hit');
  overlay.classList.add('is-held');
  playing = false;
}

function plaqueSrc(): string {
  return document.documentElement.classList.contains('touch-ui')
    ? 'assets/results-plaque-mobile.jpg'
    : 'assets/results-plaque.jpg';
}

export function preloadResultsCrash(): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = plaqueSrc();
  });
}
