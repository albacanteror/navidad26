// Wise man NPC: robe cone, head, beard, crown, arms. Same model for the three
// wise men; only the colors change (settings.wisemen.list[i].colors).
// Postures: idle1, idle2, magic1 (duck), magic2 (arms lifted).

import { MeshBuilder, ellipsoid, sphere, cone, cylinder, torus, xform } from '../geometry/mesh.js';

export const materialSet = {
  robe: '#f2e7c9',
  cape: '#c9a23a',
  skin: 'wiseSkin',
  beard: 'beard',
  crown: 'gold',
  sash: '#b8282f',
  eye: 'eyeDark',
};

export function build() {
  const b = new MeshBuilder();
  b.part('body', { pivot: [0, 0.2, 0] });
  b.part('head', { parent: 'body', pivot: [0, 1.18, 0] });
  b.part('armL', { parent: 'body', pivot: [0.21, 1.08, 0] });
  b.part('armR', { parent: 'body', pivot: [-0.21, 1.08, 0] });

  b.add('body', cone(0.5, 0.19, 1.18, 9), 'robe');
  b.add('body', xform(cone(0.53, 0.22, 1.0, 9), { t: [0, 0.02, -0.05], s: [1, 1, 0.85] }), 'cape');
  b.add('body', xform(torus(0.29, 0.045, 10, 4), { t: [0, 0.72, 0] }), 'sash');

  b.add('head', xform(sphere(0.2, 8, 5), { t: [0, 1.36, 0] }), 'skin');
  b.add('head', xform(sphere(0.03, 4, 3), { t: [0.07, 1.4, 0.18] }), 'eye');
  b.add('head', xform(sphere(0.03, 4, 3), { t: [-0.07, 1.4, 0.18] }), 'eye');
  b.add('head', xform(cone(0.15, 0, 0.36, 7), { t: [0, 1.32, 0.1], r: [180, 0, 0] }), 'beard');
  b.add('head', xform(cylinder(0.17, 0.16, 8), { t: [0, 1.49, 0] }), 'crown');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.add('head', xform(cone(0.04, 0, 0.12, 4), { t: [Math.sin(a) * 0.15, 1.64, Math.cos(a) * 0.15] }), 'crown');
  }

  for (const [part, x] of [['armL', 0.26], ['armR', -0.26]]) {
    b.add(part, xform(ellipsoid(0.085, 0.3, 0.085, 6, 4), { t: [x, 0.82, 0.02] }), 'cape');
    b.add(part, xform(sphere(0.06, 5, 3), { t: [x * 1.05, 0.54, 0.03] }), 'skin');
  }

  return b.build([
    { name: 'idle1', parts: { armL: { r: [-38, 0, -12] }, armR: { r: [-38, 0, 12] } } },
    { name: 'idle2', parts: { armL: { r: [-44, 0, -14] }, armR: { r: [-32, 0, 14] }, head: { r: [6, 12, 0] }, body: { t: [0, 0.02, 0] } } },
    // magic: duck, then lift the arms
    { name: 'magic1', parts: { root: { t: [0, -0.22, 0] }, body: { r: [26, 0, 0] }, armL: { r: [-15, 0, 18] }, armR: { r: [-15, 0, -18] }, head: { r: [22, 0, 0] } } },
    { name: 'magic2', parts: { root: { t: [0, 0.1, 0] }, body: { r: [-8, 0, 0] }, armL: { r: [-12, 0, 160] }, armR: { r: [-12, 0, -160] }, head: { r: [-22, 0, 0] } } },
  ]);
}
