import * as THREE from 'three';

/** Unlit material for mobile — baked maps already contain lighting. */
export function unlitFromPbr(mat: THREE.Material, albedoScale = 1): THREE.Material {
  if (!(mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial)) {
    return mat;
  }
  if (mat.map) {
    mat.map.colorSpace = THREE.SRGBColorSpace;
    mat.map.anisotropy = 1;
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
