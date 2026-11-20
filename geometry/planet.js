// Tiny planet: base sphere + random mountains + frozen lake + radial (Z) noise.

import { normalize, dot, clamp, smoothstep, arcDist, offsetDir, anyPerpendicular } from '../core/math.js';
import { makeNoise3 } from '../core/noise.js';
import { Mesh, computeNormals, orient } from './mesh.js';
import { subdivide, edgeStats } from './refine.js';

function smax(a, b, k) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return a + (b - a) * h + k * h * (1 - h);
}

export class Planet {
  constructor(S, rng) {
    this.S = S;
    const P = S.planet;
    this.P = P;
    this.radius = (S.player.walkSpeed * P.walkAroundSeconds) / (2 * Math.PI);
    const R = this.radius;
    this.noise = makeNoise3(Math.floor(rng() * 1e9));

    // --- mountains: N iterations, each a pair of random angles + a length from the center
    const count = rng.ival(P.mountainCount);
    this.mountains = [];
    for (let i = 0; i < count; i++) {
      const lon = rng() * Math.PI * 2;                 // angle 1
      const lat = Math.asin(rng() * 2 - 1);            // angle 2
      const dir = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
      const length = R * rng.val(P.mountainPeakLength); // length from the center of the planet
      this.mountains.push({ dir, peak: length - R, width: rng.val(P.mountainWidth) / R });
    }

    // --- frozen lake: as far as possible from the mountains
    let best = null, bestScore = -Infinity;
    for (let t = 0; t < 300; t++) {
      const d = rng.dir();
      let score = Infinity;
      for (const m of this.mountains) score = Math.min(score, arcDist(d, m.dir, R) - m.width * R);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    this.lakeDir = best;
    this.lakeRadius = P.lakeRadius;
    const needed = P.lakeRadius + P.lakeShore + P.lakeMountainGap;
    this.mountains = this.mountains.filter((m) => arcDist(best, m.dir, R) - m.width * R > needed);

    // smooth-max baseline (so flat areas sit exactly at R)
    this.k = P.mountainBlendSoftness;
    let base = 0;
    for (let i = 0; i < this.mountains.length; i++) base = smax(base, 0, this.k);
    this.baseOffset = base;
    this.iceLevel = R - P.lakeDepth;

    // --- player start: some distance from the lake, on low ground
    let start = null, startH = Infinity;
    for (let t = 0; t < 24; t++) {
      const ref = anyPerpendicular(this.lakeDir);
      const d = offsetDir(this.lakeDir, ref, (t / 24) * Math.PI * 2, P.startLakeDistance, R);
      const h = this.mountainHeight(d);
      if (h < startH) { startH = h; start = d; }
    }
    this.startDir = start;
  }

  mountainHeight(dir) {
    let m = 0;
    for (const mt of this.mountains) {
      const a = Math.acos(clamp(dot(dir, mt.dir), -1, 1));
      let b = 0;
      if (a < mt.width) b = mt.peak * Math.pow(0.5 + 0.5 * Math.cos((Math.PI * a) / mt.width), this.P.mountainShape);
      m = smax(m, b, this.k);
    }
    return m - this.baseOffset;
  }

  /** 1 inside the ice, 0 outside the shore. */
  lakeWeight(dir) {
    const d = arcDist(dir, this.lakeDir, this.radius);
    return 1 - smoothstep(this.lakeRadius, this.lakeRadius + this.P.lakeShore, d);
  }

  /** Distance from the planet center to the surface in direction `dir` (unit). */
  heightAt(dir) {
    const R = this.radius;
    const z = this.P.zNoise;
    let h = R + this.mountainHeight(dir);
    const s = R * z.frequency;
    h += z.amplitude * this.noise.fbm(dir[0] * s, dir[1] * s, dir[2] * s, z.octaves, z.lacunarity, z.gain);
    const w = this.lakeWeight(dir);
    if (w <= 0) return h;
    return h + (this.iceAt(dir) - h) * w;
  }

  /** Ice surface radius: a bowl, deepest at the lake center, rising to iceLevel at the ice edge. */
  iceAt(dir) {
    const t = Math.min(1, arcDist(dir, this.lakeDir, this.radius) / this.lakeRadius);
    return this.iceLevel - this.P.lakeCenterSink * Math.pow(1 - t * t, this.P.lakeSinkFalloff);
  }

  surfacePoint(dir, lift = 0) {
    const h = this.heightAt(dir) + lift;
    return [dir[0] * h, dir[1] * h, dir[2] * h];
  }

  /** Build the terrain triangle mesh, refined so every edge is <= maxEdge. */
  buildMesh(range, maxIter, log) {
    const t = (1 + Math.sqrt(5)) / 2;
    const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    const f = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
    const positions = [];
    for (const p of v) positions.push(...this.surfacePoint(normalize(p)));
    const g = orient({ positions, indices: f.slice() });
    const base = new Mesh([new Float32Array(g.positions)], ['rest'], new Uint32Array(g.indices), new Array(12).fill('snow'));
    const mesh = subdivide(base, range.maxEdge, 1, (p) => this.surfacePoint(normalize(p)), maxIter);
    const pos = mesh.postures[0];
    const nrm = computeNormals(pos, mesh.indices);
    // materials: ice on the lake, rock on steep slopes, snow elsewhere
    for (let i = 0; i < mesh.mats.length; i++) {
      const d = normalize([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
      if (this.lakeWeight(d) > 0.5) mesh.mats[i] = 'ice';
      else if (nrm[i * 3] * d[0] + nrm[i * 3 + 1] * d[1] + nrm[i * 3 + 2] * d[2] < this.P.rockSlope) mesh.mats[i] = 'rock';
      else mesh.mats[i] = 'snow';
    }
    if (log) {
      const s = edgeStats(mesh);
      console.log(`[mesh] terrain: radius ${this.radius.toFixed(1)}, ${this.mountains.length} mountains, ${s.verts} verts, ${s.tris} tris, edges ${s.min.toFixed(3)}..${s.max.toFixed(3)}`);
    }
    return { mesh, normals: nrm };
  }
}
