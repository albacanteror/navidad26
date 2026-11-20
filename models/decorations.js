// Christmas decorations shared by the tree models.

import { sphere, ellipsoid, xform } from '../geometry/mesh.js';

/** A small mistletoe cluster (leaves + white berries) hanging at `at`. */
export function addMistletoe(builder, at) {
  const [x, y, z] = at;
  const leaves = [
    [0.0, 0.0, 0.0, 0, 0, 30],
    [0.1, -0.05, 0.05, 0, 40, -35],
    [-0.08, -0.04, 0.06, 0, -30, 50],
    [0.02, -0.1, -0.06, 20, 0, 0],
  ];
  for (const [dx, dy, dz, rx, ry, rz] of leaves) {
    builder.add('root', xform(ellipsoid(0.07, 0.15, 0.04, 5, 3), { t: [x + dx, y + dy, z + dz], r: [rx, ry, rz] }), 'mistletoeLeaf');
  }
  const berries = [[0.02, 0.06, 0.06], [-0.05, 0.03, 0.08], [0.07, 0.02, 0.07]];
  for (const [dx, dy, dz] of berries) {
    builder.add('root', xform(sphere(0.04, 5, 3), { t: [x + dx, y + dy, z + dz] }), 'mistletoeBerry');
  }
}
