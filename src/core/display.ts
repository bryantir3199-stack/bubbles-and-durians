/**
 * Viewport, camera framing, and mobile helpers.
 *
 * Desktop is authored at 16:9 with a 42° vertical FOV. Wider viewports
 * (landscape phones) would otherwise show more of the world and look zoomed
 * out — we shrink vertical FOV so horizontal coverage matches the design.
 */

export const DESIGN_VFOV_DEG = 42;
export const DESIGN_ASPECT = 16 / 9;

export function isCoarsePointer(): boolean {
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(hover: none)').matches
  );
}

export function isFullscreen(): boolean {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return !!(document.fullscreenElement || doc.webkitFullscreenElement);
}

type FsEl = HTMLElement & {
  requestFullscreen?: (opts?: FullscreenOptions) => Promise<void>;
  webkitRequestFullscreen?: () => void;
};

export function canUseFullscreen(target: HTMLElement = document.documentElement): boolean {
  const el = target as FsEl;
  const doc = document as Document & { webkitExitFullscreen?: () => void };
  return !!(el.requestFullscreen || el.webkitRequestFullscreen || document.exitFullscreen || doc.webkitExitFullscreen);
}

/** Best-effort fullscreen on a user gesture (Android / iPad). iPhone Safari ignores this. */
export function tryEnterFullscreen(target: HTMLElement = document.documentElement): void {
  if (isFullscreen()) return;
  const el = target as FsEl;
  try {
    if (el.requestFullscreen) {
      void el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
        el.webkitRequestFullscreen?.();
      });
    } else {
      el.webkitRequestFullscreen?.();
    }
  } catch {
    // iPhone Safari has no Fullscreen API for arbitrary elements.
  }
}

export function tryExitFullscreen(): void {
  if (!isFullscreen()) return;
  const doc = document as Document & { webkitExitFullscreen?: () => void };
  try {
    if (document.exitFullscreen) {
      void document.exitFullscreen().catch(() => {
        doc.webkitExitFullscreen?.();
      });
    } else {
      doc.webkitExitFullscreen?.();
    }
  } catch {
    // ignore
  }
}

export function toggleFullscreen(target: HTMLElement = document.documentElement): void {
  if (isFullscreen()) tryExitFullscreen();
  else tryEnterFullscreen(target);
}

export type ViewSize = {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
};

/** Visible CSS pixels, including iOS visualViewport (address-bar-aware). */
export function getViewSize(): ViewSize {
  const vv = window.visualViewport;
  if (vv && vv.width > 0 && vv.height > 0) {
    return {
      width: Math.max(1, Math.round(vv.width)),
      height: Math.max(1, Math.round(vv.height)),
      offsetLeft: vv.offsetLeft,
      offsetTop: vv.offsetTop,
    };
  }
  return {
    width: Math.max(1, window.innerWidth),
    height: Math.max(1, window.innerHeight),
    offsetLeft: 0,
    offsetTop: 0,
  };
}

/** Vertical FOV that keeps 16:9 horizontal framing on extra-wide screens. */
export function coverVerticalFov(aspect: number): number {
  if (!(aspect > 0) || aspect <= DESIGN_ASPECT) return DESIGN_VFOV_DEG;
  const vRad = (DESIGN_VFOV_DEG * Math.PI) / 180;
  const hRad = 2 * Math.atan(Math.tan(vRad / 2) * DESIGN_ASPECT);
  return (2 * Math.atan(Math.tan(hRad / 2) / aspect) * 180) / Math.PI;
}

/** Subscribe to layout changes that affect the visible game area. */
export function onViewChange(cb: () => void): () => void {
  let orientationTimer = 0;
  const run = () => cb();
  const onOrientation = () => {
    run();
    window.clearTimeout(orientationTimer);
    orientationTimer = window.setTimeout(run, 280);
  };

  window.addEventListener('resize', run);
  window.addEventListener('orientationchange', onOrientation);
  window.visualViewport?.addEventListener('resize', run);
  window.visualViewport?.addEventListener('scroll', run);
  document.addEventListener('fullscreenchange', run);
  document.addEventListener('webkitfullscreenchange', run as EventListener);

  return () => {
    window.clearTimeout(orientationTimer);
    window.removeEventListener('resize', run);
    window.removeEventListener('orientationchange', onOrientation);
    window.visualViewport?.removeEventListener('resize', run);
    window.visualViewport?.removeEventListener('scroll', run);
    document.removeEventListener('fullscreenchange', run);
    document.removeEventListener('webkitfullscreenchange', run as EventListener);
  };
}
