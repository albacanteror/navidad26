// Model = a refined mesh with per-posture normals, per-vertex seeds and stroke
// sizes. ModelInstance = one placed copy with its own colors and a StrokeSource.

import { computeNormals } from '../geometry/mesh.js';
import { refine } from '../geometry/refine.js';
import { hash3 } from '../core/rng.js';
import { StrokeSource } from '../render/strokes.js';
import { fillColors } from './materials.js';

export class Model {
  constructor(mesh, range) {
    this.mesh = mesh;
    const n = mesh.vertexCount;
    this.n = n;
    this.normals = mesh.postures.map((p) => computeNormals(p, mesh.indices));
    this.seed = new Float32Array(n);
    const p = mesh.postures[0];
    for (let i = 0; i < n; i++) this.seed[i] = (hash3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]) + i * 0.61803) % 1;
    this.strokeSize = range.maxEdge * range.strokeSize;
    let r = 0;
    for (const pz of mesh.postures) for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(pz[i * 3], pz[i * 3 + 1], pz[i * 3 + 2]));
    this.boundRadius = r;
  }
  posture(name) { return this.mesh.postureIndex(name); }
}

const cache = new Map();

/**
 * Get (and cache) a model refined for a given instance scale.
 * build() must return an unrefined Mesh. category picks the edge range in settings.mesh.
 */
export function getModel(S, name, build, category, scale) {
  const key = `${name}@${scale.toFixed(3)}`;
  let m = cache.get(key);
  if (m) return m;
  const range = { ...S.mesh.default, ...(S.mesh[category] || {}) };
  const passes = simplifyPasses(S, name);
  const mesh = refine(build(), range, scale, S.mesh.maxRefineIterations, `${name} (simplify x${passes})`, S.debug.logMeshStats, S.mesh.keepRoles, passes);
  // strokes are sized in world units: maxEdge * strokeSize (independent of scale)
  m = new Model(mesh, range);
  cache.set(key, m);
  return m;
}

/**
 * Simplification iterations for a model (settings.mesh.simplifyIterations),
 * looked up by its base name: 'treeA+mistletoe' -> treeA, 'reindeer-boom' -> reindeer,
 * 'proj_coal' -> projectile, 'cloud_3_1' -> cloud.
 */
function simplifyPasses(S, name) {
  const table = S.mesh.simplifyIterations || {};
  const base = name.startsWith('proj_') ? 'projectile' : name.split(/[+\-_@]/)[0];
  return table[base] ?? table.default ?? 4;
}

export function clearModelCache() {
  cache.clear();
}

export class ModelInstance {
  /** roleSet maps the model's material roles to materials (see materials.js). */
  constructor(S, model, roleSet) {
    this.S = S;
    this.model = model;
    const n = model.n;
    const src = new StrokeSource(n);
    src.seed.set(model.seed);
    src.size.fill(model.strokeSize);
    fillColors(S, model.mesh.mats, model.seed, roleSet, src.col, src.emis, src.size);
    src.indices = model.mesh.indices;
    this.source = src;
    this.localPos = new Float32Array(model.mesh.postures[0]);
    this.localNrm = new Float32Array(model.normals[0]);
    this.scale = 1;
  }

  /** Recolor (used by per-instance color changes). */
  recolor(roleSet) {
    fillColors(this.S, this.model.mesh.mats, this.model.seed, roleSet, this.source.col, this.source.emis);
  }

  /** Local pose = lerp(posture a, posture b, w). */
  setPose(a, b, w) {
    const P = this.model.mesh.postures, N = this.model.normals;
    const pa = P[a], pb = P[b], na = N[a], nb = N[b];
    const lp = this.localPos, ln = this.localNrm;
    if (w <= 0 || a === b) { lp.set(pa); ln.set(na); return; }
    if (w >= 1) { lp.set(pb); ln.set(nb); return; }
    for (let i = 0; i < lp.length; i++) {
      lp[i] = pa[i] + (pb[i] - pa[i]) * w;
      ln[i] = na[i] + (nb[i] - na[i]) * w;
    }
  }

  /** Transform the local pose into world space with matrix m (uniform scale). */
  applyTransform(m, scale = 1) {
    const s = this.source, lp = this.localPos, ln = this.localNrm, P = s.pos, N = s.nrm;
    const inv = 1 / scale;
    for (let i = 0; i < lp.length; i += 3) {
      const x = lp[i], y = lp[i + 1], z = lp[i + 2];
      P[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
      P[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      P[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      const nx = ln[i], ny = ln[i + 1], nz = ln[i + 2];
      let ox = (m[0] * nx + m[4] * ny + m[8] * nz) * inv;
      let oy = (m[1] * nx + m[5] * ny + m[9] * nz) * inv;
      let oz = (m[2] * nx + m[6] * ny + m[10] * nz) * inv;
      const l = Math.hypot(ox, oy, oz) || 1;
      N[i] = ox / l; N[i + 1] = oy / l; N[i + 2] = oz / l;
    }
    s.center = [m[12], m[13], m[14]];
    s.radius = this.model.boundRadius * scale + 0.5;
  }
}
