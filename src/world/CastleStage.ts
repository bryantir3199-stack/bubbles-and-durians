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
 * Soft wind on the baked-in crown banners (part of `baked2`).
 * UV-island AND front/flank exclusions — same one-mesh approach as the earlier
 * castle, without a broad spatial OR that dragged the gate arch stone.
 *
 * Note: three r185 does not `#define USE_UV` for mapped standard materials
 * (it uses USE_MAP + MAP_UV). The `uv` attribute is still always present, so
 * do not gate this block on USE_UV or the wind compiles out entirely.
 *
 * Shadow-map depth passes also call `onBeforeCompile`; share one uWindTime
 * uniform object so updates reach the color program, not only the last compile.
 */
function applyBakedFlagWind(material: THREE.Material): void {
  material.customProgramCacheKey = () => 'bakedFlagWindV10';
  const windTime = { value: 0 };
  material.userData.uWindTime = windTime;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTime;

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
{
  // Crown-banner atlas islands (glTF flipY=false), including the free bottom edge.
  float bu = uv.x;
  float bv = uv.y;
  float island =
    step(0.0, bu) * step(bu, 0.070) *
    step(0.068, bv) * step(bv, 0.165);
  // AND-only position gates so UV reuse elsewhere (and the arch) stay still.
  float onFront = step(1.15, position.z);
  float awayFromGate = step(0.55, abs(position.x));
  float flagMask = island * onFront * awayFromGate;
  if (flagMask > 0.5) {
    // Free edge hangs down (low Y / low V); top stays pinned.
    float hang = max(
      clamp((0.92 - position.y) / 0.55, 0.0, 1.0),
      clamp((0.152 - bv) / 0.072, 0.0, 1.0)
    );
    hang *= flagMask;
    float phase = position.x * 10.0 + position.y * 7.0 + bu * 40.0;
    float flutter = sin(uWindTime * 3.2 + phase) * 0.8
      + sin(uWindTime * 5.1 + phase * 1.6) * 0.4;
    float amp = hang * hang;
    // Large Z flap toward the play camera so coplanar wall banners read clearly.
    transformed.z += flutter * amp * 0.22;
    transformed.x += flutter * amp * 0.10 * sign(position.x + 0.0001);
    transformed.y += sin(uWindTime * 2.6 + phase * 0.8) * amp * 0.04;
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
    // Day sky — between original deep blue and the high-exposure cyan.
    this.scene.background = new THREE.Color(0x98d8f5);
    this.scene.fog = new THREE.Fog(0xb9d9ef, 750, 1500);

    this.addClouds();

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(560, 32),
      new THREE.MeshStandardMaterial({ color: 0x649e54, metalness: 0, roughness: 0.95 }),
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

    this.root.add(new THREE.AmbientLight(0xfff6e8, 0.7));
    this.root.add(new THREE.HemisphereLight(0xb8dfff, 0x6a9a50, 0.55));

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.75);
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

    const fill = new THREE.DirectionalLight(0xd8ecff, 0.35);
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
      const windTime = mat.userData.uWindTime as { value: number } | undefined;
      if (windTime) windTime.value = this.elapsed;
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
