// Runtime mesh refinement: keeps every triangle edge within [minEdge, maxEdge]
// (in world units, i.e. after the instance scale).
//  - subdivide(): splits edges longer than maxEdge (midpoint split, consistent
//    across neighbouring triangles). New vertices average EVERY posture, so
//    animations keep working. An optional `project` callback can move the new
//    vertex (the planet re-evaluates its height function there).
//  - simplify(): collapses edges shorter than minEdge.

import { Mesh } from './mesh.js';

const KEY = 2097152; // 2^21, vertex index packing for edge keys

export function subdivide(mesh, maxEdge, scale = 1, project = null, maxIter = 14) {
  const np = mesh.postures.length;
  const P = mesh.postures.map((a) => Array.from(a));
  const mats = mesh.mats.slice();
  let idx = Array.from(mesh.indices);
  const max2 = (maxEdge / scale) ** 2;
  const p0 = P[0];

  const len2 = (a, b) => {
    const dx = p0[a * 3] - p0[b * 3], dy = p0[a * 3 + 1] - p0[b * 3 + 1], dz = p0[a * 3 + 2] - p0[b * 3 + 2];
    return dx * dx + dy * dy + dz * dz;
  };

  for (let iter = 0; iter < maxIter; iter++) {
    const mids = new Map();
    const mid = (a, b) => {
      const key = a < b ? a * KEY + b : b * KEY + a;
      let m = mids.get(key);
      if (m !== undefined) return m;
      m = mats.length;
      for (let k = 0; k < np; k++) {
        const arr = P[k];
        arr.push((arr[a * 3] + arr[b * 3]) / 2, (arr[a * 3 + 1] + arr[b * 3 + 1]) / 2, (arr[a * 3 + 2] + arr[b * 3 + 2]) / 2);
      }
      if (project) {
        const q = project([p0[m * 3], p0[m * 3 + 1], p0[m * 3 + 2]]);
        p0[m * 3] = q[0]; p0[m * 3 + 1] = q[1]; p0[m * 3 + 2] = q[2];
      }
      mats.push(mats[a]);
      mids.set(key, m);
      return m;
    };

    const out = [];
    let any = false;
    for (let i = 0; i < idx.length; i += 3) {
      const v = [idx[i], idx[i + 1], idx[i + 2]];
      const s = [len2(v[0], v[1]) > max2, len2(v[1], v[2]) > max2, len2(v[2], v[0]) > max2];
      const count = s[0] + s[1] + s[2];
      if (count === 0) { out.push(v[0], v[1], v[2]); continue; }
      any = true;
      if (count === 3) {
        const [a, b, c] = v;
        const m0 = mid(a, b), m1 = mid(b, c), m2 = mid(c, a);
        out.push(a, m0, m2, m0, b, m1, m2, m1, c, m0, m1, m2);
      } else if (count === 1) {
        const k = s[0] ? 0 : s[1] ? 1 : 2;
        const a = v[k], b = v[(k + 1) % 3], c = v[(k + 2) % 3];
        const m0 = mid(a, b);
        out.push(a, m0, c, m0, b, c);
      } else {
        const u = !s[0] ? 0 : !s[1] ? 1 : 2; // the unsplit edge
        const a = v[(u + 1) % 3], b = v[(u + 2) % 3], c = v[u];
        const m0 = mid(a, b), m1 = mid(b, c);
        out.push(m0, b, m1, a, m0, m1, a, m1, c);
      }
    }
    idx = out;
    if (!any) break;
  }
  return new Mesh(P.map((a) => new Float32Array(a)), mesh.postureNames.slice(), new Uint32Array(idx), mats);
}

/** keep: optional Set of material roles whose vertices are never collapsed (thin parts). */
export function simplify(mesh, minEdge, scale = 1, passes = 4, keep = null) {
  let P = mesh.postures.map((a) => Array.from(a));
  let mats = mesh.mats.slice();
  let idx = Array.from(mesh.indices);
  const min2 = (minEdge / scale) ** 2;

  for (let pass = 0; pass < passes; pass++) {
    const n = mats.length;
    const remap = new Int32Array(n);
    for (let i = 0; i < n; i++) remap[i] = i;
    const locked = new Uint8Array(n);
    const p0 = P[0];
    let collapsed = 0;
    for (let i = 0; i < idx.length; i += 3) {
      for (let e = 0; e < 3; e++) {
        const a = idx[i + e], b = idx[i + ((e + 1) % 3)];
        if (locked[a] || locked[b] || a === b) continue;
        if (keep && (keep.has(mats[a]) || keep.has(mats[b]))) continue;
        const dx = p0[a * 3] - p0[b * 3], dy = p0[a * 3 + 1] - p0[b * 3 + 1], dz = p0[a * 3 + 2] - p0[b * 3 + 2];
        if (dx * dx + dy * dy + dz * dz < min2) {
          // collapse b into a, a moves to the midpoint in every posture
          for (const arr of P) {
            arr[a * 3] = (arr[a * 3] + arr[b * 3]) / 2;
            arr[a * 3 + 1] = (arr[a * 3 + 1] + arr[b * 3 + 1]) / 2;
            arr[a * 3 + 2] = (arr[a * 3 + 2] + arr[b * 3 + 2]) / 2;
          }
          remap[b] = a;
          locked[a] = locked[b] = 1;
          collapsed++;
        }
      }
    }
    if (!collapsed) break;
    // rebuild triangles, dropping degenerate ones
    const nidx = [];
    for (let i = 0; i < idx.length; i += 3) {
      const a = remap[idx[i]], b = remap[idx[i + 1]], c = remap[idx[i + 2]];
      if (a !== b && b !== c && c !== a) nidx.push(a, b, c);
    }
    // compact vertices
    const used = new Int32Array(n).fill(-1);
    let count = 0;
    for (const v of nidx) if (used[v] < 0) used[v] = count++;
    const NP = P.map(() => new Array(count * 3));
    const nm = new Array(count);
    for (let v = 0; v < n; v++) {
      const u = used[v];
      if (u < 0) continue;
      for (let k = 0; k < P.length; k++) {
        NP[k][u * 3] = P[k][v * 3]; NP[k][u * 3 + 1] = P[k][v * 3 + 1]; NP[k][u * 3 + 2] = P[k][v * 3 + 2];
      }
      nm[u] = mats[v];
    }
    P = NP;
    mats = nm;
    idx = nidx.map((v) => used[v]);
  }
  return new Mesh(P.map((a) => new Float32Array(a)), mesh.postureNames.slice(), new Uint32Array(idx), mats);
}

/** Min / max edge length (world units) of a mesh, for debugging. */
export function edgeStats(mesh, scale = 1) {
  const p = mesh.postures[0], idx = mesh.indices;
  let mn = Infinity, mx = 0;
  for (let i = 0; i < idx.length; i += 3) {
    for (let e = 0; e < 3; e++) {
      const a = idx[i + e] * 3, b = idx[i + ((e + 1) % 3)] * 3;
      const l = Math.hypot(p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]) * scale;
      if (l < mn) mn = l;
      if (l > mx) mx = l;
    }
  }
  return { min: mn, max: mx, verts: mesh.vertexCount, tris: idx.length / 3 };
}

/** simplify then subdivide, to land inside [minEdge, maxEdge]. */
export function refine(mesh, range, scale = 1, maxIter = 14, label = '', log = false, keepRoles = null, simplifyPasses = 4) {
  let m = simplifyPasses > 0
    ? simplify(mesh, range.minEdge, scale, simplifyPasses, keepRoles && keepRoles.length ? new Set(keepRoles) : null)
    : mesh;
  m = subdivide(m, range.maxEdge, scale, null, maxIter);
  if (log) {
    const s = edgeStats(m, scale);
    console.log(`[mesh] ${label} scale ${scale.toFixed(2)}: ${s.verts} verts, ${s.tris} tris, edges ${s.min.toFixed(3)}..${s.max.toFixed(3)}`);
  }
  return m;
}
