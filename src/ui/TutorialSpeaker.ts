import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';
import { ModelCache } from '../world/ModelCache';

/**
 * Tutorial portrait of the teeth — a GUI overlay, not a world-space target.
 * Own WebGL layer so stage lighting / SAO / the play camera cannot affect it.
 */
export class TutorialSpeaker {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private teethOpen: THREE.Object3D | null = null;
  private teethClose: THREE.Object3D | null = null;
  private openState = true;
  private chompAge = 0;
  private talking = false;
  private bob = 0;
  private resizeObs: ResizeObserver | null = null;
  private lastW = 0;
  private lastH = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'tut-speaker';
    this.el.setAttribute('aria-hidden', 'true');

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'tut-speaker-canvas';
    this.el.appendChild(this.canvas);

    this.camera = new THREE.PerspectiveCamera(34, 1, 1, 400);
    this.camera.position.set(0, 8, 120);
    this.camera.lookAt(0, 1, 0);

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        alpha: true,
        powerPreference: 'low-power',
      });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.4;
    } catch {
      this.renderer = null;
    }

    this.buildTeeth();
    this.resizeObs = new ResizeObserver(() => this.syncSize());
    this.resizeObs.observe(this.el);
  }

  setTalking(talking: boolean): void {
    this.talking = talking;
  }

  update(dt: number): void {
    if (!this.renderer || !this.teethOpen || !this.teethClose) return;

    this.bob += dt * (this.talking ? 10 : 4);
    const lift = this.talking ? Math.sin(this.bob) * 1.6 : Math.sin(this.bob) * 0.5;
    this.scene.position.y = lift;

    const interval = this.talking
      ? gameConfig.teethChompIntervalMs
      : gameConfig.teethChompIntervalMs * 1.8;
    this.chompAge += dt * 1000;
    if (this.chompAge >= interval) {
      this.chompAge = 0;
      this.openState = !this.openState;
      this.teethOpen.visible = this.openState;
      this.teethClose.visible = !this.openState;
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy(): void {
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    this.renderer?.dispose();
    this.renderer = null;
    this.el.remove();
  }

  private buildTeeth(): void {
    if (!ModelCache.isReady) return;
    const holder = new THREE.Group();
    this.teethOpen = ModelCache.cloneModel('teethOpen');
    this.teethClose = ModelCache.cloneModel('teethClose');
    this.teethClose.visible = false;
    holder.add(this.teethOpen);
    holder.add(this.teethClose);
    // Drop in the viewport so the bust crops at the lower-third floor.
    holder.position.set(0, -4, 0);
    holder.scale.setScalar(1.15);
    this.scene.add(holder);
  }

  private syncSize(): void {
    if (!this.renderer) return;
    const w = Math.max(1, this.el.clientWidth);
    const h = Math.max(1, this.el.clientHeight);
    if (w === this.lastW && h === this.lastH) return;
    this.lastW = w;
    this.lastH = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }
}
