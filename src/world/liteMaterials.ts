import * as THREE from 'three';

const MOBILE_MAX_TEX = 1024;

/** Shrink huge maps so iOS Metal isn't sampling 2048² every fragment. */
export function capTextureSize(tex: THREE.Texture, maxSize = MOBILE_MAX_TEX): void {
  const img = tex.image as { width: number; height: number } | undefined;
  if (!img || !img.width || Math.max(img.width, img.height) <= maxSize) return;
  const scale = maxSize / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
  tex.image = canvas;
  tex.needsUpdate = true;
}

/** Unlit material for mobile — baked maps already contain lighting. */
export function unlitFromPbr(mat: THREE.Material, albedoScale = 1): THREE.Material {
  if (!(mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial)) {
    return mat;
  }
  if (mat.map) {
    capTextureSize(mat.map);
    mat.map.colorSpace = THREE.SRGBColorSpace;
    mat.map.anisotropy = 1;
    mat.map.generateMipmaps = true;
    mat.map.minFilter = THREE.LinearMipmapLinearFilter;
    mat.map.magFilter = THREE.LinearFilter;
    mat.map.needsUpdate = true;
  }
  const next = new THREE.MeshBasicMaterial({
    name: mat.name,
    color: mat.color.clone().multiplyScalar(albedoScale),
    map: mat.map,
    transparent: mat.transparent,
    opacity: mat.opacity,
    side: mat.side,
    alphaTest: mat.alphaTest,
    vertexColors: mat.vertexColors,
    depthWrite: mat.depthWrite,
    depthTest: mat.depthTest,
  });
  mat.dispose();
  return next;
}
