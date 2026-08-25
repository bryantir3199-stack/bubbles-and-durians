import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { gameConfig } from '../config/gameConfig';

type ModelKey = 'bubble' | 'durian' | 'teethOpen' | 'teethClose';

const GLB_URL: Record<ModelKey, string> = {
  bubble: 'assets/bubble.glb',
  durian: 'assets/durian.glb',
  teethOpen: 'assets/teeth_open.glb',
  teethClose: 'assets/teeth_close.glb',
};

/** Shared hit-proxy geometry (one for all targets). */
const proxyGeo = new THREE.SphereGeometry(gameConfig.targetSize * 0.45, 8, 8);
const proxyMat = new THREE.MeshBasicMaterial({ visible: false });

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

  static createHitProxy(): THREE.Mesh {
    return new THREE.Mesh(proxyGeo, proxyMat);
  }

  static async preload(): Promise<void> {
    if (this.ready) return;

    const loader = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();

    const [bubbleGltf, durianGltf, teethOpenGltf, teethCloseGltf, goldMap, heartMap] =
      await Promise.all([
        loader.loadAsync(GLB_URL.bubble),
        loader.loadAsync(GLB_URL.durian),
        loader.loadAsync(GLB_URL.teethOpen),
        loader.loadAsync(GLB_URL.teethClose),
        texLoader.loadAsync('assets/gold-durian.png'),
        texLoader.loadAsync('assets/hud/heart.png'),
      ]);

    goldMap.colorSpace = THREE.SRGBColorSpace;
    goldMap.anisotropy = 1;
    this.textures.set('goldDurian', goldMap);

    heartMap.colorSpace = THREE.SRGBColorSpace;
    heartMap.anisotropy = 1;
    heartMap.generateMipmaps = false;
    heartMap.minFilter = THREE.LinearFilter;
    heartMap.magFilter = THREE.LinearFilter;
    heartMap.needsUpdate = true;
    this.textures.set('heart', heartMap);

    this.templates.set('bubble', this.normalizeTemplate(bubbleGltf.scene, gameConfig.targetSize));
    this.templates.set('durian', this.normalizeTemplate(durianGltf.scene, gameConfig.targetSize));
    this.templates.set(
      'teethOpen',
      this.normalizeTemplate(teethOpenGltf.scene, gameConfig.targetSize),
    );
    this.templates.set(
      'teethClose',
      this.normalizeTemplate(teethCloseGltf.scene, gameConfig.targetSize),
    );

    this.ready = true;
  }

  static getTexture(key: string): THREE.Texture {
    const tex = this.textures.get(key);
    if (!tex) throw new Error(`Texture not loaded: ${key}`);
    return tex;
  }

  /** Clone a normalized GLB; share geometry, clone materials only when needed. */
  static cloneModel(key: ModelKey): THREE.Object3D {
    const template = this.templates.get(key);
    if (!template) throw new Error(`Model not loaded: ${key}`);
    const clone = template.clone(true);
    // Materials are already MeshBasicMaterial on templates — share them (no per-clone)
    return clone;
  }

  /**
   * Durian GLB with the gold texture swapped onto materials (cloned mats so the
   * shared template stays green).
   */
  static cloneGoldDurian(): THREE.Object3D {
    const clone = this.cloneModel('durian');
    // Upright (180° rot) + horizontal mirror vs the green map orientation.
    const gold = this.getTexture('goldDurian').clone();
    gold.wrapS = THREE.RepeatWrapping;
    gold.wrapT = THREE.RepeatWrapping;
    gold.center.set(0.5, 0.5);
    gold.rotation = Math.PI;
    gold.repeat.x = -1;
    gold.needsUpdate = true;
    clone.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const src = Array.isArray(obj.material) ? obj.material : [obj.material];
      const next = src.map((mat) => {
        const m = (mat as THREE.MeshBasicMaterial).clone();
        m.map = gold;
        m.color.setHex(0xffffff);
        m.needsUpdate = true;
        return m;
      });
      obj.material = next.length === 1 ? next[0]! : next;
    });
    return clone;
  }

  /** Dispose materials (and cloned gold map) for a gold durian instance. */
  static disposeGoldMaterials(root: THREE.Object3D): void {
    const maps = new Set<THREE.Texture>();
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        const map = (m as THREE.MeshBasicMaterial).map;
        if (map) maps.add(map);
        m.dispose();
      }
    });
    for (const map of maps) map.dispose();
  }

  private static heartGeo: THREE.PlaneGeometry | null = null;
  private static heartDepthMat: THREE.MeshDepthMaterial | null = null;
  private static heartAspect = 1;

  /**
   * Unlit heart card that still writes a cutout into the shadow map.
   * Caller must dispose the cloned color material.
   */
  static createHeart(): THREE.Mesh {
    const map = this.getTexture('heart');
    if (!this.heartGeo) {
      this.heartGeo = new THREE.PlaneGeometry(1, 1);
      this.heartDepthMat = new THREE.MeshDepthMaterial({
        map,
        alphaTest: 0.55,
        depthPacking: THREE.RGBADepthPacking,
      });
      const img = map.image as { width: number; height: number };
      this.heartAspect = img.width / Math.max(1, img.height);
    }
    const mat = new THREE.MeshBasicMaterial({
      map,
      color: 0xffffff,
      transparent: true,
      alphaTest: 0.55,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.heartGeo, mat);
    const size = gameConfig.heartSize;
    mesh.scale.set(size * this.heartAspect, size, 1);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    mesh.customDepthMaterial = this.heartDepthMat!;
    mesh.userData.skipSao = true;
    return mesh;
  }

  static disposeHeart(mesh: THREE.Mesh): void {
    const mat = mesh.material;
    if (mat instanceof THREE.Material) mat.dispose();
  }

  private static normalizeTemplate(root: THREE.Object3D, targetSize: number): THREE.Object3D {
    // Convert to unlit materials — flat cards don't need PBR
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.frustumCulled = true;

      const srcMats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const next = srcMats.map((mat) => {
        const map =
          mat instanceof THREE.MeshStandardMaterial ||
          mat instanceof THREE.MeshPhysicalMaterial ||
          mat instanceof THREE.MeshBasicMaterial
            ? mat.map
            : null;
        if (map) {
          map.colorSpace = THREE.SRGBColorSpace;
          map.anisotropy = 1;
          map.needsUpdate = true;
        }
        return new THREE.MeshBasicMaterial({
          map: map ?? undefined,
          color: map ? 0xffffff : 0xcccccc,
          transparent: true,
          alphaTest: 0.2,
          depthWrite: true,
          side: THREE.DoubleSide,
        });
      });
      obj.material = next.length === 1 ? next[0]! : next;
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
    return wrapper;
  }
}
