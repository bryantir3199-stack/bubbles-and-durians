import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { gameConfig } from '../config/gameConfig';

type ModelKey = 'bubble' | 'durian';

const GLB_URL: Record<ModelKey, string> = {
  bubble: 'assets/bubble.glb',
  durian: 'assets/durian.glb',
};

/**
 * Preloads GLB templates and textures; clones normalized models for targets.
 */
export class ModelCache {
  private static templates = new Map<ModelKey, THREE.Object3D>();
  private static textures = new Map<string, THREE.Texture>();
  private static ready = false;

  static get isReady(): boolean {
    return this.ready;
  }

  static async preload(): Promise<void> {
    if (this.ready) return;

    const loader = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();

    const [bubbleGltf, durianGltf, goldMap] = await Promise.all([
      loader.loadAsync(GLB_URL.bubble),
      loader.loadAsync(GLB_URL.durian),
      texLoader.loadAsync('assets/gold-durian.png'),
    ]);

    goldMap.colorSpace = THREE.SRGBColorSpace;
    this.textures.set('goldDurian', goldMap);

    this.templates.set('bubble', this.normalizeTemplate(bubbleGltf.scene, gameConfig.targetSize));
    this.templates.set('durian', this.normalizeTemplate(durianGltf.scene, gameConfig.targetSize));
    this.textures.set('heart', this.makeHeartTexture());

    this.ready = true;
  }

  static getTexture(key: string): THREE.Texture {
    const tex = this.textures.get(key);
    if (!tex) throw new Error(`Texture not loaded: ${key}`);
    return tex;
  }

  /** Deep-clone a normalized GLB template for a new target. */
  static cloneModel(key: ModelKey): THREE.Object3D {
    const template = this.templates.get(key);
    if (!template) throw new Error(`Model not loaded: ${key}`);
    const clone = template.clone(true);
    clone.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        const cloned = mats.map((m) => m.clone());
        obj.material = cloned.length === 1 ? cloned[0]! : cloned;
      }
    });
    return clone;
  }

  private static normalizeTemplate(root: THREE.Object3D, targetSize: number): THREE.Object3D {
    // Fix embedded texture color spaces
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (
          (mat instanceof THREE.MeshStandardMaterial ||
            mat instanceof THREE.MeshPhysicalMaterial ||
            mat instanceof THREE.MeshBasicMaterial) &&
          mat.map
        ) {
          mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.map.anisotropy = 8;
          mat.map.needsUpdate = true;
          mat.transparent = true;
          mat.alphaTest = 0.15;
          mat.side = THREE.DoubleSide;
          mat.needsUpdate = true;
        }
      }
    });

    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const scale = targetSize / maxDim;

    const wrapper = new THREE.Group();
    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);
    const centered = new THREE.Box3().setFromObject(root);
    const center = new THREE.Vector3();
    centered.getCenter(center);
    root.position.sub(center);
    wrapper.add(root);

    wrapper.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = false;
      }
    });

    return wrapper;
  }

  private static makeHeartTexture(): THREE.Texture {
    const s = 128;
    const c = document.createElement('canvas');
    c.width = s;
    c.height = s;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, s, s);
    g.fillStyle = '#ff2d55';
    g.strokeStyle = '#ffffff';
    g.lineWidth = 6;
    g.beginPath();
    const x = s / 2;
    g.moveTo(x, s * 0.88);
    g.bezierCurveTo(x - s * 0.55, s * 0.55, x - s * 0.45, s * 0.12, x, s * 0.32);
    g.bezierCurveTo(x + s * 0.45, s * 0.12, x + s * 0.55, s * 0.55, x, s * 0.88);
    g.closePath();
    g.fill();
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
