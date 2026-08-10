import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DoorController, setDoorController } from './DoorController';

const ASSET = {
  glb: 'assets/castle/castle.glb',
};

/**
 * Loads castle2.glb (embedded textures), wires door pivots, and sets up a cheap night backdrop.
 */
export class CastleStage {
  readonly root = new THREE.Group();
  readonly doors = new DoorController();

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.root);
    this.buildEnvironment();
  }

  async load(): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(ASSET.glb);
    const castle = gltf.scene;

    castle.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
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
    this.doors.setup(castle);
    setDoorController(this.doors);
  }

  private buildEnvironment(): void {
    this.scene.background = new THREE.Color(0x1e3a66);
    this.scene.fog = new THREE.Fog(0x1e3a66, 620, 1200);

    const starCount = 120;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 520 + Math.random() * 180;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.02 + Math.random() * 0.72);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi));
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    this.root.add(
      new THREE.Points(
        new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPos, 3)),
        new THREE.PointsMaterial({
          color: 0xffffff,
          size: 2.4,
          sizeAttenuation: true,
          depthWrite: false,
          fog: false,
        }),
      ),
    );

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(560, 24),
      new THREE.MeshBasicMaterial({ color: 0x16122a }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    this.root.add(ground);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(70, 240, 32),
      new THREE.MeshBasicMaterial({ color: 0x221c38, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    this.root.add(ring);

    this.root.add(new THREE.AmbientLight(0xb0c4de, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(-80, 220, 200);
    this.root.add(key);
  }

  update(dt: number): void {
    this.doors.update(dt);
  }

  dispose(): void {
    this.scene.remove(this.root);
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) m.dispose();
      }
    });
  }
}
