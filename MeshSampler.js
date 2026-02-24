import * as THREE from 'three';

/**
 * Sample random points distributed uniformly on the surface of a BufferGeometry.
 * Uses area-weighted triangle sampling + barycentric coordinates.
 * Returns array of { position: Vector3, normal: Vector3 }
 */
export function sampleSurface(geometry, count) {
  // STL loader gives non-indexed geometry with normals per face
  const posAttr = geometry.attributes.position;
  const normAttr = geometry.attributes.normal;
  const triCount = posAttr.count / 3;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();

  // Build cumulative area array for weighted sampling
  const cumulativeAreas = new Float64Array(triCount);
  let totalArea = 0;

  for (let i = 0; i < triCount; i++) {
    a.fromBufferAttribute(posAttr, i * 3);
    b.fromBufferAttribute(posAttr, i * 3 + 1);
    c.fromBufferAttribute(posAttr, i * 3 + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    totalArea += ab.clone().cross(ac).length() * 0.5;
    cumulativeAreas[i] = totalArea;
  }

  const points = [];

  for (let s = 0; s < count; s++) {
    // Pick triangle weighted by area
    const r = Math.random() * totalArea;
    let lo = 0, hi = triCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulativeAreas[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    const ti = lo;

    // Random barycentric coordinates
    let u = Math.random();
    let v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }

    a.fromBufferAttribute(posAttr, ti * 3);
    b.fromBufferAttribute(posAttr, ti * 3 + 1);
    c.fromBufferAttribute(posAttr, ti * 3 + 2);

    const position = new THREE.Vector3()
      .addScaledVector(a, 1 - u - v)
      .addScaledVector(b, u)
      .addScaledVector(c, v);

    // Face normal from geometry (STL provides per-face normals)
    const normal = normAttr
      ? new THREE.Vector3().fromBufferAttribute(normAttr, ti * 3).normalize()
      : ab.subVectors(b, a).cross(ac.subVectors(c, a)).normalize();

    points.push({ position, normal });
  }

  return points;
}

/**
 * Normalize a geometry: center it and scale so its longest dimension = targetSize.
 * Returns the scale factor applied (useful for setting connectionRadius).
 */
export function normalizeGeometry(geometry, targetSize = 2.0) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = targetSize / maxDim;

  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();

  return scale;
}
