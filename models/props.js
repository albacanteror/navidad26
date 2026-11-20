// Small rigid props: projectiles (snowball, coal, gift) and the star.
// Single posture each. Model space centered at the origin.

import { MeshBuilder, sphere, ellipsoid, box, star5, xform } from '../geometry/mesh.js';

export const projectileMaterialSets = {
  snowball: { main: 'snowball' },
  coal: { main: 'coal' },
  gift: { main: 'giftBox', ribbon: 'giftRibbon' },
};

export const projectileBuilders = {
  snowball() {
    const b = new MeshBuilder();
    b.add('root', sphere(0.14, 7, 5), 'main');
    return b.build();
  },
  coal() {
    const b = new MeshBuilder();
    b.add('root', xform(ellipsoid(0.13, 0.1, 0.11, 6, 4), { r: [20, 30, 10] }), 'main');
    b.add('root', xform(ellipsoid(0.07, 0.06, 0.08, 5, 3), { t: [0.08, 0.04, 0.02] }), 'main');
    return b.build();
  },
  gift() {
    const b = new MeshBuilder();
    b.add('root', box(0.24, 0.22, 0.24), 'main');
    b.add('root', box(0.26, 0.235, 0.06), 'ribbon');
    b.add('root', box(0.06, 0.235, 0.26), 'ribbon');
    b.add('root', xform(ellipsoid(0.07, 0.04, 0.03, 5, 3), { t: [0.04, 0.13, 0], r: [0, 0, 30] }), 'ribbon');
    b.add('root', xform(ellipsoid(0.07, 0.04, 0.03, 5, 3), { t: [-0.04, 0.13, 0], r: [0, 0, -30] }), 'ribbon');
    return b.build();
  },
};

export const starMaterialSet = { star: 'starGold' };

export function buildStar() {
  const b = new MeshBuilder();
  b.add('root', star5(0.75, 0.32, 0.26), 'star');
  b.add('root', sphere(0.2, 7, 4), 'star');
  return b.build();
}
