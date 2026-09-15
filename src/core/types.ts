import type { GameMode, RankedMode, TimedPreset, TimedRunTally } from '../config/gameConfig';
import type * as THREE from 'three';

export type SceneId = 'boot' | 'title' | 'modeSelect' | 'play' | 'bonusTally' | 'gameOver' | 'leaderboard';

export interface SceneData {
  mode?: GameMode;
  timedPreset?: TimedPreset;
  rankedMode?: RankedMode;
  score?: number;
  timedTally?: TimedRunTally;
  highlightScore?: number;
  playerName?: string;
  /** Endless/tutorial flavor stats carried from PlayScene for the GameOver secondary line. */
  bubblesHit?: number;
  peakCombo?: number;
}

export interface SceneContext {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  goto: (id: SceneId, data?: SceneData) => void | Promise<void>;
  /** Load castle + target models once; later calls reuse the in-memory world. */
  ensurePlayWorld: () => Promise<void>;
  three: {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
  };
  markStageReady: () => void;
  isStageReady: () => boolean;
}

export interface GameScene {
  readonly id: SceneId;
  enter(data?: SceneData): void | Promise<void>;
  update(dt: number): void;
  exit(): void;
  onResize?(width: number, height: number): void;
}
