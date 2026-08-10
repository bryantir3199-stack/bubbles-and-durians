import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ASSET = {
  glb: 'assets/castle/castle.glb',
};

/**
 * Loads castle2.glb (embedded textures) and sets up night lighting.
 */
export class CastleStage {
  readonly root = new THREE.Group();

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
      obj.castShadow = true;
      obj.receiveShadow = true;

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!(mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial)) {
          continue;
        }
        if (mat.map) {
          mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.map.anisotropy = 8;
          mat.map.needsUpdate = true;
        }
        mat.needsUpdate = true;
      }
    });

    // Blender units → match existing camera framing (prior FBX used ×100)
    castle.scale.setScalar(100);
    castle.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(castle);
    const center = box.getCenter(new THREE.Vector3());
    castle.position.x -= center.x;
    castle.position.z -= center.z;
    castle.position.y -= box.min.y;

    this.root.add(castle);
  }

  private buildEnvironment(): void {
    this.scene.background = new THREE.Color(0x1e3a66);
    this.scene.fog = new THREE.Fog(0x1e3a66, 520, 1100);

    const starCount = 500;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 520 + Math.random() * 180;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.02 + Math.random() * 0.72);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi));
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPos, 3)),
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2.6,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        fog: false,
      }),
    );
    this.root.add(stars);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(560, 64),
      new THREE.MeshStandardMaterial({ color: 0x16122a, roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.root.add(ground);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(70, 240, 64),
      new THREE.MeshStandardMaterial({ color: 0x221c38, roughness: 1, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    this.root.add(ring);

    const ambient = new THREE.AmbientLight(0x8aa0c0, 0.75);
    this.root.add(ambient);

    const moon = new THREE.DirectionalLight(0xd8e6ff, 1.45);
    moon.position.set(-140, 300, 220);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.near = 20;
    moon.shadow.camera.far = 700;
    moon.shadow.camera.left = -280;
    moon.shadow.camera.right = 280;
    moon.shadow.camera.top = 280;
    moon.shadow.camera.bottom = -280;
    this.root.add(moon);

    const fill = new THREE.DirectionalLight(0xffc090, 0.55);
    fill.position.set(180, 140, 160);
    this.root.add(fill);

    const frontFill = new THREE.DirectionalLight(0xffffff, 0.35);
    frontFill.position.set(0, 160, 320);
    this.root.add(frontFill);

    const gateGlow = new THREE.PointLight(0xffcc66, 2.2, 260, 1.8);
    gateGlow.position.set(0, 45, 155);
    this.root.add(gateGlow);
  }

  update(_dt: number): void {}

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
