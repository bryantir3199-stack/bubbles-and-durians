const FIRST_RUN_CUE_KEY = 'bd:seenFirstRunCue';

function canUseStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function hasSeenFirstRunCue(): boolean {
  if (!canUseStorage()) return false;
  try {
    return localStorage.getItem(FIRST_RUN_CUE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markFirstRunCueSeen(): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(FIRST_RUN_CUE_KEY, '1');
  } catch {
    // Ignore quota / private-mode failures; cue may show again next visit.
  }
}
