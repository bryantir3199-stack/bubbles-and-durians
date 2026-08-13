import * as THREE from 'three';

const GRASS_URL = 'assets/grass.png';

/** Static play camera XZ — billboards yaw to face this point. */
const CAM_X = 0;
const CAM_Z = 635;

const FRENZY_TINT = new THREE.Color(0xff9a48);

type Tuft = { x: number; z: number; h: number; flip: boolean };

/**
 * Cartoon grass tufts as Y-axis billboards on the castle lawn.
 * Shared geometry + material; planted at y=0 with the pivot at the base.
 */
export class GrassBillboards {
  private readonly group = new THREE.Group();
  private readonly geo: THREE.PlaneGeometry;
  private readonly tmpTint = new THREE.Color(0xffffff);
  private map: THREE.Texture | null = null;
  private mat: THREE.MeshBasicMaterial | null = null;

  constructor() {
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.geo.translate(0, 0.5, 0);
    this.group.name = 'grass-billboards';
  }

  async load(parent: THREE.Object3D): Promise<void> {
    const map = await new THREE.TextureLoader().loadAsync(GRASS_URL);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 1;
    this.map = map;

    this.mat = new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      alphaTest: 0.45,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
    });

    const img = map.image as { width: number; height: number };
    const aspect = img.width / Math.max(1, img.height);

    for (const tuft of buildTufts()) {
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.position.set(tuft.x, 0.12, tuft.z);
      mesh.scale.set(tuft.h * aspect * (tuft.flip ? -1 : 1), tuft.h, 1);
      mesh.lookAt(CAM_X, mesh.position.y, CAM_Z);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      this.group.add(mesh);
    }

    parent.add(this.group);
  }

  /** Multiply the painted green toward autumn as frenzy look `t` goes 0→1. */
  setFrenzy(t: number): void {
    if (!this.mat) return;
    this.tmpTint.set(0xffffff).lerp(FRENZY_TINT, t);
    this.mat.color.copy(this.tmpTint);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geo.dispose();
    this.mat?.dispose();
    this.mat = null;
    this.map?.dispose();
    this.map = null;
  }
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blocked(x: number, z: number): boolean {
  if (z > 415 || z < -50) return true;
  if (Math.abs(x) > 400) return true;
  // Keep the gate approach clear for walking targets.
  if (Math.abs(x) < 52 && z > 45 && z < 275) return true;
  // Castle keep / towers (ellipse around the door).
  const cx = x / 175;
  const cz = (z - 8) / 88;
  if (cx * cx + cz * cz < 1) return true;
  return false;
}

function buildTufts(): Tuft[] {
  const rng = mulberry32(0x61a55);
  const tufts: Tuft[] = [];

  const tryAdd = (x: number, z: number, h: number): boolean => {
    if (blocked(x, z)) return false;
    for (const t of tufts) {
      const dx = t.x - x;
      const dz = t.z - z;
      const minDist = (t.h + h) * 0.58;
      if (dx * dx + dz * dz < minDist * minDist) return false;
    }
    tufts.push({ x, z, h, flip: rng() > 0.5 });
    return true;
  };

  // Line the walkway on both sides.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const z = 108 + i * 36 + (rng() - 0.5) * 14;
      const x = side * (60 + rng() * 20);
      tryAdd(x, z, 16 + rng() * 9);
    }
  }

  // Front lawn scatter (left / right of the path).
  for (let i = 0; i < 120 && tufts.length < 58; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    const z = 95 + rng() * 310;
    const x = side * (78 + rng() * 240);
    const nearCam = Math.max(0, z - 240) * 0.035;
    tryAdd(x, z, 15 + rng() * 11 + nearCam);
  }

  // Flanks beside the keep, still in frame.
  for (let i = 0; i < 24 && tufts.length < 68; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    const z = -25 + rng() * 115;
    const x = side * (195 + rng() * 130);
    tryAdd(x, z, 15 + rng() * 10);
  }

  return tufts;
}
