import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyCastleMarkers, type DoorBounds, type Vec3, type WindowSpot } from '../config/spawnLayout';
import { DoorController, setDoorController } from './DoorController';
import { WavingFlag, makeFlagTexture } from './WavingFlag';

const ASSET = {
  glb: 'assets/castle/castle.glb',
};

let stageInstance: CastleStage | null = null;

export function getCastleStage(): CastleStage | null {
  return stageInstance;
}

/**
 * Loads castle.glb, wires door pivots + waving flags, daytime sky/clouds,
 * and shadow-casting sun light.
 */
export class CastleStage {
  readonly root = new THREE.Group();
  readonly doors = new DoorController();
  private flags: WavingFlag[] = [];
  private elapsed = 0;

  constructor(private scene: THREE.Scene) {
    stageInstance = this;
    this.scene.add(this.root);
    this.buildEnvironment();
  }

  async load(): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(ASSET.glb);
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
    setDoorController(this.doors);
    this.placeFlags(castle);
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

  /** Cover baked banners with cloth flags that wave in the wind. */
  private placeFlags(castle: THREE.Object3D): void {
    castle.updateMatrixWorld(true);
    const doorL = castle.getObjectByName('baked_door_l');
    const doorR = castle.getObjectByName('baked_door_r');
    const doorBox = new THREE.Box3();
    if (doorL) doorBox.expandByObject(doorL);
    if (doorR) doorBox.expandByObject(doorR);

    const frontZ = (doorBox.isEmpty() ? 70 : doorBox.max.z) + 3;
    const topY = doorBox.isEmpty() ? 95 : doorBox.min.y + (doorBox.max.y - doorBox.min.y) * 1.05;
    const flagW = 30;
    const flagH = 58;
    const xOff = 58;
    const tex = makeFlagTexture();

    const specs: Array<{ x: number; flip: boolean; phase: number }> = [
      { x: -xOff, flip: false, phase: 0.4 },
      { x: xOff, flip: true, phase: 1.7 },
    ];

    for (const s of specs) {
      const flag = new WavingFlag(flagW, flagH, tex.clone(), s.phase);
      flag.mesh.position.set(s.x, topY, frontZ);
      // Outer edge is the pole: left flag pole on −X, right on +X via scale.
      if (s.flip) {
        flag.mesh.scale.x = -1;
        flag.mesh.position.x = s.x;
      }
      this.root.add(flag.mesh);
      this.flags.push(flag);
    }
  }

  private buildEnvironment(): void {
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0xb9d9ef, 720, 1450);

    this.addClouds();

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(560, 32),
      new THREE.MeshStandardMaterial({ color: 0x5f9b52, metalness: 0, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.root.add(ground);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(70, 240, 32),
      new THREE.MeshStandardMaterial({
        color: 0x7eb86a,
        metalness: 0,
        roughness: 0.95,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.receiveShadow = true;
    this.root.add(ring);

    // Slightly lower ambient so sun shadows read clearly.
    this.root.add(new THREE.AmbientLight(0xfff6e8, 0.55));
    this.root.add(new THREE.HemisphereLight(0xb8dfff, 0x6a9a50, 0.45));

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.35);
    sun.position.set(160, 320, 180);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.035;
    const cam = sun.shadow.camera;
    cam.near = 40;
    cam.far = 900;
    cam.left = -320;
    cam.right = 320;
    cam.top = 280;
    cam.bottom = -120;
    cam.updateProjectionMatrix();
    this.root.add(sun);
    this.root.add(sun.target);
    sun.target.position.set(0, 40, 40);
  }

  private addClouds(): void {
    const tex = makeCloudTexture();
    const placements: Array<[number, number, number, number]> = [
      [-280, 220, -180, 160],
      [200, 250, -220, 190],
      [-40, 280, -320, 220],
      [320, 210, 40, 150],
      [-360, 240, 120, 170],
      [80, 300, 200, 200],
      [-160, 260, 280, 140],
      [260, 230, -80, 175],
    ];

    for (const [x, y, z, size] of placements) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        fog: true,
        opacity: 0.92,
        color: 0xffffff,
      });
      const cloud = new THREE.Sprite(mat);
      cloud.position.set(x, y, z);
      cloud.scale.set(size * 1.8, size, 1);
      this.root.add(cloud);
    }
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.doors.update(dt);
    for (const f of this.flags) f.update(this.elapsed);
  }

  dispose(): void {
    if (stageInstance === this) stageInstance = null;
    this.scene.remove(this.root);
    for (const f of this.flags) f.dispose();
    this.flags = [];
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

function makeCloudTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, w, h);

  const blobs: Array<[number, number, number]> = [
    [0.32, 0.58, 0.28],
    [0.48, 0.48, 0.34],
    [0.62, 0.55, 0.3],
    [0.4, 0.62, 0.22],
    [0.55, 0.64, 0.2],
    [0.7, 0.6, 0.18],
  ];
  for (const [ux, uy, ur] of blobs) {
    const x = ux * w;
    const y = uy * h;
    const r = ur * h;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
