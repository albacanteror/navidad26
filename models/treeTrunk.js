// Common trunk shared by every pine model.
// A tree = this trunk + a model-specific crown (the leaves) that starts at
// settings.trees.trunkHeight. Since the whole tree is scaled per instance,
// the trunk height in world units = trunkHeight * instance scale.

import { MeshBuilder, cone, xform } from '../geometry/mesh.js';

export const materialSet = { trunk: 'bark' };

/**
 * Build a full tree: common trunk + crown.
 * buildCrown(builder, y0, opts) adds the leaves with their base at height y0.
 */
export function assembleTree(T, buildCrown, opts = {}) {
  const b = new MeshBuilder();
  // the trunk goes a bit into the crown so no gap shows between them
  // slightly tapered column, starting a bit below ground (y = -0.1) so it is planted
  const h = T.trunkHeight + T.trunkOverlap + 0.1;
  b.add('root', xform(cone(T.trunkRadius, T.trunkRadius * 0.7, h, 6), { t: [0, -0.1, 0] }), 'trunk');
  buildCrown(b, T.trunkHeight, opts);
  return b.build();
}
