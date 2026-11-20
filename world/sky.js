// Moon and drifting clouds on a big shell around the planet.

import { getModel, ModelInstance } from '../models/model.js';
import { buildMoon, buildCloud, moonMaterialSet, cloudMaterialSet } from '../models/sky.js';
import { normalize, scale, anyPerpendicular, cross, rotateAxis, fromBasis, DEG } from '../core/math.js';

export class Sky {
  constructor(S, rng, worldId) {
    this.S = S;
    const K = S.sky;
    this.K = K;
    const md = normalize(S.lighting.ambientDirection);
    const moonModel = getModel(S, 'moon', () => buildMoon(K.moonRadius), 'sky', 1);
    this.moon = new ModelInstance(S, moonModel, moonMaterialSet);
    const ref = anyPerpendicular(md);
    this.moon.applyTransform(fromBasis(cross(md, ref), md, ref, scale(md, K.moonDistance), 1), 1);
    this.prep(this.moon.source, K.moonSizeMul);

    this.axis = normalize([0.2, 1, 0.1]);
    this.angle = 0;
    this.clouds = [];
    for (let i = 0; i < K.cloudCount; i++) {
      const size = rng.val(K.cloudSize);
      const blobs = rng.ival(K.cloudBlobs);
      const seed = Math.floor(rng() * 1e9);
      const m = getModel(S, `cloud_${worldId}_${i}`, () => buildCloud(rngFrom(seed), size, blobs), 'sky', 1);
      const inst = new ModelInstance(S, m, cloudMaterialSet);
      this.prep(inst.source, K.cloudSizeMul);
      const dir = rng.dir();
      this.clouds.push({ inst, dir, ref: anyPerpendicular(dir), radius: rng.val(K.cloudShellRadius) });
    }
    this.update(0);
  }

  prep(src, sizeMul) {
    src.sky = true;
    src.fog = this.K.skyFog;
    src.backface = false;
    src.writesDepth = false;
    src.sizeMul = sizeMul;
  }

  get sources() {
    return [this.moon.source, ...this.clouds.map((c) => c.inst.source)];
  }

  update(dt) {
    this.angle += this.K.cloudDriftSpeed * DEG * dt;
    for (const c of this.clouds) {
      const up = rotateAxis(c.dir, this.axis, this.angle);
      const f = normalize(rotateAxis(c.ref, this.axis, this.angle));
      c.inst.applyTransform(fromBasis(cross(up, f), up, f, scale(up, c.radius), 1), 1);
    }
  }
}

import { makeRng } from '../core/rng.js';
function rngFrom(seed) {
  return makeRng(seed);
}
