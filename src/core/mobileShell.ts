import {
  isCoarsePointer,
  isFullscreen,
  isIPhone,
  isStandaloneDisplay,
  tryEnterFullscreen,
} from './display';

/**
 * Make the game fill the phone screen:
 * - Mark touch UI (hide mouse reticle via CSS)
 * - Request fullscreen on the first tap (Android / iPad)
 * - On iPhone Safari, allow a 1px scroll so landscape chrome can collapse,
 *   then lock overflow once the address bar is gone
 */
export function installMobileShell(): void {
  const root = document.documentElement;
  root.classList.toggle('touch-ui', isCoarsePointer());

  if (isStandaloneDisplay()) {
    root.classList.add('ios-locked');
    return;
  }

  const hint = document.createElement('div');
  hint.className = 'fs-hint';
  hint.hidden = true;
  hint.setAttribute('aria-hidden', 'true');
  hint.textContent = 'Swipe to hide the browser bar';
  document.body.appendChild(hint);

  const chromeVisible = (): boolean => {
    if (!isIPhone() || isFullscreen() || isStandaloneDisplay()) return false;
    const landscape = window.innerWidth > window.innerHeight;
    if (!landscape) return false;
    const vv = window.visualViewport;
    const screenShort = Math.min(window.screen.width, window.screen.height);
    if (!vv) return true;
    return vv.height + vv.offsetTop < screenShort - 24;
  };

  const sync = () => {
    const showChromeHack = isIPhone() && !isStandaloneDisplay() && !isFullscreen();
    const open = showChromeHack && chromeVisible();
    root.classList.toggle('ios-chrome', open);
    root.classList.toggle('ios-locked', showChromeHack && !open);
    hint.hidden = !open;
  };

  sync();
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', () => {
    sync();
    window.setTimeout(sync, 280);
  });
  window.visualViewport?.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('scroll', sync);
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync as EventListener);

  const onGesture = () => {
    tryEnterFullscreen();
    if (root.classList.contains('ios-chrome')) window.scrollTo(0, 1);
    sync();
  };
  window.addEventListener('pointerdown', onGesture, { passive: true });
  window.addEventListener('touchend', onGesture, { passive: true });
}
