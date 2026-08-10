import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyCastleMarkers, type DoorBounds, type Vec3, type WindowSpot } from '../config/spawnLayout';
import { DoorController, setDoorController } from './DoorController';

const ASSET = {
  glb: 'assets/castle/castle.glb',
};

let stageInstance: CastleStage | null = null;

export function getCastleStage(): CastleStage | null {
  return stageInstance;
}

/**
 * Soft wind on the baked-in banners (painted into `baked2` mesh).
 * Vertex positions are castle-local (pre-scale meters).
 */
function applyBakedFlagWind(material: THREE.Material): void {
  material.customProgramCacheKey = () => 'bakedFlagWind';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = { value: 0 };
    material.userData.windShader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
uniform float uWindTime;
`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
// Four front-wall banners: vertical strips flanking the door on baked2.
{
  float ax = abs(position.x);
  float inner = smoothstep(0.28, 0.34, ax) * (1.0 - smoothstep(0.50, 0.56, ax));
  float outer = smoothstep(0.58, 0.64, ax) * (1.0 - smoothstep(0.82, 0.90, ax));
  float bannerX = max(inner, outer);
  float bannerY = smoothstep(0.52, 0.62, position.y) * (1.0 - smoothstep(1.28, 1.38, position.y));
  float bannerZ = smoothstep(1.14, 1.22, position.z);
  float flagMask = bannerX * bannerY * bannerZ;
  if (flagMask > 0.01) {
    float hang = clamp((1.28 - position.y) / 0.7, 0.0, 1.0);
    float phase = position.x * 11.0 + position.y * 6.0;
    float flutter = sin(uWindTime * 2.8 + phase) * 0.6
      + sin(uWindTime * 4.4 + phase * 1.7) * 0.32;
    transformed.z += flutter * hang * hang * flagMask * 0.045;
    transformed.x += sin(uWindTime * 2.1 + phase * 0.55) * hang * flagMask * 0.012;
  }
}
`,
      );
  };
  material.needsUpdate = true;
}

/**
 * Loads castle.glb, wires door pivots, daytime sky/clouds,
 * shadow-casting sun, and wind on the baked banners.
 */
export class CastleStage {
  readonly root = new THREE.Group();
  readonly doors = new DoorController();
  private windMaterials: THREE.Material[] = [];
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
        // Lift baked albedo so daylight reads brighter under ACES exposure.
        mat.color.multiplyScalar(1.1);
        if (mat.map) {
          mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.map.anisotropy = 1;
          mat.map.generateMipmaps = true;
          mat.map.minFilter = THREE.LinearMipmapLinearFilter;
          mat.map.magFilter = THREE.LinearFilter;
          mat.map.needsUpdate = true;
        }
        if (obj.name === 'baked2') {
          applyBakedFlagWind(mat);
          this.windMaterials.push(mat);
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

  private buildEnvironment(): void {
    // Brighter day sky + lighter haze so the stage reads more exposed.
    this.scene.background = new THREE.Color(0x9fd8f5);
    this.scene.fog = new THREE.Fog(0xc5e6f8, 780, 1550);

    this.addClouds();

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(560, 32),
      new THREE.MeshStandardMaterial({ color: 0x6aab58, metalness: 0, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.root.add(ground);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(70, 240, 32),
      new THREE.MeshStandardMaterial({
        color: 0x8bc875,
        metalness: 0,
        roughness: 0.95,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.receiveShadow = true;
    this.root.add(ring);

    this.root.add(new THREE.AmbientLight(0xfff8ee, 0.85));
    this.root.add(new THREE.HemisphereLight(0xc4e6ff, 0x7aab5a, 0.7));

    const sun = new THREE.DirectionalLight(0xfff5e0, 2.15);
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

    const fill = new THREE.DirectionalLight(0xd8ecff, 0.45);
    fill.position.set(-200, 160, 100);
    this.root.add(fill);
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
    for (const mat of this.windMaterials) {
      const shader = mat.userData.windShader as
        | { uniforms: { uWindTime: { value: number } } }
        | undefined;
      if (shader?.uniforms?.uWindTime) {
        shader.uniforms.uWindTime.value = this.elapsed;
      }
    }
  }

  dispose(): void {
    if (stageInstance === this) stageInstance = null;
    this.scene.remove(this.root);
    this.windMaterials = [];
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
