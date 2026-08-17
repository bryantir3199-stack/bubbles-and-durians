import type { GameMode, TimedPreset } from '../config/gameConfig';
import type * as THREE from 'three';

export type SceneId = 'boot' | 'title' | 'modeSelect' | 'play' | 'gameOver' | 'leaderboard';

export interface SceneData {
  mode?: GameMode;
  timedPreset?: TimedPreset;
  score?: number;
  highlightScore?: number;
}

export interface SceneContext {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  goto: (id: SceneId, data?: SceneData) => void;
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
