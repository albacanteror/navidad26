// Mesh data, low-poly primitive builders, and the part/posture MeshBuilder.
//
// A Mesh is:
//   postures : Float32Array[]  vertex positions for each posture (posture 0 = rest)
//   postureNames : string[]
//   indices  : Uint32Array      triangles (only used for occlusion + normals)
//   mats     : string[]         material ROLE per vertex (resolved to colors later)
//
// Animated models give every vertex one position per posture; animations
// interpolate between those positions. Static meshes have a single posture.

import { mat4, multiply, translation, rotationEuler, scaling, transformPoint, cross, sub, dot } from '../core/math.js';

export class Mesh {
  constructor(postures, postureNames, indices, mats) {
    this.postures = postures;
    this.postureNames = postureNames;
    this.indices = indices;
    this.mats = mats;
  }
  get vertexCount() { return this.mats.length; }
  get positions() { return this.postures[0]; }
  postureIndex(name) {
    const i = this.postureNames.indexOf(name);
    if (i < 0) throw new Error(`Unknown posture "${name}" (have: ${this.postureNames.join(', ')})`);
    return i;
  }
}

/** Smooth per-vertex normals from triangle faces (area weighted). */
export function computeNormals(pos, idx, out) {
  const n = out || new Float32Array(pos.length);
  n.fill(0);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
    const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    n[a] += nx; n[a + 1] += ny; n[a + 2] += nz;
    n[b] += nx; n[b + 1] += ny; n[b + 2] += nz;
    n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

// ---------------------------------------------------------------- primitives
// Each primitive returns { positions: number[], indices: number[] } with
// outward-facing (counter-clockwise) triangles.

/** Flip triangle winding if the closed shape is inside-out (negative volume). */
export function orient(g) {
  const p = g.positions, idx = g.indices;
  let cx = 0, cy = 0, cz = 0;
  const nv = p.length / 3;
  for (let i = 0; i < p.length; i += 3) { cx += p[i]; cy += p[i + 1]; cz += p[i + 2]; }
  const c = [cx / nv, cy / nv, cz / nv];
  let vol = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = sub([p[idx[i] * 3], p[idx[i] * 3 + 1], p[idx[i] * 3 + 2]], c);
    const b = sub([p[idx[i + 1] * 3], p[idx[i + 1] * 3 + 1], p[idx[i + 1] * 3 + 2]], c);
    const d = sub([p[idx[i + 2] * 3], p[idx[i + 2] * 3 + 1], p[idx[i + 2] * 3 + 2]], c);
    vol += dot(a, cross(b, d));
  }
  if (vol < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t;
    }
  }
  return g;
}

/**
 * Ellipsoid (UV sphere). `yCut` (optional, in -ry..ry) truncates it with a flat
 * cap at that height, keeping the upper part: a "truncated ellipsoid".
 */
export function ellipsoid(rx, ry, rz, seg = 8, rings = 5, yCut = null) {
  const positions = [0, ry, 0];
  const indices = [];
  const latMin = yCut === null ? -Math.PI / 2 : Math.asin(Math.max(-1, Math.min(1, yCut / ry)));
  const ringStart = [];
  const fullBottom = yCut === null;
  const lastRing = fullBottom ? rings - 1 : rings;
  for (let k = 1; k <= lastRing; k++) {
    const lat = Math.PI / 2 - (k * (Math.PI / 2 - latMin)) / rings;
    ringStart.push(positions.length / 3);
    for (let s = 0; s < seg; s++) {
      const th = (s / seg) * Math.PI * 2;
      positions.push(rx * Math.cos(lat) * Math.cos(th), ry * Math.sin(lat), rz * Math.cos(lat) * Math.sin(th));
    }
  }
  // top fan
  for (let s = 0; s < seg; s++) indices.push(0, ringStart[0] + ((s + 1) % seg), ringStart[0] + s);
  // bands
  for (let r = 0; r < ringStart.length - 1; r++) {
    const a = ringStart[r], b = ringStart[r + 1];
    for (let s = 0; s < seg; s++) {
      const s1 = (s + 1) % seg;
      indices.push(a + s, a + s1, b + s);
      indices.push(a + s1, b + s1, b + s);
    }
  }
  // bottom: pole or flat cap
  const bottom = positions.length / 3;
  positions.push(0, fullBottom ? -ry : ry * Math.sin(latMin), 0);
  const last = ringStart[ringStart.length - 1];
  for (let s = 0; s < seg; s++) indices.push(bottom, last + s, last + ((s + 1) % seg));
  return orient({ positions, indices });
}

export const sphere = (r, seg = 8, rings = 5) => ellipsoid(r, r, r, seg, rings);

/** Cone / truncated cone / cylinder along +Y, base at y=0. rTop = 0 gives a pointy cone. */
export function cone(rBottom, rTop, h, seg = 8) {
  const positions = [];
  const indices = [];
  for (let s = 0; s < seg; s++) {
    const th = (s / seg) * Math.PI * 2;
    positions.push(rBottom * Math.cos(th), 0, rBottom * Math.sin(th));
  }
  const bc = positions.length / 3;
  positions.push(0, 0, 0);
  for (let s = 0; s < seg; s++) indices.push(bc, s, (s + 1) % seg);
  if (rTop <= 0) {
    const apex = positions.length / 3;
    positions.push(0, h, 0);
    for (let s = 0; s < seg; s++) indices.push(apex, (s + 1) % seg, s);
  } else {
    const t0 = positions.length / 3;
    for (let s = 0; s < seg; s++) {
      const th = (s / seg) * Math.PI * 2;
      positions.push(rTop * Math.cos(th), h, rTop * Math.sin(th));
    }
    for (let s = 0; s < seg; s++) {
      const s1 = (s + 1) % seg;
      indices.push(s1, s, t0 + s);
      indices.push(s1, t0 + s, t0 + s1);
    }
    const tc = positions.length / 3;
    positions.push(0, h, 0);
    for (let s = 0; s < seg; s++) indices.push(tc, t0 + ((s + 1) % seg), t0 + s);
  }
  return orient({ positions, indices });
}

export const cylinder = (r, h, seg = 8) => cone(r, r, h, seg);

/**
 * Thin tube along +Y (base at y = 0) with many rings along its length, so thin
 * parts (antlers, poles) carry enough vertices to be drawn as strokes.
 * rTop = 0 ends in a point. rings = number of segments along the length.
 */
export function tube(rBottom, rTop, h, seg = 5, rings = 6) {
  const positions = [0, 0, 0]; // bottom cap center
  const indices = [];
  const pointy = rTop <= 0;
  const nRings = pointy ? rings : rings + 1; // a pointy tube ends in an apex instead of a last ring
  for (let k = 0; k < nRings; k++) {
    const u = k / rings;
    const r = rBottom + (rTop - rBottom) * u;
    for (let s = 0; s < seg; s++) {
      const th = (s / seg) * Math.PI * 2 + (k % 2) * (Math.PI / seg); // staggered rings
      positions.push(r * Math.cos(th), h * u, r * Math.sin(th));
    }
  }
  const ring = (k, s) => 1 + k * seg + (((s % seg) + seg) % seg);
  for (let s = 0; s < seg; s++) indices.push(0, ring(0, s), ring(0, s + 1));
  for (let k = 0; k < nRings - 1; k++) {
    for (let s = 0; s < seg; s++) {
      // ring k+1 is rotated half a step when k is even, odd otherwise
      const o = k % 2 === 0 ? 0 : 1;
      indices.push(ring(k, s), ring(k + 1, s - o), ring(k + 1, s + 1 - o));
      indices.push(ring(k, s), ring(k + 1, s + 1 - o), ring(k, s + 1));
    }
  }
  const top = positions.length / 3;
  positions.push(0, h, 0); // apex or top cap center
  for (let s = 0; s < seg; s++) indices.push(top, ring(nRings - 1, s + 1), ring(nRings - 1, s));
  return orient({ positions, indices });
}

/**
 * Tube following a polyline path (array of [x,y,z]), closed with caps.
 * Rings use parallel-transport frames so the tube never twists by itself.
 * Also returns, per vertex, `s` (arc length along the path) and `a` (angle
 * around the tube, radians) so callers can paint stripes.
 */
export function pathTube(points, radius, seg = 8) {
  const n = points.length;
  const tangents = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    const t = sub(b, a);
    const l = Math.hypot(t[0], t[1], t[2]) || 1;
    return [t[0] / l, t[1] / l, t[2] / l];
  });
  // initial normal: any vector perpendicular to the first tangent
  const t0 = tangents[0];
  let nrm = Math.abs(t0[0]) < 0.9 ? cross(t0, [1, 0, 0]) : cross(t0, [0, 1, 0]);
  let l0 = Math.hypot(nrm[0], nrm[1], nrm[2]);
  nrm = [nrm[0] / l0, nrm[1] / l0, nrm[2] / l0];
  const positions = [], indices = [], s = [], a = [];
  let arc = 0;
  for (let i = 0; i < n; i++) {
    const t = tangents[i];
    if (i > 0) {
      // parallel transport: remove the tangent component and renormalize
      const d = dot(nrm, t);
      nrm = [nrm[0] - t[0] * d, nrm[1] - t[1] * d, nrm[2] - t[2] * d];
      const l = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
      nrm = [nrm[0] / l, nrm[1] / l, nrm[2] / l];
      arc += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]);
    }
    const bin = cross(t, nrm);
    for (let k = 0; k < seg; k++) {
      const th = (k / seg) * Math.PI * 2;
      const c = Math.cos(th), sn = Math.sin(th);
      const p = points[i];
      positions.push(p[0] + (nrm[0] * c + bin[0] * sn) * radius, p[1] + (nrm[1] * c + bin[1] * sn) * radius, p[2] + (nrm[2] * c + bin[2] * sn) * radius);
      s.push(arc);
      a.push(th);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      const A = i * seg + k, B = i * seg + k1, C = (i + 1) * seg + k, D = (i + 1) * seg + k1;
      indices.push(A, C, B, B, C, D);
    }
  }
  // caps
  const startC = positions.length / 3;
  positions.push(...points[0]); s.push(0); a.push(0);
  const endC = positions.length / 3;
  positions.push(...points[n - 1]); s.push(arc); a.push(0);
  for (let k = 0; k < seg; k++) {
    const k1 = (k + 1) % seg;
    // winding consistent with the side quads (shared edges run opposite ways)
    indices.push(startC, k, k1);
    indices.push(endC, (n - 1) * seg + k1, (n - 1) * seg + k);
  }
  const g = orient({ positions, indices });
  g.s = s;
  g.a = a;
  return g;
}

/** Torus in the XZ plane. */
export function torus(R, r, segMajor = 10, segMinor = 5) {
  const positions = [];
  const indices = [];
  for (let i = 0; i < segMajor; i++) {
    const u = (i / segMajor) * Math.PI * 2;
    for (let j = 0; j < segMinor; j++) {
      const v = (j / segMinor) * Math.PI * 2;
      const rr = R + r * Math.cos(v);
      positions.push(rr * Math.cos(u), r * Math.sin(v), rr * Math.sin(u));
    }
  }
  for (let i = 0; i < segMajor; i++) {
    const i1 = (i + 1) % segMajor;
    for (let j = 0; j < segMinor; j++) {
      const j1 = (j + 1) % segMinor;
      const a = i * segMinor + j, b = i1 * segMinor + j, c = i1 * segMinor + j1, d = i * segMinor + j1;
      indices.push(a, d, b, b, d, c);
    }
  }
  // a torus has no meaningful "volume sign" around its centroid, use explicit winding check
  return fixTorus({ positions, indices }, R);
}
function fixTorus(g, R) {
  // check one triangle normal against the outward direction from the tube center
  const p = g.positions, idx = g.indices;
  const a = [p[idx[0] * 3], p[idx[0] * 3 + 1], p[idx[0] * 3 + 2]];
  const b = [p[idx[1] * 3], p[idx[1] * 3 + 1], p[idx[1] * 3 + 2]];
  const c = [p[idx[2] * 3], p[idx[2] * 3 + 1], p[idx[2] * 3 + 2]];
  const n = cross(sub(b, a), sub(c, a));
  const radial = Math.hypot(a[0], a[2]) || 1;
  const tubeCenter = [(a[0] / radial) * R, 0, (a[2] / radial) * R];
  if (dot(n, sub(a, tubeCenter)) < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  }
  return g;
}

/** Box centered at the origin. */
export function box(sx, sy, sz) {
  const x = sx / 2, y = sy / 2, z = sz / 2;
  const positions = [-x, -y, -z, x, -y, -z, x, y, -z, -x, y, -z, -x, -y, z, x, -y, z, x, y, z, -x, y, z];
  const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 6, 2, 3, 7, 6, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];
  return orient({ positions, indices });
}

/** A flat 5-pointed star extruded in Z. */
export function star5(rOuter, rInner, depth) {
  const positions = [0, 0, depth / 2, 0, 0, -depth / 2];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    positions.push(r * Math.cos(a), r * Math.sin(a), 0);
  }
  const indices = [];
  for (let i = 0; i < 10; i++) {
    const a = 2 + i, b = 2 + ((i + 1) % 10);
    indices.push(0, a, b, 1, b, a);
  }
  return orient({ positions, indices });
}

/** Apply scale (s), rotation (r, degrees) and translation (t) to a primitive. */
export function xform(g, { t = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const sc = typeof s === 'number' ? [s, s, s] : s;
  const m = multiply(translation(t), multiply(rotationEuler(r), scaling(sc)));
  const p = g.positions;
  const out = [];
  for (let i = 0; i < p.length; i += 3) out.push(...transformPoint(m, [p[i], p[i + 1], p[i + 2]]));
  const indices = g.indices.slice();
  // mirrored scales flip winding
  if (sc[0] * sc[1] * sc[2] < 0) for (let i = 0; i < indices.length; i += 3) { const k = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = k; }
  return { positions: out, indices };
}

// ---------------------------------------------------------------- MeshBuilder
/**
 * Builds an animated mesh from primitives grouped in PARTS.
 * Each part has a parent and a pivot. A posture is a set of per-part
 * transforms { t:[x,y,z], r:[deg x,y,z], s:[x,y,z] } applied around the pivot.
 * Baking evaluates every posture and stores one position per vertex per posture.
 */
export class MeshBuilder {
  constructor() {
    this.parts = { root: { name: 'root', parent: null, pivot: [0, 0, 0] } };
    this.chunks = [];
  }

  part(name, { parent = 'root', pivot = [0, 0, 0] } = {}) {
    this.parts[name] = { name, parent, pivot };
    return this;
  }

  add(partName, geom, mat) {
    if (!this.parts[partName]) this.part(partName);
    this.chunks.push({ part: partName, geom, mat });
    return this;
  }

  /** postures: [{ name, parts: { partName: {t, r, s} } }]. Omit for a static mesh. */
  build(postures = [{ name: 'rest', parts: {} }]) {
    const indices = [];
    const mats = [];
    const vertPart = [];
    const rest = [];
    for (const ch of this.chunks) {
      const base = rest.length / 3;
      for (const v of ch.geom.positions) rest.push(v);
      for (const i of ch.geom.indices) indices.push(i + base);
      const nv = ch.geom.positions.length / 3;
      for (let i = 0; i < nv; i++) { mats.push(ch.mat); vertPart.push(ch.part); }
    }
    const out = [];
    for (const pz of postures) {
      const world = {};
      const resolve = (name) => {
        if (world[name]) return world[name];
        const p = this.parts[name];
        const tr = pz.parts[name] || {};
        const s = tr.s === undefined ? [1, 1, 1] : typeof tr.s === 'number' ? [tr.s, tr.s, tr.s] : tr.s;
        let local = multiply(translation(p.pivot), multiply(translation(tr.t || [0, 0, 0]), multiply(rotationEuler(tr.r || [0, 0, 0]), multiply(scaling(s), translation([-p.pivot[0], -p.pivot[1], -p.pivot[2]])))));
        const m = p.parent ? multiply(resolve(p.parent), local) : local;
        world[name] = m;
        return m;
      };
      const arr = new Float32Array(rest.length);
      for (let v = 0; v < vertPart.length; v++) {
        const m = resolve(vertPart[v]);
        const q = transformPoint(m, [rest[v * 3], rest[v * 3 + 1], rest[v * 3 + 2]]);
        arr[v * 3] = q[0]; arr[v * 3 + 1] = q[1]; arr[v * 3 + 2] = q[2];
      }
      out.push(arr);
    }
    return new Mesh(out, postures.map((p) => p.name), new Uint32Array(indices), mats);
  }
}

export { mat4 };
