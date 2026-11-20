// Translucent light shapes painted with strokes:
//  - LightBeam : a very tall open cylinder rising radially (from the planet
//                center outward) from a wise man or the star into the sky.
//  - LightCone : the cone of the follower's camera lamp, along the real light.
//
// Both are meshes with FLIPPED NORMALS (pointing inward). Strokes facing away
// from the camera are culled, so the near wall disappears and only the far wall
// is painted: whatever stands inside (a wise man, the star) stays visible.
// They do not write depth (they never hide anything) and are drawn with a
// low per-source alpha so they look transparent.

import { StrokeSource } from '../render/strokes.js';
import { anyPerpendicular, cross, normalize, hexToRgb } from '../core/math.js';
import { easings } from '../core/easing.js';

/**
 * 0..1: how "far" the player is for the beams / auras: 0 closer than
 * cfg.farStart, 1 at cfg.farEnd or further (smooth in between).
 */
export function farFactor(cfg, dist) {
  const a = cfg.farStart ?? 15, b = Math.max(a + 1e-3, cfg.farEnd ?? 50);
  const t = Math.min(1, Math.max(0, (dist - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Rotate v around the unit axis w by angle (Rodrigues). */
function rotate(v, w, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const d = (v[0] * w[0] + v[1] * w[1] + v[2] * w[2]) * (1 - c);
  return [
    v[0] * c + (w[1] * v[2] - w[2] * v[1]) * s + w[0] * d,
    v[1] * c + (w[2] * v[0] - w[0] * v[2]) * s + w[1] * d,
    v[2] * c + (w[0] * v[1] - w[1] * v[0]) * s + w[2] * d,
  ];
}

/** Per-vertex color with a bit of brightness variance. */
function fillLook(src, cfg, rng) {
  const c = hexToRgb(cfg.color);
  for (let i = 0; i < src.n; i++) {
    const v = 1 + (cfg.variance ?? 0.1) * (rng() * 2 - 1);
    src.col[i * 3] = Math.min(1, c[0] * v);
    src.col[i * 3 + 1] = Math.min(1, c[1] * v);
    src.col[i * 3 + 2] = Math.min(1, c[2] * v);
    src.seed[i] = rng();
    src.size[i] = cfg.strokeSize * (0.75 + 0.5 * rng());
    src.emis[i] = cfg.emissive ?? 1;
  }
  src.writesDepth = false; // never hides anything
  src.backface = true;     // with inward normals: the near wall is culled
  src.fog = cfg.fog ?? 0.5;
}

export class LightBeam {
  /**
   * cfg = settings.beams. dir = unit direction of the entity from the planet
   * center; baseHeight = distance from the center where the beam starts.
   */
  constructor(cfg, dir, baseHeight, rng) {
    this.cfg = cfg;
    this.dir = dir;
    // `count` beams alive at once, their pulses evenly offset in time
    const count = Math.max(1, (cfg.count ?? 1) | 0);
    this.layers = [];
    for (let j = 0; j < count; j++) this.layers.push(new BeamLayer(cfg, dir, baseHeight, rng, j / count));
    this.sources = this.layers.map((l) => l.source);
    this.t = 0;
    this.phase = rng(); // different beams (wise men, star) do not pulse in sync
    this.far = 0;       // eased 0..1 "player is far" amount
  }

  /**
   * k = 0..1 visibility of the owner (fades out with it).
   * playerDir / dist: unit direction of the player from the planet center and
   * its distance to the beam. FAR PLAYER (beyond cfg.farStart): the beam leans
   * toward the player (up to cfg.farTilt degrees at cfg.farEnd) and gets wider
   * (farRadiusScale) and longer (farLengthScale), so it stays visible.
   * PULSE (sawtooth, period = cfg.pulse seconds): every period a layer starts
   * thin (cfg.minRadius) at full alpha (cfg.alpha) and widens with ease-out
   * cubic to its full radius. Its alpha stays full until the radius reaches
   * cfg.dimStart x radius, then falls to 0 at the full radius. Then it restarts.
   */
  update(dt, k = 1, playerDir = null, dist = 0) {
    const cfg = this.cfg;
    this.t += dt;
    const fadeIn = easings.easeOutCubic(Math.min(1, this.t / cfg.fadeInSeconds));
    // ---- far player: tilt + size (eased so it never jumps)
    const want = playerDir ? farFactor(cfg, dist) : 0;
    this.far += (want - this.far) * (1 - Math.exp(-dt / 0.6));
    const f = this.far, d = this.dir;
    let towards = null;
    if (playerDir) {
      const pd = playerDir[0] * d[0] + playerDir[1] * d[1] + playerDir[2] * d[2];
      const tx = playerDir[0] - d[0] * pd, ty = playerDir[1] - d[1] * pd, tz = playerDir[2] - d[2] * pd;
      const tl = Math.hypot(tx, ty, tz);
      if (tl > 1e-5) towards = [tx / tl, ty / tl, tz / tl]; // along the ground, toward the player
    }
    if (towards) this.towards = towards;
    const tilt = this.towards ? f * (cfg.farTilt ?? 0) * Math.PI / 180 : 0;
    const frame = {
      axisRot: tilt > 1e-4 ? normalize(cross(d, this.towards)) : null, // rotation axis of the lean
      tilt,
      radiusScale: 1 + ((cfg.farRadiusScale ?? 1) - 1) * f,
      lengthScale: 1 + ((cfg.farLengthScale ?? 1) - 1) * f,
    };
    for (const L of this.layers) {
      let grow = 1, dim = 1;
      if (cfg.pulse > 0) {
        const saw = (this.t / cfg.pulse + this.phase + L.offset) % 1; // 0 -> 1, then jumps back
        const e = easings.easeOutCubic(saw);
        const r0 = Math.min(cfg.minRadius ?? 0.2, cfg.radius);
        const r = r0 + (cfg.radius - r0) * e;                   // bottom radius now
        grow = r / cfg.radius;
        const d0 = Math.min(0.999, cfg.dimStart ?? 0);
        dim = 1 - Math.min(1, Math.max(0, (grow - d0) / (1 - d0))); // full radius = alpha 0
      }
      L.place(grow, frame);
      L.source.alpha = cfg.alpha * fadeIn * k * dim;
    }
  }
}

/** One translucent cylinder of a LightBeam; its radius can be animated. */
class BeamLayer {
  constructor(cfg, dir, baseHeight, rng, offset) {
    this.offset = offset; // fraction of the pulse period
    const seg = cfg.segments;
    const rings = Math.max(2, Math.ceil(cfg.height / cfg.ringStep));
    const n = seg * (rings + 1);
    const src = new StrokeSource(n);
    this.dir = dir;
    this.a = anyPerpendicular(dir);
    this.b = cross(dir, this.a);
    this.base = (baseHeight - cfg.startBelow);  // the beam starts here (distance from the planet center)
    this.height = cfg.height;
    this.maxR = Math.max(cfg.radius, cfg.topRadius);
    const spin = rng() * Math.PI * 2; // layers do not line their strokes up
    // per vertex: distance along the axis, angle around it (cos, sin) and the full
    // radius there (bottom radius -> topRadius): the beam can be resized and tilted
    this.along = new Float32Array(n);
    this.cs = new Float32Array(n * 2);
    this.fullR = new Float32Array(n);
    let i = 0;
    for (let k = 0; k <= rings; k++) {
      const u = k / rings;
      const r = cfg.radius + (cfg.topRadius - cfg.radius) * u;
      for (let s = 0; s < seg; s++, i++) {
        // staggered rings + a little jitter so strokes do not line up
        const th = spin + ((s + (k % 2) * 0.5 + (rng() - 0.5) * 0.4) / seg) * Math.PI * 2;
        this.along[i] = cfg.height * u;
        this.cs[i * 2] = Math.cos(th);
        this.cs[i * 2 + 1] = Math.sin(th);
        this.fullR[i] = r;
      }
    }
    fillLook(src, cfg, rng);
    this.source = src;
    this.place(1, { axisRot: null, tilt: 0, radiusScale: 1, lengthScale: 1 });
    src.alpha = 0;
  }

  /**
   * Rebuild positions + (inward) normals. grow = pulse radius scale (1 = full);
   * frame = { axisRot, tilt, radiusScale, lengthScale } (lean toward a far player).
   */
  place(grow, frame) {
    const d = this.dir;
    let u = d, a = this.a, b = this.b;
    if (frame.axisRot) { u = rotate(d, frame.axisRot, frame.tilt); a = rotate(a, frame.axisRot, frame.tilt); b = rotate(b, frame.axisRot, frame.tilt); }
    const L = frame.lengthScale, rs = frame.radiusScale * grow;
    const ox = d[0] * this.base, oy = d[1] * this.base, oz = d[2] * this.base;
    const src = this.source, P = src.pos, N = src.nrm;
    const A = this.along, CS = this.cs, F = this.fullR;
    for (let i = 0; i < F.length; i++) {
      const c = CS[i * 2], s = CS[i * 2 + 1], i3 = i * 3;
      const nx = a[0] * c + b[0] * s, ny = a[1] * c + b[1] * s, nz = a[2] * c + b[2] * s;
      const t = A[i] * L, r = F[i] * rs;
      P[i3] = ox + u[0] * t + nx * r;
      P[i3 + 1] = oy + u[1] * t + ny * r;
      P[i3 + 2] = oz + u[2] * t + nz * r;
      // flipped normals: pointing to the axis
      N[i3] = -nx; N[i3 + 1] = -ny; N[i3 + 2] = -nz;
    }
    // bounds of the whole (full radius) beam
    const half = this.height * L * 0.5;
    src.center = [ox + u[0] * half, oy + u[1] * half, oz + u[2] * half];
    src.radius = Math.hypot(half, this.maxR * frame.radiusScale) + 0.5;
  }
}

export class LightCone {
  /** cfg = settings.follower.lightCone; length / angle default to the real light's range / cone. */
  constructor(cfg, lighting, rng) {
    this.cfg = cfg;
    const length = cfg.length ?? lighting.lightRange;
    this.length = length;
    const angle = ((cfg.angle ?? lighting.lightConeOuter) * Math.PI) / 180;
    const seg = cfg.segments;
    const rings = Math.max(2, Math.ceil((length - cfg.startOffset) / cfg.ringStep));
    const n = seg * rings;
    // local cone along +Z, apex at the origin
    this.local = new Float32Array(n * 3);
    this.localN = new Float32Array(n * 3);
    const ca = Math.cos(angle), sa = Math.sin(angle);
    let i = 0;
    for (let k = 1; k <= rings; k++) {
      const z = cfg.startOffset + ((length - cfg.startOffset) * k) / rings;
      const r = z * Math.tan(angle);
      for (let s = 0; s < seg; s++, i++) {
        const th = ((s + (k % 2) * 0.5 + (rng() - 0.5) * 0.4) / seg) * Math.PI * 2;
        const cx = Math.cos(th), cy = Math.sin(th);
        this.local[i * 3] = cx * r; this.local[i * 3 + 1] = cy * r; this.local[i * 3 + 2] = z;
        // inward (flipped) normal of the cone surface
        this.localN[i * 3] = -cx * ca; this.localN[i * 3 + 1] = -cy * ca; this.localN[i * 3 + 2] = sa;
      }
    }
    const src = new StrokeSource(n);
    fillLook(src, cfg, rng);
    src.alpha = cfg.alpha;
    this.source = src;
  }

  /** light = { pos, dir, up } from Follower.light(). */
  update(light) {
    const Z = normalize(light.dir);
    let X = cross(light.up, Z);
    if (Math.hypot(X[0], X[1], X[2]) < 1e-4) X = anyPerpendicular(Z);
    X = normalize(X);
    const Y = cross(Z, X);
    const L = this.local, LN = this.localN, P = this.source.pos, N = this.source.nrm;
    const [px, py, pz] = light.pos;
    for (let i = 0; i < L.length; i += 3) {
      const x = L[i], y = L[i + 1], z = L[i + 2];
      P[i] = px + X[0] * x + Y[0] * y + Z[0] * z;
      P[i + 1] = py + X[1] * x + Y[1] * y + Z[1] * z;
      P[i + 2] = pz + X[2] * x + Y[2] * y + Z[2] * z;
      const nx = LN[i], ny = LN[i + 1], nz = LN[i + 2];
      N[i] = X[0] * nx + Y[0] * ny + Z[0] * nz;
      N[i + 1] = X[1] * nx + Y[1] * ny + Z[1] * nz;
      N[i + 2] = X[2] * nx + Y[2] * ny + Z[2] * nz;
    }
    const len = this.length;
    this.source.center = [px + Z[0] * len * 0.5, py + Z[1] * len * 0.5, pz + Z[2] * len * 0.5];
    this.source.radius = len;
  }
}
