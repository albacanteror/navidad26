// Stroke sources and the stroke renderer.
//
// A StrokeSource is a set of vertices that become strokes: world positions,
// world normals, colors, a per-vertex seed (drives the pseudo random rotation /
// scale / brush variant), a world stroke size and an emissive value.
// Every frame the renderer gathers vertices from all sources, culls them
// (frustum, distance, back-facing), sorts by depth with a counting sort, keeps
// the N nearest (stroke cap) and uploads them FAR TO NEAR so that closer
// strokes paint over further ones.

import { createProgram } from './gl.js';
import { strokeVS, strokeFS } from './shaders.js';

export const STRIDE = 14; // floats per stroke: pos3 nrm3 col3 seed size emis fog alpha

// The ground is never cut by the camera's near plane (render.near): its strokes
// and occlusion triangles only stop this close (the camera never gets there,
// camera.groundClearance keeps it higher). Also the near of the projection.
export const GROUND_NEAR = 0.1;

export class StrokeSource {
  constructor(n) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.nrm = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.seed = new Float32Array(n);
    this.size = new Float32Array(n);
    this.emis = new Float32Array(n);
    this.visible = true;
    this.backface = true;      // skip vertices facing away from the camera
    this.sky = false;          // ignores the max draw distance
    this.fog = 1;              // fog multiplier
    this.alpha = 1;
    this.sizeMul = 1;
    this.emisAdd = 0;
    this.mixColor = [1, 1, 1]; // color the strokes blend toward by `mixAmount` (glow, hit flash...)
    this.mixAmount = 0;
    this.center = [0, 0, 0];
    this.radius = Infinity;
    this.indices = null;       // triangles for the occlusion passes
    this.writesDepth = true;
    // nearAnchor = a world point (tree base). When its camera depth is below
    // nearCull (may be negative = already behind the camera), the WHOLE source
    // is hidden this frame: no strokes, no occlusion. The renderer sets
    // `nearHidden` every frame (trees).
    this.nearAnchor = null;
    this.nearCull = 0;
    this.nearShape = null;     // optional radial profile: hidden while the camera is inside it
    this.nearInside = 0;       // margin added to nearShape (world units)
    this.nearHidden = false;
    // neverClip: the ground. Ignores the near plane (render.near); it only
    // disappears under the UI clearing
    this.neverClip = false;
  }

  computeBounds() {
    const p = this.pos, n = this.n;
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < n; i++) { x += p[i * 3]; y += p[i * 3 + 1]; z += p[i * 3 + 2]; }
    x /= n; y /= n; z /= n;
    let r2 = 0;
    for (let i = 0; i < n; i++) {
      const dx = p[i * 3] - x, dy = p[i * 3 + 1] - y, dz = p[i * 3 + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d > r2) r2 = d;
    }
    this.center = [x, y, z];
    this.radius = Math.sqrt(r2) + 0.5;
  }
}

/**
 * Set `nearHidden` on every source with a `nearAnchor` (trees). Hidden when:
 *  - the camera depth of that point (along the game camera's view) is below
 *    nearCull: > 0 hides it a little BEFORE the camera reaches it, < 0 a little
 *    AFTER the camera has passed it; or
 *  - the camera is inside the source's `nearShape` (a radial profile around its
 *    up axis) grown by `nearInside` + `extraMargin` world units (the renderer
 *    passes the near plane's reach, so the near plane never cuts a tree open).
 * Returns how many are hidden.
 */
export function updateNearHidden(sources, camPos, fwd, extraMargin = 0) {
  const [cx, cy, cz] = camPos, [fx, fy, fz] = fwd;
  let count = 0;
  for (const s of sources) {
    const a = s.nearAnchor;
    if (!a) { s.nearHidden = false; continue; }
    const z = (a[0] - cx) * fx + (a[1] - cy) * fy + (a[2] - cz) * fz;
    let hidden = z < s.nearCull;
    const sh = s.nearShape;
    if (!hidden && sh) hidden = insideShape(sh, cx, cy, cz, s.nearInside + extraMargin);
    s.nearHidden = hidden;
    if (hidden) count++;
  }
  return count;
}

/** Is the point inside the radial profile `sh`, grown by margin m? */
function insideShape(sh, px, py, pz, m) {
  const [bx, by, bz] = sh.base, [ux, uy, uz] = sh.up;
  const dx = px - bx, dy = py - by, dz = pz - bz;
  const h = dx * ux + dy * uy + dz * uz;          // height along the axis
  if (h < -m || h > sh.height + m) return false;
  const rx = dx - ux * h, ry = dy - uy * h, rz = dz - uz * h;
  const d2 = rx * rx + ry * ry + rz * rz;         // squared distance to the axis
  const P = sh.profile, nb = P.length;
  const k = Math.min(nb - 1, Math.max(0, Math.floor((h / sh.height) * nb)));
  const r = Math.max(P[k], P[Math.max(0, k - 1)], P[Math.min(nb - 1, k + 1)]) + m;
  return d2 < r * r;
}

/**
 * Radial profile of a source around an up axis from `base`: the max distance of
 * its vertices from the axis, per height bin. Used by updateNearHidden.
 */
export function radialProfile(pos, n, base, up, bins = 16) {
  const [bx, by, bz] = base, [ux, uy, uz] = up;
  let height = 0;
  for (let i = 0; i < n * 3; i += 3) {
    const h = (pos[i] - bx) * ux + (pos[i + 1] - by) * uy + (pos[i + 2] - bz) * uz;
    if (h > height) height = h;
  }
  height = Math.max(height, 1e-3);
  const profile = new Float32Array(bins);
  for (let i = 0; i < n * 3; i += 3) {
    const dx = pos[i] - bx, dy = pos[i + 1] - by, dz = pos[i + 2] - bz;
    const h = dx * ux + dy * uy + dz * uz;
    const rx = dx - ux * h, ry = dy - uy * h, rz = dz - uz * h;
    const r = Math.sqrt(rx * rx + ry * ry + rz * rz);
    const k = Math.min(bins - 1, Math.max(0, Math.floor((h / height) * bins)));
    if (r > profile[k]) profile[k] = r;
  }
  return { base, up, height, profile };
}

export class StrokeRenderer {
  constructor(gl, S) {
    this.gl = gl;
    this.S = S;
    // the number of point lights is a compile-time constant: injected from settings
    const vs = strokeVS.replace(/#define MAX_FLASHES \d+/, `#define MAX_FLASHES ${Math.max(1, S.render.maxPointLights | 0)}`);
    this.prog = createProgram(gl, vs, strokeFS);
    this.capacity = 0;
    this.stage = new Float32Array(0);
    this.keys = new Uint16Array(0);
    this.order = new Uint32Array(0);
    this.counts = new Uint32Array(65536);
    this.out = new Float32Array(S.render.maxStrokes * STRIDE);
    this.count = 0;
    this.candidates = 0;
    this.cap = S.render.maxStrokes; // adaptive stroke cap (adapt)

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.inst = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferData(gl.ARRAY_BUFFER, this.out.byteLength, gl.DYNAMIC_DRAW);
    const B = STRIDE * 4;
    const attr = (loc, size, offset) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, B, offset * 4);
      gl.vertexAttribDivisor(loc, 1);
    };
    attr(1, 3, 0);
    attr(2, 3, 3);
    attr(3, 3, 6);
    attr(4, 4, 9);
    attr(5, 1, 13);
    gl.bindVertexArray(null);
  }

  /**
   * Adaptive stroke cap, called a couple of times per second with the measured
   * frame rate: below render.targetFps the cap shrinks (not under minStrokes),
   * with clear room above it (+30%) the cap grows back toward maxStrokes.
   */
  adapt(fps) {
    const R = this.S.render;
    const target = R.targetFps || 0, lo = Math.min(R.minStrokes || 0, R.maxStrokes);
    if (!(target > 0) || !(fps > 0)) { this.cap = R.maxStrokes; return; }
    if (fps < target * 0.97) {
      // the further below, the bigger the step (6% .. 40%)
      this.cap *= Math.min(0.94, Math.max(0.6, fps / target));
    } else if (fps > target * 1.3 && this.count >= this.cap * 0.9) {
      // only grow when the cap is actually limiting; faster with more room (8% .. 25%)
      this.cap *= Math.min(1.25, Math.max(1.08, fps / (target * 1.2)));
    }
    this.cap = Math.round(Math.max(lo, Math.min(R.maxStrokes, this.cap)));
  }

  ensure(n) {
    if (n <= this.capacity) return;
    this.capacity = Math.ceil(n * 1.25);
    this.stage = new Float32Array(this.capacity * STRIDE);
    this.keys = new Uint16Array(this.capacity);
    this.order = new Uint32Array(this.capacity);
  }

  /** cam: { pos, fwd, right, up, tanX, tanY, near, far, holes } */
  gather(sources, cam) {
    const R = this.S.render;
    let total = 0;
    for (const s of sources) if (s.visible) total += s.n;
    this.ensure(total);
    const st = this.stage, keys = this.keys;
    const [cx, cy, cz] = cam.pos;
    const [fx, fy, fz] = cam.fwd;
    const [rx, ry, rz] = cam.right;
    const [ux, uy, uz] = cam.up;
    const tx = cam.tanX * 1.15, ty = cam.tanY * 1.15;
    const near = cam.near;
    const maxD = R.maxDistance;
    const keyScale = 65535 / cam.far;
    const bfT = R.backfaceThreshold;
    const holes = cam.holes || [], nh = holes.length; // [x0, y0, x1, y1] in NDC (-1..1, y up)
    // arc hole (dialog): nothing is painted below a circular arc through the
    // bottom corners of the screen, `h` px high at the middle (circle radius R)
    const arc = cam.arc;
    const aHw = arc ? arc.hw : 0, aHh = arc ? arc.hh : 0, aCy = arc ? arc.h - arc.R : 0;
    const aR2 = arc ? arc.R * arc.R : 0, aJit = arc ? arc.jitter || 0 : 0;
    let n = 0;

    for (const s of sources) {
      if (!s.visible || s.nearHidden || s.alpha <= 0.002) continue;
      const lim = s.sky ? cam.far : maxD;
      // the ground (neverClip) ignores render.near
      const zNear = s.neverClip ? GROUND_NEAR : near;
      const sizeSign = s.neverClip ? -1 : 1; // negative size tells the shader "ground"
      // bounding sphere culling
      if (s.radius !== Infinity) {
        const dx = s.center[0] - cx, dy = s.center[1] - cy, dz = s.center[2] - cz;
        const z = dx * fx + dy * fy + dz * fz;
        if (z < zNear - s.radius || z > lim + s.radius) continue;
        const x = dx * rx + dy * ry + dz * rz;
        const y = dx * ux + dy * uy + dz * uz;
        const pad = s.radius * 1.5;
        if (Math.abs(x) > z * tx + pad || Math.abs(y) > z * ty + pad) continue;
      }
      const P = s.pos, N = s.nrm, C = s.col, SE = s.seed, SZ = s.size, E = s.emis;
      const bf = s.backface;
      const mix = s.mixAmount, mr = s.mixColor[0], mg = s.mixColor[1], mb = s.mixColor[2];
      const sizeMul = s.sizeMul, emisAdd = s.emisAdd, fog = s.fog, alpha = s.alpha;
      const cnt = s.n;
      for (let i = 0; i < cnt; i++) {
        const i3 = i * 3;
        const dx = P[i3] - cx, dy = P[i3 + 1] - cy, dz = P[i3 + 2] - cz;
        const z = dx * fx + dy * fy + dz * fz;
        if (z < zNear || z > lim) continue;
        const x = dx * rx + dy * ry + dz * rz;
        if (x > z * tx || -x > z * tx) continue;
        const y = dx * ux + dy * uy + dz * uz;
        if (y > z * ty || -y > z * ty) continue;
        // screen holes (behind UI text): strokes whose center falls inside are skipped
        // UI clearing removes EVERY stroke there, ground included
        if (nh) {
          const sx = x / (z * cam.tanX), sy = y / (z * cam.tanY);
          let inHole = false;
          for (let h = 0; h < nh; h++) {
            const H = holes[h];
            if (sx > H[0] && sx < H[2] && sy > H[1] && sy < H[3]) { inHole = true; break; }
          }
          if (inHole) continue;
        }
        if (arc) {
          const px = (x / (z * cam.tanX)) * aHw;                                  // px from the screen middle
          const py = (y / (z * cam.tanY) + 1) * aHh + (SE[i] - 0.5) * aJit - aCy; // px above the circle center
          if (px * px + py * py < aR2) continue;
        }
        if (bf) {
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          if (-(N[i3] * dx + N[i3 + 1] * dy + N[i3 + 2] * dz) / d < bfT) continue;
        }
        const o = n * STRIDE;
        st[o] = P[i3]; st[o + 1] = P[i3 + 1]; st[o + 2] = P[i3 + 2];
        st[o + 3] = N[i3]; st[o + 4] = N[i3 + 1]; st[o + 5] = N[i3 + 2];
        let r = C[i3], g = C[i3 + 1], b = C[i3 + 2];
        if (mix > 0) { r += (mr - r) * mix; g += (mg - g) * mix; b += (mb - b) * mix; }
        st[o + 6] = r; st[o + 7] = g; st[o + 8] = b;
        st[o + 9] = SE[i];
        st[o + 10] = SZ[i] * sizeMul * sizeSign;
        const e = E[i];
        st[o + 11] = e < 0 ? e : e + emisAdd;
        st[o + 12] = fog;
        st[o + 13] = alpha;
        const k = z * keyScale;
        keys[n] = k > 65535 ? 65535 : k;
        n++;
      }
    }
    this.candidates = n;

    // counting sort by depth (ascending = nearest first)
    const counts = this.counts;
    counts.fill(0);
    for (let i = 0; i < n; i++) counts[keys[i]]++;
    let sum = 0;
    for (let k = 0; k < 65536; k++) { const c = counts[k]; counts[k] = sum; sum += c; }
    const order = this.order;
    for (let i = 0; i < n; i++) order[counts[keys[i]]++] = i;

    // keep the nearest `cap` strokes (adaptive, <= maxStrokes), write them far -> near
    const m = Math.min(n, this.cap, R.maxStrokes);
    const out = this.out;
    for (let j = 0; j < m; j++) {
      const src = order[m - 1 - j] * STRIDE;
      const dst = j * STRIDE;
      for (let q = 0; q < STRIDE; q++) out[dst + q] = st[src + q];
    }
    this.count = m;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, out, 0, m * STRIDE);
  }

  draw(setUniforms) {
    const gl = this.gl;
    if (!this.count) return;
    gl.useProgram(this.prog.program);
    setUniforms(this.prog.u);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.bindVertexArray(null);
  }
}
