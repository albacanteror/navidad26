// Sky shell objects: the moon and low-poly cloud blobs.

import { MeshBuilder, sphere, ellipsoid, xform } from '../geometry/mesh.js';

export const moonMaterialSet = { moon: 'moon' };
export const cloudMaterialSet = { cloud: 'cloud' };

export function buildMoon(radius) {
  const b = new MeshBuilder();
  b.add('root', sphere(radius, 10, 7), 'moon');
  return b.build();
}

/** A cloud: a few flattened ellipsoids. Model space: X/Z spread, Y = up from the planet. */
export function buildCloud(rng, size, blobs) {
  const b = new MeshBuilder();
  for (let i = 0; i < blobs; i++) {
    const r = size * rng.range(0.3, 0.55);
    const t = [rng.range(-0.6, 0.6) * size, rng.range(-0.1, 0.15) * size, rng.range(-0.3, 0.3) * size];
    b.add('root', xform(ellipsoid(r, r * rng.range(0.35, 0.55), r * rng.range(0.6, 0.9), 7, 4), { t, r: [0, rng.range(0, 180), 0] }), 'cloud');
  }
  return b.build();
}
