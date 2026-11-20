// Candy creature: a wrapped candy with animated eyes.
// Model space: center of the candy at the origin, facing +Z, long axis X.
// Postures: lookL, lookR, blink.

import { MeshBuilder, ellipsoid, sphere, cone, torus, xform } from '../geometry/mesh.js';

export const materialSet = {
  body: '#ff6fa8',
  stripe: '#ffe3f0',
  wrapper: '#ffe3f0',
  eyeWhite: 'eyeWhite',
  pupil: 'eyeDark',
};

export function build() {
  const b = new MeshBuilder();
  b.part('wrapL', { pivot: [0.3, 0, 0] });
  b.part('wrapR', { pivot: [-0.3, 0, 0] });
  b.part('eyes', { pivot: [0, 0.06, 0.2] });
  b.part('pupils', { parent: 'eyes', pivot: [0, 0.06, 0.25] });

  b.add('root', ellipsoid(0.33, 0.23, 0.23, 9, 5), 'body');
  b.add('root', xform(torus(0.215, 0.03, 10, 4), { t: [0.15, 0, 0], r: [0, 0, 90] }), 'stripe');
  b.add('root', xform(torus(0.215, 0.03, 10, 4), { t: [-0.15, 0, 0], r: [0, 0, 90] }), 'stripe');
  // wrapper ends: cones whose point touches the candy and whose base flares out
  b.add('wrapL', xform(cone(0.17, 0, 0.26, 7), { t: [0.56, 0, 0], r: [0, 0, 90] }), 'wrapper');
  b.add('wrapR', xform(cone(0.17, 0, 0.26, 7), { t: [-0.56, 0, 0], r: [0, 0, -90] }), 'wrapper');

  for (const x of [0.09, -0.09]) {
    b.add('eyes', xform(sphere(0.075, 7, 4), { t: [x, 0.06, 0.19] }), 'eyeWhite');
    b.add('pupils', xform(sphere(0.036, 5, 3), { t: [x, 0.06, 0.255] }), 'pupil');
  }

  return b.build([
    { name: 'lookL', parts: { pupils: { t: [0.03, 0.005, 0] }, wrapL: { r: [0, 18, 0] }, wrapR: { r: [0, -18, 0] }, root: { t: [0, 0.05, 0], r: [0, 0, 5] } } },
    { name: 'lookR', parts: { pupils: { t: [-0.03, 0.01, 0] }, wrapL: { r: [0, -18, 0] }, wrapR: { r: [0, 18, 0] }, root: { t: [0, -0.05, 0], r: [0, 0, -5] } } },
    { name: 'blink', parts: { eyes: { s: [1, 0.12, 1] }, root: { r: [0, 0, 0] } } },
  ]);
}
