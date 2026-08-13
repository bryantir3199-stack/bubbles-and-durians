type MotionPermission = {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

/** iOS 13+ requires a user-gesture prompt before DeviceMotionEvent fires. */
export async function requestShakePermission(): Promise<void> {
  if (typeof DeviceMotionEvent === 'undefined') return;
  const Motion = DeviceMotionEvent as unknown as MotionPermission;
  if (typeof Motion.requestPermission !== 'function') return;
  try {
    await Motion.requestPermission();
  } catch {
    // Permission prompt can only run from a gesture; ignore failures.
  }
}

/**
 * Fire `cb` when the device is shaken. No-ops on desktop (no motion events).
 * Uses linear acceleration when the browser provides it; otherwise gravity-removed magnitude.
 */
export function onDeviceShake(cb: () => void, threshold = 15, cooldownMs = 800): () => void {
  let last = 0;
  const onMotion = (e: DeviceMotionEvent) => {
    const a = e.acceleration;
    const g = e.accelerationIncludingGravity;
    let mag = 0;
    if (a && a.x != null) {
      mag = Math.hypot(a.x, a.y ?? 0, a.z ?? 0);
    } else if (g && g.x != null) {
      mag = Math.abs(Math.hypot(g.x, g.y ?? 0, g.z ?? 0) - 9.81);
    }
    if (mag < threshold) return;
    const now = performance.now();
    if (now - last < cooldownMs) return;
    last = now;
    cb();
  };
  window.addEventListener('devicemotion', onMotion);
  return () => window.removeEventListener('devicemotion', onMotion);
}
