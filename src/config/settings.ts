/**
 * User settings with localStorage persistence.
 * Handles graphics, audio, and control preferences.
 */

const STORAGE_KEY = 'bubbles-durians-settings';

export type ResolutionScale = 0.5 | 0.75 | 1 | 1.25;

export interface GraphicsSettings {
  /** Ambient occlusion enabled */
  aoEnabled: boolean;
  /** Shadow quality: 'low' | 'medium' | 'high' */
  shadowQuality: 'low' | 'medium' | 'high';
  /** Render resolution scale (0.5 = low, 0.75 = medium, 1 = high, 1.25 = ultra) */
  resolutionScale: ResolutionScale;
}

export interface AudioSettings {
  /** Master mute state */
  muted: boolean;
  /** Music volume (0-1) */
  musicVolume: number;
  /** SFX volume (0-1) */
  sfxVolume: number;
}

export interface ControlBindings {
  /** Key for reloading */
  reload: string;
  /** Secondary key for reloading */
  reloadAlt: string;
  /** Key for pausing */
  pause: string;
}

export interface GameSettings {
  graphics: GraphicsSettings;
  audio: AudioSettings;
  controls: ControlBindings;
}

const DEFAULT_SETTINGS: GameSettings = {
  graphics: {
    aoEnabled: true,
    shadowQuality: 'high',
    resolutionScale: 1,
  },
  audio: {
    muted: false,
    musicVolume: 1,
    sfxVolume: 1,
  },
  controls: {
    reload: 'r',
    reloadAlt: ' ',
    pause: 'Escape',
  },
};

let currentSettings: GameSettings = structuredClone(DEFAULT_SETTINGS);
const listeners: Set<() => void> = new Set();

function load(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<GameSettings>;
      currentSettings = {
        graphics: { ...DEFAULT_SETTINGS.graphics, ...parsed.graphics },
        audio: { ...DEFAULT_SETTINGS.audio, ...parsed.audio },
        controls: { ...DEFAULT_SETTINGS.controls, ...parsed.controls },
      };
    }
  } catch {
    currentSettings = structuredClone(DEFAULT_SETTINGS);
  }
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
  } catch {
    // localStorage unavailable or quota exceeded
  }
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Get current settings (read-only snapshot). */
export function getSettings(): Readonly<GameSettings> {
  return currentSettings;
}

/** Get default settings. */
export function getDefaultSettings(): Readonly<GameSettings> {
  return DEFAULT_SETTINGS;
}

/** Update graphics settings. */
export function setGraphicsSettings(partial: Partial<GraphicsSettings>): void {
  currentSettings.graphics = { ...currentSettings.graphics, ...partial };
  save();
  notify();
}

/** Update audio settings. */
export function setAudioSettings(partial: Partial<AudioSettings>): void {
  currentSettings.audio = { ...currentSettings.audio, ...partial };
  save();
  notify();
}

/** Update control bindings. */
export function setControlBindings(partial: Partial<ControlBindings>): void {
  currentSettings.controls = { ...currentSettings.controls, ...partial };
  save();
  notify();
}

/** Reset all settings to defaults. */
export function resetSettings(): void {
  currentSettings = structuredClone(DEFAULT_SETTINGS);
  save();
  notify();
}

/** Reset just controls to defaults. */
export function resetControlBindings(): void {
  currentSettings.controls = structuredClone(DEFAULT_SETTINGS.controls);
  save();
  notify();
}

/** Subscribe to settings changes. Returns unsubscribe function. */
export function onSettingsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Get display label for resolution scale. */
export function getResolutionLabel(scale: ResolutionScale): string {
  const labels: Record<ResolutionScale, string> = {
    0.5: 'LOW',
    0.75: 'MED',
    1: 'HIGH',
    1.25: 'ULTRA',
  };
  return labels[scale] ?? 'HIGH';
}

/** All available resolution scale options. */
export const RESOLUTION_SCALES: ResolutionScale[] = [0.5, 0.75, 1, 1.25];

/** Get display name for a key code. */
export function getKeyDisplayName(key: string): string {
  const names: Record<string, string> = {
    ' ': 'Space',
    'Escape': 'Esc',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'Enter': 'Enter',
    'Tab': 'Tab',
    'Backspace': '⌫',
    'Delete': 'Del',
    'Shift': 'Shift',
    'Control': 'Ctrl',
    'Alt': 'Alt',
    'Meta': 'Cmd',
  };
  return names[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

/** Check if a key event matches a binding. */
export function matchesBinding(e: KeyboardEvent, binding: keyof ControlBindings): boolean {
  const key = e.key;
  const controls = currentSettings.controls;
  if (binding === 'reload') {
    return key.toLowerCase() === controls.reload.toLowerCase() ||
           key === controls.reloadAlt;
  }
  return key === controls[binding];
}

// Load settings on module initialization
load();
