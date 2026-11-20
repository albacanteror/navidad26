// Candy canes stuck into the snow at random places (settings.canes).

import * as cane from '../models/candyCane.js';
import { getModel, ModelInstance } from '../models/model.js';
import { arcDist, anyPerpendicular, headingVec, cross, fromBasis, scale, rotateAxis, DEG } from '../core/math.js';

export function plantCanes(S, planet, rng, startDir, avoid) {
  const C = S.canes;
  const R = planet.radius;
  const sources = [];
  const colliders = [];
  if (!C || !C.count) return { sources, colliders };
  const lakeLimit = planet.lakeRadius + S.planet.lakeShore + C.lakeClearance;
  const buckets = [];
  for (let i = 0; i < C.scaleBuckets; i++) {
    buckets.push(C.scaleBuckets === 1 ? (C.scale[0] + C.scale[1]) / 2 : C.scale[0] + ((C.scale[1] - C.scale[0]) * i) / (C.scaleBuckets - 1));
  }
  let attempts = 0;
  while (colliders.length < C.count && attempts < C.count * 40) {
    attempts++;
    const d = rng.dir();
    if (arcDist(d, planet.lakeDir, R) < lakeLimit) continue;
    if (arcDist(d, startDir, R) < C.playerClearance) continue;
    let ok = true;
    for (const t of avoid) if (arcDist(d, t.dir, R) < t.radius + C.treeClearance) { ok = false; break; }
    if (ok) for (const c of colliders) if (arcDist(d, c.dir, R) < C.minSpacing) { ok = false; break; }
    if (!ok) continue;

    const want = rng.val(C.scale);
    let sc = buckets[0];
    for (const b of buckets) if (Math.abs(b - want) < Math.abs(sc - want)) sc = b;
    const model = getModel(S, 'candyCane', () => cane.build(C), 'props', sc);
    const inst = new ModelInstance(S, model, cane.materialSet);

    // random yaw, a slight lean, and pushed a bit into the snow
    const f = headingVec(d, anyPerpendicular(d), rng.range(-Math.PI, Math.PI));
    const up = rotateAxis(d, f, rng.range(-C.lean, C.lean) * DEG);
    const base = scale(d, planet.heightAt(d) - rng.val(C.sink));
    inst.applyTransform(fromBasis(cross(up, f), up, f, base, sc), sc);
    inst.source.computeBounds();
    sources.push(inst.source);
    colliders.push({ dir: d, radius: C.collisionRadius * sc });
  }
  return { sources, colliders };
}
