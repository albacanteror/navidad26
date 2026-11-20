// Enemy: a snow goblin with a Santa hat.
//  body : truncated ellipsoid (the ground cuts the ellipsoid in the middle, tip up)
//  arms : elongated ellipsoids
//  head : sphere
//  hat  : cone + torus at its base + sphere on the tip
// Model space: feet at y = 0, facing +Z, its left side is +X.
// Postures: emerge0/1, idleL/R, walkA/B, throwA/B.

import { MeshBuilder, ellipsoid, sphere, cone, torus, xform } from '../geometry/mesh.js';

/** Default material set; body / head / hat colors are replaced per instance. */
export const materialSet = {
  body: '#1f8a3b',
  head: '#e8f0e0',
  hat: 'santaRed',
  hatTrim: 'santaWhite',
  eye: 'eyeDark',
};

export function build() {
  const b = new MeshBuilder();
  b.part('body', { pivot: [0, 0, 0] });
  b.part('head', { parent: 'body', pivot: [0, 0.82, 0] });
  b.part('armL', { parent: 'body', pivot: [0.29, 0.6, 0] });
  b.part('armR', { parent: 'body', pivot: [-0.29, 0.6, 0] });

  b.add('body', ellipsoid(0.42, 0.85, 0.38, 9, 6, 0), 'body');

  b.add('head', xform(sphere(0.24, 8, 5), { t: [0, 1.02, 0] }), 'head');
  b.add('head', xform(sphere(0.045, 5, 3), { t: [0.085, 1.06, 0.205] }), 'eye');
  b.add('head', xform(sphere(0.045, 5, 3), { t: [-0.085, 1.06, 0.205] }), 'eye');
  // Santa hat
  const tilt = -18;
  b.add('head', xform(cone(0.22, 0, 0.44, 8), { t: [0, 1.15, -0.02], r: [tilt, 0, 0] }), 'hat');
  b.add('head', xform(torus(0.215, 0.055, 10, 5), { t: [0, 1.16, -0.02] }), 'hatTrim');
  const tipY = 1.15 + 0.44 * Math.cos(tilt * Math.PI / 180);
  const tipZ = -0.02 + 0.44 * Math.sin(tilt * Math.PI / 180);
  b.add('head', xform(sphere(0.065, 6, 4), { t: [0, tipY, tipZ] }), 'hatTrim');

  b.add('armL', xform(ellipsoid(0.09, 0.3, 0.09, 6, 4), { t: [0.35, 0.33, 0] }), 'body');
  b.add('armR', xform(ellipsoid(0.09, 0.3, 0.09, 6, 4), { t: [-0.35, 0.33, 0] }), 'body');

  return b.build([
    // emerge: from below the snow, arms down -> on the surface, arms violently up
    { name: 'emerge0', parts: { root: { t: [0, -1.65, 0] }, armL: { r: [0, 0, 12] }, armR: { r: [0, 0, -12] }, head: { r: [25, 0, 0] } } },
    { name: 'emerge1', parts: { armL: { r: [-10, 0, 155] }, armR: { r: [-10, 0, -155] }, head: { r: [-18, 0, 0] } } },
    // idle: look left / look right
    { name: 'idleL', parts: { head: { r: [0, 38, 0] }, armL: { r: [0, 0, 10] }, armR: { r: [0, 0, -6] }, body: { r: [0, 0, 3] } } },
    { name: 'idleR', parts: { head: { r: [0, -38, 0] }, armL: { r: [0, 0, 6] }, armR: { r: [0, 0, -10] }, body: { r: [0, 0, -3] } } },
    // walk: left arm in front & right arm behind, then the opposite
    { name: 'walkA', parts: { armL: { r: [-55, 0, 8] }, armR: { r: [45, 0, -8] }, body: { r: [6, 0, 4] } } },
    { name: 'walkB', parts: { armL: { r: [45, 0, 8] }, armR: { r: [-55, 0, -8] }, body: { r: [6, 0, -4] } } },
    // throw: right arm back + left arm pointing at the player, then right arm forward
    { name: 'throwA', parts: { armR: { r: [140, 0, -12] }, armL: { r: [-90, 0, 4] }, body: { r: [-8, 18, 0] }, head: { r: [0, -12, 0] } } },
    { name: 'throwB', parts: { armR: { r: [-115, 0, -10] }, armL: { r: [-80, 0, 4] }, body: { r: [10, -12, 0] }, head: { r: [5, 6, 0] } } },
  ]);
}
