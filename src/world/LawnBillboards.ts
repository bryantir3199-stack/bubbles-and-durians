import * as THREE from 'three';

/** Static play camera XZ — billboards yaw to face this point. */
const CAM_X = 0;
const CAM_Z = 635;

const FRENZY_TINT = new THREE.Color(0xff9a48);

type Kind = 'grass' | 'tree';

type Tuft = { kind: Kind; x: number; z: number; h: number; flip: boolean };

const KIND_URL: Record<Kind, string> = {
  grass: 'assets/grass.png',
  tree: 'assets/tree.png',
};

/**
 * Cartoon lawn props as Y-axis billboards (grass tufts + trees).
 * Shared plane; planted at y=0 with the pivot at the base.
 */
export class LawnBillboards {
  private readonly group = new THREE.Group();
  private readonly geo: THREE.PlaneGeometry;
  private readonly tmpTint = new THREE.Color(0xffffff);
  private readonly layers = new Map<Kind, { map: THREE.Texture; mat: THREE.MeshBasicMaterial }>();

  constructor() {
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.geo.translate(0, 0.5, 0);
    this.group.name = 'lawn-billboards';
  }

  async load(parent: THREE.Object3D): Promise<void> {
    const loader = new THREE.TextureLoader();
    const kinds: Kind[] = ['grass', 'tree'];
    const maps = await Promise.all(kinds.map((k) => loader.loadAsync(KIND_URL[k])));

    for (let i = 0; i < kinds.length; i++) {
      const kind = kinds[i]!;
      const map = maps[i]!;
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 1;
      const mat = new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        alphaTest: 0.45,
        depthTest: true,
        depthWrite: true,
        side: THREE.DoubleSide,
      });
      this.layers.set(kind, { map, mat });
    }

    const aspect: Record<Kind, number> = { grass: 1, tree: 1 };
    for (const kind of kinds) {
      const img = this.layers.get(kind)!.map.image as { width: number; height: number };
      aspect[kind] = img.width / Math.max(1, img.height);
    }

    for (const tuft of [...buildGrass(), ...buildTrees()]) {
      const layer = this.layers.get(tuft.kind);
      if (!layer) continue;
      const mesh = new THREE.Mesh(this.geo, layer.mat);
      mesh.position.set(tuft.x, 0.12, tuft.z);
      mesh.scale.set(tuft.h * aspect[tuft.kind] * (tuft.flip ? -1 : 1), tuft.h, 1);
      mesh.lookAt(CAM_X, mesh.position.y, CAM_Z);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      this.group.add(mesh);
    }

    parent.add(this.group);
  }

  /** Multiply painted greens toward autumn as frenzy look `t` goes 0→1. */
  setFrenzy(t: number): void {
    this.tmpTint.set(0xffffff).lerp(FRENZY_TINT, t);
    for (const layer of this.layers.values()) {
      layer.mat.color.copy(this.tmpTint);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geo.dispose();
    for (const layer of this.layers.values()) {
      layer.mat.dispose();
      layer.map.dispose();
    }
    this.layers.clear();
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

function onCastle(x: number, z: number): boolean {
  const cx = x / 175;
  const cz = (z - 8) / 88;
  return cx * cx + cz * cz < 1;
}

function inViewLawn(x: number, z: number): boolean {
  if (z > 415 || z < -50) return false;
  if (Math.abs(x) > 400) return false;
  return true;
}

function onGatePath(x: number, z: number, half = 52): boolean {
  return Math.abs(x) < half && z > 45 && z < 275;
}

function tooClose(tufts: Tuft[], x: number, z: number, h: number, spread: number): boolean {
  for (const t of tufts) {
    const dx = t.x - x;
    const dz = t.z - z;
    const minDist = (t.h + h) * spread;
    if (dx * dx + dz * dz < minDist * minDist) return true;
  }
  return false;
}

function buildGrass(): Tuft[] {
  const rng = mulberry32(0x61a55);
  const tufts: Tuft[] = [];

  const tryAdd = (x: number, z: number, h: number): boolean => {
    if (!inViewLawn(x, z) || onGatePath(x, z) || onCastle(x, z)) return false;
    if (tooClose(tufts, x, z, h, 0.58)) return false;
    tufts.push({ kind: 'grass', x, z, h, flip: rng() > 0.5 });
    return true;
  };

  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const z = 108 + i * 36 + (rng() - 0.5) * 14;
      const x = side * (60 + rng() * 20);
      tryAdd(x, z, 16 + rng() * 9);
    }
  }

  for (let i = 0; i < 120 && tufts.length < 58; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    const z = 95 + rng() * 310;
    const x = side * (78 + rng() * 240);
    const nearCam = Math.max(0, z - 240) * 0.035;
    tryAdd(x, z, 15 + rng() * 11 + nearCam);
  }

  for (let i = 0; i < 24 && tufts.length < 68; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    const z = -25 + rng() * 115;
    const x = side * (195 + rng() * 130);
    tryAdd(x, z, 15 + rng() * 10);
  }

  return tufts;
}

function buildTrees(): Tuft[] {
  const rng = mulberry32(0xc0a57e);
  const tufts: Tuft[] = [];

  const tryAdd = (x: number, z: number, h: number): boolean => {
    if (!inViewLawn(x, z) || onCastle(x, z)) return false;
    // Wider berth than grass so trunks don't sit on the walking lane
    // or hide the castle facade.
    if (onGatePath(x, z, 100)) return false;
    if (Math.abs(x) < 145 && z > 70 && z < 210) return false;
    if (tooClose(tufts, x, z, h, 0.48)) return false;
    tufts.push({ kind: 'tree', x, z, h, flip: rng() > 0.5 });
    return true;
  };

  // Outer rows left / right of the approach.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const z = 55 + i * 58 + (rng() - 0.5) * 22;
      const x = side * (190 + rng() * 120 + (z > 280 ? 30 : 0));
      const h = 54 + rng() * 26 + Math.max(0, z - 260) * 0.04;
      tryAdd(x, z, h);
    }
  }

  // A few keep-flank trees still in frame.
  for (let i = 0; i < 8 && tufts.length < 16; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    const z = -20 + rng() * 90;
    const x = side * (210 + rng() * 110);
    tryAdd(x, z, 56 + rng() * 22);
  }

  return tufts;
}
