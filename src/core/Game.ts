import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SAOPass } from 'three/addons/postprocessing/SAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { GameScene, SceneContext, SceneData, SceneId } from './types';
import { BootScene } from '../scenes/BootScene';
import { TitleScene } from '../scenes/TitleScene';
import { ModeSelectScene } from '../scenes/ModeSelectScene';
import { PlayScene } from '../scenes/PlayScene';
import { GameOverScene } from '../scenes/GameOverScene';
import { LeaderboardScene } from '../scenes/LeaderboardScene';
import { getCastleStage } from '../world/CastleStage';
import {
  coverVerticalFov,
  DESIGN_VFOV_DEG,
  getViewSize,
  isCoarsePointer,
  onViewChange,
} from './display';

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
  private container: HTMLElement;
  private current: GameScene | null = null;
  private scenes: Record<SceneId, GameScene>;
  private last = 0;
  private raf = 0;
  private sharedStageReady = false;
  private readonly usePostFx: boolean;
  private readonly composer: EffectComposer | null;
  private readonly saoPass: SAOPass | null;
  private unsubView: (() => void) | null = null;
  private lastView = { w: 0, h: 0, left: 0, top: 0 };

  constructor(container: HTMLElement) {
    this.container = container;
    this.uiRoot = document.createElement('div');
    this.uiRoot.id = 'ui-root';
    this.uiRoot.className = 'ui-root';
    container.appendChild(this.uiRoot);

    // SAO is too heavy on phones. Skip post-FX and extra GPU work so play can hold 60fps.
    this.usePostFx = !isCoarsePointer();

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      // mediump fragment math is a large win on iOS GPUs vs PBR highp.
      precision: this.usePostFx ? 'highp' : 'mediump',
    });
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = this.usePostFx
      ? THREE.ACESFilmicToneMapping
      : THREE.NoToneMapping;
    this.renderer.toneMappingExposure = this.usePostFx ? 1.4 : 1;
    this.renderer.shadowMap.enabled = this.usePostFx;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'game-canvas';
    container.appendChild(this.canvas);

    this.camera = new THREE.PerspectiveCamera(DESIGN_VFOV_DEG, 1, 1, 2000);
    this.camera.position.set(0, 110, 635);
    this.camera.lookAt(0, 110, 40);

    if (this.usePostFx) {
      const { width: w, height: h } = getViewSize();
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));

      // SAO fits RenderPass (needsSwap=false). Scale must match this large world
      // (camera.far 2000) — values near 1 crush crevices to black.
      this.saoPass = new SAOPass(this.scene, this.camera, new THREE.Vector2(w, h));
      this.saoPass.params.output = SAOPass.OUTPUT.Default;
      this.saoPass.params.saoBias = 0.65;
      this.saoPass.params.saoIntensity = 0.03;
      this.saoPass.params.saoScale = 22;
      this.saoPass.params.saoKernelRadius = 70;
      this.saoPass.params.saoMinResolution = 0;
      this.saoPass.params.saoBlur = true;
      this.saoPass.params.saoBlurRadius = 10;
      this.saoPass.params.saoBlurStdDev = 5;
      // Keep blur from bleeding sky (cleared white) into geometry edges.
      this.saoPass.params.saoBlurDepthCutoff = 0.04;
      // Unclamped ao > 1 → (1 - ao) goes negative → HDR multiply brightens
      // (white halos) instead of darkening. Clamp so AO stays a darkening factor.
      this.saoPass.saoMaterial.fragmentShader = this.saoPass.saoMaterial.fragmentShader.replace(
        'gl_FragColor.xyz *=  1.0 - ambientOcclusion;',
        'gl_FragColor.xyz *=  1.0 - clamp( ambientOcclusion, 0.0, 0.35 );',
      );
      this.saoPass.saoMaterial.needsUpdate = true;
      this.composer.addPass(this.saoPass);
      this.composer.addPass(new OutputPass());

      const saoRender = this.saoPass.render.bind(this.saoPass);
      this.saoPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
        getCastleStage()?.setGrassInSao(false);
        const skipped: THREE.Object3D[] = [];
        this.scene.traverse((obj) => {
          if (obj.userData.skipSao && obj.visible) {
            obj.visible = false;
            skipped.push(obj);
          }
        });
        saoRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
        for (const obj of skipped) obj.visible = true;
        getCastleStage()?.setGrassInSao(true);
      };
    } else {
      this.composer = null;
      this.saoPass = null;
    }

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

    this.unsubView = onViewChange(() => this.resize());
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
      if (this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  async goto(id: SceneId, data?: SceneData): Promise<void> {
    this.current?.exit();
    this.current = this.scenes[id];
    await this.current.enter(data);
  }

  private pixelRatio(cssW = 0, cssH = 0): number {
    const dpr = window.devicePixelRatio || 1;
    if (this.usePostFx) return Math.min(dpr, 1.25);
    // DOM HUD composites at 60fps while a 1.5–3x WebGL buffer falls behind.
    // Draw 1:1 with CSS pixels, and cap the long edge so large phones/iPads stay cheap.
    if (cssW > 0 && cssH > 0) return Math.min(1, 900 / Math.max(cssW, cssH));
    return 1;
  }

  private resize(): void {
    const { width: w, height: h, offsetLeft, offsetTop } = getViewSize();
    const sizeChanged = w !== this.lastView.w || h !== this.lastView.h;
    const posChanged = offsetLeft !== this.lastView.left || offsetTop !== this.lastView.top;
    if (!sizeChanged && !posChanged) return;
    this.lastView = { w, h, left: offsetLeft, top: offsetTop };

    this.container.style.width = `${w}px`;
    this.container.style.height = `${h}px`;
    this.container.style.left = `${offsetLeft}px`;
    this.container.style.top = `${offsetTop}px`;
    this.container.style.transform = 'none';

    if (!sizeChanged) return;

    this.camera.aspect = w / h;
    this.camera.fov = coverVerticalFov(this.camera.aspect);
    this.camera.updateProjectionMatrix();

    const dpr = this.pixelRatio(w, h);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // Composer resizes passes with pixel-ratio scale — don't override with CSS px.
    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(w, h);
    }
    this.current?.onResize?.(w, h);
  }

  dispose(): void {
    this.unsubView?.();
    this.unsubView = null;
    cancelAnimationFrame(this.raf);
    this.current?.exit();
    this.saoPass?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
