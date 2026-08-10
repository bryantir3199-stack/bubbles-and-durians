import * as THREE from 'three';

/**
 * Segmented cloth flag that waves in the wind (procedural vertex displace).
 * Pole is on the local −X edge; free edge is +X.
 */
export class WavingFlag {
  readonly mesh: THREE.Mesh;
  private readonly base: Float32Array;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly width: number;
  private phase: number;

  constructor(
    width: number,
    height: number,
    texture: THREE.Texture,
    phase = 0,
  ) {
    this.phase = phase;
    this.width = width;
    const geo = new THREE.PlaneGeometry(width, height, 8, 12);
    // Pole along left (−X); hang downward in −Y from top.
    geo.translate(width * 0.5, -height * 0.5, 0);

    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      metalness: 0,
      roughness: 0.85,
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;

    this.posAttr = geo.attributes.position as THREE.BufferAttribute;
    this.base = new Float32Array(this.posAttr.array as Float32Array);
  }

  update(time: number): void {
    const arr = this.posAttr.array as Float32Array;
    const w = this.width;
    for (let i = 0; i < this.posAttr.count; i++) {
      const ix = i * 3;
      const x0 = this.base[ix]!;
      const y0 = this.base[ix + 1]!;
      const along = THREE.MathUtils.clamp(x0 / Math.max(0.001, w), 0, 1);
      const flap = along * along;
      const wave =
        Math.sin(y0 * 0.12 + time * 3.2 + this.phase) * 4.5 * flap +
        Math.sin(y0 * 0.28 + time * 5.1 + this.phase * 1.3) * 2.2 * flap;
      const lift = Math.sin(x0 * 0.08 + time * 2.4 + this.phase) * 1.6 * flap;
      arr[ix] = x0;
      arr[ix + 1] = y0 + lift * 0.35;
      arr[ix + 2] = wave;
    }
    this.posAttr.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.map?.dispose();
    mat.dispose();
  }
}

/** Blue banner with a simple gold crown (covers baked static flags). */
export function makeFlagTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;

  g.fillStyle = '#1a6fd4';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#155db3';
  g.fillRect(0, 0, 10, h);

  // Gold crown
  g.fillStyle = '#ffe566';
  g.strokeStyle = '#d4a800';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(34, 110);
  g.lineTo(40, 70);
  g.lineTo(54, 95);
  g.lineTo(64, 58);
  g.lineTo(74, 95);
  g.lineTo(88, 70);
  g.lineTo(94, 110);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillRect(34, 110, 60, 14);
  g.beginPath();
  g.arc(64, 58, 5, 0, Math.PI * 2);
  g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}
