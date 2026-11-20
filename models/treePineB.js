// Pine tree B: tall and slim, four narrow tiers.
// This file only defines the CROWN (leaves); the trunk is common to all trees
// (models/treeTrunk.js). Crown is about 3.6 tall (model units) above y0.

import { cone, xform } from '../geometry/mesh.js';
import { addMistletoe } from './decorations.js';
import { assembleTree, materialSet as trunkSet } from './treeTrunk.js';

/** Material set of this model: role -> shared material (see settings.materials). */
export const materialSet = {
  ...trunkSet,
  foliage: 'pineMid',
  foliage2: 'pineDark',
  snow: 'snowCap',
  mistletoeLeaf: 'mistletoeLeaf',
  mistletoeBerry: 'mistletoeBerry',
};

export const foliageRoles = ['foliage', 'foliage2'];

export function buildCrown(b, y0, { mistletoe = false } = {}) {
  b.add('root', xform(cone(0.9, 0, 1.5, 7), { t: [0, y0, 0] }), 'foliage2');
  b.add('root', xform(cone(0.75, 0, 1.4, 7), { t: [0, y0 + 0.8, 0], r: [0, 25, 0] }), 'foliage');
  b.add('root', xform(cone(0.58, 0, 1.3, 7), { t: [0, y0 + 1.6, 0], r: [0, 50, 0] }), 'foliage2');
  b.add('root', xform(cone(0.4, 0, 1.2, 6), { t: [0, y0 + 2.3, 0], r: [0, 10, 0] }), 'foliage');
  b.add('root', xform(cone(0.16, 0, 0.32, 5), { t: [0, y0 + 3.25, 0] }), 'snow');
  if (mistletoe) addMistletoe(b, [0.65, y0 - 0.15, 0.3]); // hangs under the lowest tier
}

export function build(T, opts) {
  return assembleTree(T, buildCrown, opts);
}
