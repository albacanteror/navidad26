// Pine tree C: chunky truncated tiers, each topped with a snow cap.
// This file only defines the CROWN (leaves); the trunk is common to all trees
// (models/treeTrunk.js). Crown is about 2.6 tall (model units) above y0.

import { cone, xform } from '../geometry/mesh.js';
import { addMistletoe } from './decorations.js';
import { assembleTree, materialSet as trunkSet } from './treeTrunk.js';

/** Material set of this model: role -> shared material (see settings.materials). */
export const materialSet = {
  ...trunkSet,
  foliage: 'pineLight',
  foliage2: 'pineMid',
  snow: 'snowCap',
  mistletoeLeaf: 'mistletoeLeaf',
  mistletoeBerry: 'mistletoeBerry',
};

export const foliageRoles = ['foliage', 'foliage2'];

export function buildCrown(b, y0, { mistletoe = false } = {}) {
  const tiers = [
    { y: 0.0, r0: 1.4, r1: 0.85, h: 0.75, mat: 'foliage2' },
    { y: 0.7, r0: 1.1, r1: 0.6, h: 0.75, mat: 'foliage' },
    { y: 1.4, r0: 0.8, r1: 0.32, h: 0.7, mat: 'foliage2' },
  ];
  tiers.forEach((t, i) => {
    b.add('root', xform(cone(t.r0, t.r1, t.h, 7), { t: [0, y0 + t.y, 0], r: [0, i * 20, 0] }), t.mat);
    // snow cap resting on top of the tier
    b.add('root', xform(cone(t.r1 * 1.12, 0, 0.22, 7), { t: [0, y0 + t.y + t.h - 0.02, 0], r: [0, i * 20, 0] }), 'snow');
  });
  b.add('root', xform(cone(0.36, 0, 0.6, 6), { t: [0, y0 + 2.08, 0] }), 'foliage');
  b.add('root', xform(cone(0.16, 0, 0.22, 5), { t: [0, y0 + 2.55, 0] }), 'snow');
  if (mistletoe) addMistletoe(b, [1.0, y0 - 0.15, -0.4]); // hangs under the lowest tier
}

export function build(T, opts) {
  return assembleTree(T, buildCrown, opts);
}
