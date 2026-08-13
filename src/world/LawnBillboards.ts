import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const GRASS_URL = 'assets/grass.png';
const TREE_URL = 'assets/tree.glb';

/** Static play camera XZ — grass cards yaw to face this point. */
const CAM_X = 0;
const CAM_Z = 635;

const FRENZY_TINT = new THREE.Color(0xff9a48);

const TREE_YAW = Math.PI / 4;
const RIGHT_TREE_H = 138;

type GrassSpot = { x: number; z: number; h: number; flip: boolean };
type TreeSpot = { x: number; z: number; h: number; rot: number };

/** Five tufts around the trees: 2 left cluster, 3 right cluster. */
const GRASS_SPOTS: GrassSpot[] = [
  { x: -448, z: -28, h: 24, flip: false },
  { x: -328, z: 6, h: 22, flip: true },
  { x: 328, z: -14, h: 23, flip: true },
  { x: 392, z: -22, h: 25, flip: false },
  { x: 358, z: -64, h: 21, flip: true },
];

/** Three background trees, all yawed 45°. Right is the scale reference. */
const TREE_SPOTS: TreeSpot[] = [
  { x: -430, z: -48, h: RIGHT_TREE_H * 0.95, rot: TREE_YAW },
  { x: -310, z: -18, h: RIGHT_TREE_H * 0.85, rot: TREE_YAW },
  { x: 355, z: -40, h: RIGHT_TREE_H, rot: TREE_YAW },
];

/**
 * Lawn props: lit grass-card billboards + 3D tree models.
 * Grass is hidden during SAO so the depth override cannot stamp a quad halo.
 */
export class LawnBillboards {
  private readonly group = new THREE.Group();
  private readonly grassGroup = new THREE.Group();
  private readonly grassGeo: THREE.PlaneGeometry;
  private readonly tmpTint = new THREE.Color(0xffffff);
  private grassMat: THREE.MeshStandardMaterial | null = null;
  private grassDepthMat: THREE.MeshDepthMaterial | null = null;
  private grassMap: THREE.Texture | null = null;
  private readonly treeMats: THREE.MeshStandardMaterial[] = [];

  constructor() {
    this.grassGeo = new THREE.PlaneGeometry(1, 1);
    this.grassGeo.translate(0, 0.5, 0);
    this.group.name = 'lawn-billboards';
    this.grassGroup.name = 'lawn-grass';
    this.group.add(this.grassGroup);
  }

  async load(parent: THREE.Object3D): Promise<void> {
    await Promise.all([this.loadGrass(), this.loadTrees()]);
    parent.add(this.group);
  }

  /** Hide grass cards while SAO rebuilds depth (avoids rectangular lawn stains). */
  setGrassInSao(include: boolean): void {
    this.grassGroup.visible = include;
  }

  /** Autumn multiply on trees and grass. */
  setFrenzy(t: number): void {
    this.tmpTint.set(0xffffff).lerp(FRENZY_TINT, t);
    for (const mat of this.treeMats) mat.color.copy(this.tmpTint);
    if (this.grassMat) this.grassMat.color.copy(this.tmpTint);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.grassGeo.dispose();
    this.grassMat?.dispose();
    this.grassMat = null;
    this.grassDepthMat?.dispose();
    this.grassDepthMat = null;
    this.grassMap?.dispose();
    this.grassMap = null;
    const treeMaps = new Set<THREE.Texture>();
    for (const mat of this.treeMats) {
      if (mat.map) treeMaps.add(mat.map);
      mat.dispose();
    }
    this.treeMats.length = 0;
    for (const map of treeMaps) map.dispose();
  }

  private async loadGrass(): Promise<void> {
    const map = await new THREE.TextureLoader().loadAsync(GRASS_URL);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 1;
    map.generateMipmaps = false;
    map.minFilter = THREE.LinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.needsUpdate = true;
    this.grassMap = map;

    this.grassMat = new THREE.MeshStandardMaterial({
      map,
      color: 0xffffff,
      metalness: 0,
      roughness: 0.92,
      transparent: true,
      alphaTest: 0.55,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
    });

    // Shadow-map depth uses this so only the blades occlude, not the full quad.
    this.grassDepthMat = new THREE.MeshDepthMaterial({
      map,
      alphaTest: 0.55,
      depthPacking: THREE.RGBADepthPacking,
    });

    const img = map.image as { width: number; height: number };
    const aspect = img.width / Math.max(1, img.height);

    for (const spot of GRASS_SPOTS) {
      const mesh = new THREE.Mesh(this.grassGeo, this.grassMat);
      mesh.position.set(spot.x, 0.12, spot.z);
      mesh.scale.set(spot.h * aspect * (spot.flip ? -1 : 1), spot.h, 1);
      mesh.lookAt(CAM_X, mesh.position.y, CAM_Z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.customDepthMaterial = this.grassDepthMat;
      this.grassGroup.add(mesh);
    }
  }

  private async loadTrees(): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(TREE_URL);
    const raw = gltf.scene;

    raw.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.castShadow = false;
      obj.receiveShadow = true;
      obj.frustumCulled = true;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
        mat.metalness = 0;
        mat.roughness = 0.85;
        mat.transparent = true;
        mat.alphaTest = 0.45;
        mat.depthWrite = true;
        mat.side = THREE.DoubleSide;
        if (mat.map) {
          mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.map.anisotropy = 1;
          mat.map.needsUpdate = true;
        }
        mat.needsUpdate = true;
        if (!this.treeMats.includes(mat)) this.treeMats.push(mat);
      }
    });

    raw.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(raw);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    raw.position.x -= center.x;
    raw.position.z -= center.z;
    raw.position.y -= box.min.y;

    const wrapper = new THREE.Group();
    wrapper.add(raw);

    const nativeH = Math.max(size.y, 0.001);
    for (const spot of TREE_SPOTS) {
      const inst = wrapper.clone(true);
      inst.scale.setScalar(spot.h / nativeH);
      inst.position.set(spot.x, 0, spot.z);
      inst.rotation.y = spot.rot;
      this.group.add(inst);
    }
  }
}
