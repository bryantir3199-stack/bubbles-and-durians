import * as THREE from 'three';
import type { GameScene, SceneContext, SceneData, SceneId } from './types';
import { BootScene } from '../scenes/BootScene';
import { TitleScene } from '../scenes/TitleScene';
import { ModeSelectScene } from '../scenes/ModeSelectScene';
import { PlayScene } from '../scenes/PlayScene';
import { GameOverScene } from '../scenes/GameOverScene';
import { LeaderboardScene } from '../scenes/LeaderboardScene';
import { getCastleStage } from '../world/CastleStage';

/**
 * Owns the WebGL renderer, shared Three.js scene/camera,
 * and a simple scene-stack state machine.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly uiRoot: HTMLElement;
  private canvas: HTMLCanvasElement;
  private current: GameScene | null = null;
  private scenes: Record<SceneId, GameScene>;
  private last = 0;
  private raf = 0;
  private sharedStageReady = false;

  constructor(container: HTMLElement) {
    this.uiRoot = document.createElement('div');
    this.uiRoot.id = 'ui-root';
    this.uiRoot.className = 'ui-root';
    container.appendChild(this.uiRoot);

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'game-canvas';
    container.appendChild(this.canvas);

    this.camera = new THREE.PerspectiveCamera(42, 1, 1, 2000);
    this.camera.position.set(0, 140, 560);
    this.camera.lookAt(0, 110, 40);

    const gameRef = this;
    const makeCtx = (): SceneContext => ({
      canvas: this.canvas,
      uiRoot: this.uiRoot,
      goto: (id, data) => void this.goto(id, data),
      three: {
        scene: gameRef.scene,
        camera: gameRef.camera,
        renderer: gameRef.renderer,
      },
      markStageReady: () => {
        gameRef.sharedStageReady = true;
      },
      isStageReady: () => gameRef.sharedStageReady,
    });

    this.scenes = {
      boot: new BootScene(makeCtx()),
      title: new TitleScene(makeCtx()),
      modeSelect: new ModeSelectScene(makeCtx()),
      play: new PlayScene(makeCtx()),
      gameOver: new GameOverScene(makeCtx()),
      leaderboard: new LeaderboardScene(makeCtx()),
    };

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  async start(): Promise<void> {
    await this.goto('boot');
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      getCastleStage()?.update(dt);
      this.current?.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  async goto(id: SceneId, data?: SceneData): Promise<void> {
    this.current?.exit();
    this.current = this.scenes[id];
    await this.current.enter(data);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.current?.onResize?.(w, h);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.current?.exit();
    this.renderer.dispose();
  }
}
