import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyCastleMarkers, type DoorBounds, type Vec3, type WindowSpot } from '../config/spawnLayout';
import { DoorController, setDoorController } from './DoorController';
import { FlagWaver } from './FlagWaver';
import { LawnBillboards } from './LawnBillboards';

const ASSET = {
  glb: 'assets/castle/castle.glb',
  sky: 'assets/sky-clouds.png',
};

/** Normal daytime look. */
const NORMAL_SKY = 0x5abee6;
const NORMAL_FOG = 0xa8d8f0;
const NORMAL_GRASS = 0x649e54;
const NORMAL_GRASS_RING = 0x7eb86a;
const NORMAL_HEMI_GROUND = 0x6a9a50;

/** Frenzy sunset / autumn look (color values only). */
const FRENZY_SKY = 0xff7a3a;
const FRENZY_FOG = 0xffb07a;
const FRENZY_GRASS = 0xe07a28;
const FRENZY_GRASS_RING = 0xf0943a;
const FRENZY_HEMI_GROUND = 0xc86a28;

/** Seconds to fade fully between normal and frenzy looks. */
const FRENZY_LOOK_FADE_SEC = 0.85;

let stageInstance: CastleStage | null = null;

export function getCastleStage(): CastleStage | null {
  return stageInstance;
}

/**
 * Loads castle.glb, wires door pivots, sky image background,
 * shadow-casting sun, lawn grass/trees, and JS wind on the baked banners.
 */
export class CastleStage {
  readonly root = new THREE.Group();
  readonly doors = new DoorController();
  private readonly flags = new FlagWaver();
  private readonly lawn = new LawnBillboards();
  private groundMat: THREE.MeshStandardMaterial | null = null;
  private ringMat: THREE.MeshStandardMaterial | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;
  private skyTexture: THREE.Texture | null = null;
  private frenzyLook = 0;
  private frenzyLookTarget = 0;
  private readonly tmpSky = new THREE.Color();
  private readonly tmpFog = new THREE.Color();
  private readonly tmpGrass = new THREE.Color();
  private readonly tmpRing = new THREE.Color();
  private readonly tmpHemi = new THREE.Color();
  private readonly colNormalSky = new THREE.Color(NORMAL_SKY);
  private readonly colFrenzySky = new THREE.Color(FRENZY_SKY);
  private readonly colNormalFog = new THREE.Color(NORMAL_FOG);
  private readonly colFrenzyFog = new THREE.Color(FRENZY_FOG);
  private readonly colNormalGrass = new THREE.Color(NORMAL_GRASS);
  private readonly colFrenzyGrass = new THREE.Color(FRENZY_GRASS);
  private readonly colNormalRing = new THREE.Color(NORMAL_GRASS_RING);
  private readonly colFrenzyRing = new THREE.Color(FRENZY_GRASS_RING);
  private readonly colNormalHemi = new THREE.Color(NORMAL_HEMI_GROUND);
  private readonly colFrenzyHemi = new THREE.Color(FRENZY_HEMI_GROUND);

  constructor(private scene: THREE.Scene) {
    stageInstance = this;
    this.scene.add(this.root);
    this.buildEnvironment();
  }

  async load(): Promise<void> {
    const [gltf] = await Promise.all([
      new GLTFLoader().loadAsync(ASSET.glb),
      this.loadSkyBackground(),
      this.lawn.load(this.root),
    ]);
    const castle = gltf.scene;

    castle.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.frustumCulled = true;

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!(mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial)) {
          continue;
        }
        mat.metalness = 0;
        mat.roughness = 1;
        mat.envMapIntensity = 0;
        // Mild albedo lift under ACES (midway vs the brighter pass).
        mat.color.multiplyScalar(1.05);
        if (mat.map) {
          mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.map.anisotropy = 1;
          mat.map.generateMipmaps = true;
          mat.map.minFilter = THREE.LinearMipmapLinearFilter;
          mat.map.magFilter = THREE.LinearFilter;
          mat.map.needsUpdate = true;
        }
        mat.needsUpdate = true;
      }
    });

    castle.scale.setScalar(100);
    castle.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(castle);
    const center = box.getCenter(new THREE.Vector3());
    castle.position.x -= center.x;
    castle.position.z -= center.z;
    castle.position.y -= box.min.y;
    castle.updateMatrixWorld(true);

    this.root.add(castle);
    castle.updateMatrixWorld(true);
    this.applyMarkers(castle);
    this.doors.setup(castle);
    this.flags.setup(castle);
    setDoorController(this.doors);
  }

  private applyMarkers(castle: THREE.Object3D): void {
    castle.updateMatrixWorld(true);

    const spawns: WindowSpot[] = [];
    for (let i = 1; i <= 16; i++) {
      const obj = castle.getObjectByName(`sp${i}`);
      if (!obj) break;
      spawns.push({ id: `sp${i}`, ...worldPos(obj) });
    }

    const paths: Vec3[] = [];
    for (let i = 1; i <= 16; i++) {
      const obj = castle.getObjectByName(`path${i}`);
      if (!obj) break;
      paths.push(worldPos(obj));
    }

    let door: DoorBounds | undefined;
    const doorL = castle.getObjectByName('baked_door_l');
    const doorR = castle.getObjectByName('baked_door_r');
    if (doorL || doorR) {
      const box = new THREE.Box3();
      if (doorL) box.expandByObject(doorL);
      if (doorR) box.expandByObject(doorR);
      door = {
        minX: box.min.x,
        maxX: box.max.x,
        minY: box.min.y,
        maxY: box.max.y,
        minZ: box.min.z,
        maxZ: box.max.z,
      };
    }

    applyCastleMarkers({ spawns, paths, door });
  }

  private async loadSkyBackground(): Promise<void> {
    const tex = await new THREE.TextureLoader().loadAsync(ASSET.sky);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.skyTexture = tex;
    // Keep the painted sky while not in a frenzy tint.
    if (this.frenzyLook <= 0) this.scene.background = tex;
  }

  /**
   * Target a frenzy (sunset) or normal environment tint.
   * Colors fade smoothly in `update`.
   */
  setFrenzyActive(active: boolean): void {
    this.frenzyLookTarget = active ? 1 : 0;
  }

  /** Snap back to the normal daytime look (e.g. leaving play). */
  resetFrenzyLook(): void {
    this.frenzyLook = 0;
    this.frenzyLookTarget = 0;
    this.applyFrenzyLook(0);
  }

  private applyFrenzyLook(t: number): void {
    this.tmpSky.copy(this.colNormalSky).lerp(this.colFrenzySky, t);
    this.tmpFog.copy(this.colNormalFog).lerp(this.colFrenzyFog, t);
    this.tmpGrass.copy(this.colNormalGrass).lerp(this.colFrenzyGrass, t);
    this.tmpRing.copy(this.colNormalRing).lerp(this.colFrenzyRing, t);
    this.tmpHemi.copy(this.colNormalHemi).lerp(this.colFrenzyHemi, t);

    if (t <= 0 && this.skyTexture) {
      this.scene.background = this.skyTexture;
    } else {
      this.scene.background = this.tmpSky;
    }

    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(this.tmpFog);
    }
    this.groundMat?.color.copy(this.tmpGrass);
    this.ringMat?.color.copy(this.tmpRing);
    if (this.hemiLight) this.hemiLight.groundColor.copy(this.tmpHemi);
    this.lawn.setFrenzy(t);
  }

  /** Grass cards must not be in the SAO depth override (rectangular lawn stains). */
  setGrassInSao(include: boolean): void {
    this.lawn.setGrassInSao(include);
  }

  private buildEnvironment(): void {
    // Fallback until sky texture loads; Rhythm Heaven cyan.
    this.scene.background = new THREE.Color(NORMAL_SKY);
    this.scene.fog = new THREE.Fog(NORMAL_FOG, 900, 1600);

    this.groundMat = new THREE.MeshStandardMaterial({
      color: NORMAL_GRASS,
      metalness: 0,
      roughness: 0.95,
    });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(560, 32), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.root.add(ground);

    this.ringMat = new THREE.MeshStandardMaterial({
      color: NORMAL_GRASS_RING,
      metalness: 0,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(70, 240, 32), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.receiveShadow = true;
    this.root.add(ring);

    this.root.add(new THREE.AmbientLight(0xfff6e8, 0.7));
    this.hemiLight = new THREE.HemisphereLight(0xb8dfff, NORMAL_HEMI_GROUND, 0.55);
    this.root.add(this.hemiLight);

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.75);
    sun.position.set(160, 320, 180);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.035;
    const cam = sun.shadow.camera;
    cam.near = 40;
    cam.far = 1000;
    cam.left = -480;
    cam.right = 480;
    cam.top = 320;
    cam.bottom = -160;
    cam.updateProjectionMatrix();
    this.root.add(sun);
    this.root.add(sun.target);
    sun.target.position.set(0, 40, 40);

    const fill = new THREE.DirectionalLight(0xd8ecff, 0.35);
    fill.position.set(-200, 160, 100);
    this.root.add(fill);
  }

  update(dt: number): void {
    this.doors.update(dt);
    this.flags.update(dt);

    if (this.frenzyLook !== this.frenzyLookTarget) {
      const step = dt / FRENZY_LOOK_FADE_SEC;
      if (this.frenzyLook < this.frenzyLookTarget) {
        this.frenzyLook = Math.min(this.frenzyLookTarget, this.frenzyLook + step);
      } else {
        this.frenzyLook = Math.max(this.frenzyLookTarget, this.frenzyLook - step);
      }
      this.applyFrenzyLook(this.frenzyLook);
    }
  }

  dispose(): void {
    if (stageInstance === this) stageInstance = null;
    this.lawn.dispose();
    this.skyTexture?.dispose();
    this.skyTexture = null;
    this.scene.remove(this.root);
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
        if (obj instanceof THREE.Mesh) obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          const map = (m as THREE.MeshStandardMaterial).map;
          if (map) map.dispose();
          m.dispose();
        }
      }
    });
  }
}

function worldPos(obj: THREE.Object3D): Vec3 {
  const v = new THREE.Vector3();
  obj.getWorldPosition(v);
  return { x: v.x, y: v.y, z: v.z };
}
