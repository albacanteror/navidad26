// Fill the planet with the three pine models, with Christmas decorations.

import * as treeA from '../models/treePineA.js';
import * as treeB from '../models/treePineB.js';
import * as treeC from '../models/treePineC.js';
import { getModel, ModelInstance } from '../models/model.js';
import { resolveMaterial } from '../models/materials.js';
import { arcDist, anyPerpendicular, headingVec, cross, fromBasis, scale } from '../core/math.js';
import { radialProfile } from '../render/strokes.js';

const VARIANTS = { A: treeA, B: treeB, C: treeC };

export function plantTrees(S, planet, rng, startDir) {
  const T = S.trees;
  const R = planet.radius;
  const placed = [];
  const sources = [];
  const lakeLimit = planet.lakeRadius + S.planet.lakeShore + T.lakeClearance;
  const buckets = [];
  for (let i = 0; i < T.scaleBuckets; i++) {
    buckets.push(T.scaleBuckets === 1 ? (T.scale[0] + T.scale[1]) / 2 : T.scale[0] + ((T.scale[1] - T.scale[0]) * i) / (T.scaleBuckets - 1));
  }
  const bulbs = T.bulbMaterials.map((m) => resolveMaterial(S, m));

  let attempts = 0;
  while (placed.length < T.count && attempts < T.count * 40) {
    attempts++;
    const d = rng.dir();
    if (arcDist(d, planet.lakeDir, R) < lakeLimit) continue;
    if (arcDist(d, startDir, R) < T.playerClearance) continue;
    let ok = true;
    for (const p of placed) if (arcDist(d, p.dir, R) < T.minSpacing) { ok = false; break; }
    if (!ok) continue;

    const v = rng.weighted(T.variantWeights);
    const mod = VARIANTS[v];
    const want = rng.val(T.scale);
    let sc = buckets[0];
    for (const b of buckets) if (Math.abs(b - want) < Math.abs(sc - want)) sc = b;
    const mistletoe = rng() < T.mistletoeChance;
    const model = getModel(S, `tree${v}${mistletoe ? '+mistletoe' : ''}`, () => mod.build(T, { mistletoe }), 'trees', sc);
    const inst = new ModelInstance(S, model, mod.materialSet);

    // light bulbs on some trees: random foliage vertices become twinkling emissive bulbs
    if (rng() < T.lightsChance) {
      const src = inst.source;
      const roles = model.mesh.mats;
      for (let i = 0; i < model.n; i++) {
        if (!mod.foliageRoles.includes(roles[i]) || rng() > T.lightsDensity) continue;
        const b = rng.pick(bulbs);
        src.col[i * 3] = b.rgb[0]; src.col[i * 3 + 1] = b.rgb[1]; src.col[i * 3 + 2] = b.rgb[2];
        src.emis[i] = b.emissive;
      }
    }

    const ref = anyPerpendicular(d);
    const f = headingVec(d, ref, rng.range(-Math.PI, Math.PI));
    const base = scale(d, planet.heightAt(d) - 0.12 * sc);
    inst.applyTransform(fromBasis(cross(d, f), d, f, base, sc), sc);
    inst.source.computeBounds();
    inst.source.nearAnchor = base; // tree base: decides when the tree is hidden near the camera
    // its shape around the trunk axis: hidden while the camera is inside it
    inst.source.nearShape = radialProfile(inst.source.pos, inst.source.n, base, d);
    sources.push(inst.source);
    placed.push({ dir: d, radius: T.collisionRadius * sc });
  }
  return { sources, colliders: placed };
}
