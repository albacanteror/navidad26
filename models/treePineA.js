// Pine tree A: classic three stacked cones with a snowy tip.
// This file only defines the CROWN (leaves); the trunk is common to all trees
// (models/treeTrunk.js). Crown is about 2.6 tall (model units) above y0.

import { cone, xform } from '../geometry/mesh.js';
import { addMistletoe } from './decorations.js';
import { assembleTree, materialSet as trunkSet } from './treeTrunk.js';

/** Material set of this model: role -> shared material (see settings.materials). */
export const materialSet = {
  ...trunkSet,
  foliage: 'pineDark',
  foliage2: 'pineMid',
  snow: 'snowCap',
  mistletoeLeaf: 'mistletoeLeaf',
  mistletoeBerry: 'mistletoeBerry',
};

/** Roles whose vertices can become light bulbs. */
export const foliageRoles = ['foliage', 'foliage2'];

export function buildCrown(b, y0, { mistletoe = false } = {}) {
  b.add('root', xform(cone(1.3, 0, 1.45, 8), { t: [0, y0, 0] }), 'foliage');
  b.add('root', xform(cone(1.0, 0, 1.25, 8), { t: [0, y0 + 0.75, 0], r: [0, 22, 0] }), 'foliage2');
  b.add('root', xform(cone(0.7, 0, 1.05, 7), { t: [0, y0 + 1.45, 0], r: [0, 45, 0] }), 'foliage');
  b.add('root', xform(cone(0.24, 0, 0.36, 6), { t: [0, y0 + 2.25, 0] }), 'snow');
  if (mistletoe) addMistletoe(b, [1.0, y0 - 0.15, 0.35]); // hangs under the lowest tier
}

export function build(T, opts) {
  return assembleTree(T, buildCrown, opts);
}
