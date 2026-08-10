import * as THREE from 'three';

type FlagVert = {
  index: number;
  origin: THREE.Vector3;
  /** 0 at the fixed top, 1 at the free hanging edge. */
  hang: number;
  phase: number;
};

/**
 * Soft cloth-style wave for the two front banners baked into `baked2`.
 * CPU vertex displacement (same strips the old shader masked via spatial×UV).
 */
export class FlagWaver {
  private verts: FlagVert[] = [];
  private positions: THREE.BufferAttribute | null = null;
  private time = 0;

  setup(castle: THREE.Object3D): void {
    let baked: THREE.Mesh | null = null;
    castle.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.name === 'baked2') baked = obj;
    });
    if (!baked) return;

    const mesh: THREE.Mesh = baked;
    const geom = mesh.geometry;
    const pos = geom.attributes.position as THREE.BufferAttribute;
    const uv = geom.attributes.uv as THREE.BufferAttribute | undefined;
    if (!uv) return;

    const local = new THREE.Vector3();
    const candidates: { index: number; local: THREE.Vector3 }[] = [];

    for (let i = 0; i < pos.count; i++) {
      local.fromBufferAttribute(pos, i);
      const ax = Math.abs(local.x);
      // Door-flanking crown banners (local meters on baked2).
      // Verified: |x| 0.575–0.812, y 0.276–0.904, z ≥ 1.22
      const spatial =
        ax >= 0.54 &&
        ax <= 0.86 &&
        local.y >= 0.26 &&
        local.y <= 0.98 &&
        local.z >= 1.22;
      if (!spatial) continue;

      const bu = uv.getX(i);
      const bv = uv.getY(i);
      const island = bu >= 0 && bu <= 0.07 && bv >= 0.068 && bv <= 0.165;
      if (!island) continue;

      candidates.push({ index: i, local: local.clone() });
    }
    if (candidates.length < 8) return;

    this.verts = candidates.map((c) => {
      const hang = THREE.MathUtils.clamp((0.9 - c.local.y) / 0.58, 0, 1);
      return {
        index: c.index,
        origin: c.local.clone(),
        hang,
        phase: c.local.x * 10 + c.local.y * 7,
      };
    });

    this.positions = pos;
  }

  update(dt: number): void {
    if (!this.positions || this.verts.length === 0) return;
    this.time += dt;

    const pos = this.positions;
    const t = this.time;
    for (const v of this.verts) {
      const amp = v.hang;
      if (amp < 0.02) {
        pos.setXYZ(v.index, v.origin.x, v.origin.y, v.origin.z);
        continue;
      }

      // Gentle cloth flutter — about 1/4 of the original shader amplitude.
      const flutter =
        Math.sin(t * 1.8 + v.phase) * 0.55 + Math.sin(t * 2.9 + v.phase * 1.6) * 0.22;
      const side = Math.sign(v.origin.x || 0.0001);

      pos.setXYZ(
        v.index,
        v.origin.x + flutter * amp * 0.022 * side,
        v.origin.y + Math.sin(t * 1.5 + v.phase * 0.8) * amp * 0.009,
        v.origin.z + flutter * amp * 0.055,
      );
    }
    pos.needsUpdate = true;
  }
}
