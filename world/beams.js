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
    // `count` beams alive at once, their pulses evenly offset in time
    const count = Math.max(1, (cfg.count ?? 1) | 0);
    this.layers = [];
    for (let j = 0; j < count; j++) this.layers.push(new BeamLayer(cfg, dir, baseHeight, rng, j / count));
    this.sources = this.layers.map((l) => l.source);
    this.t = 0;
    this.phase = rng(); // different beams (wise men, star) do not pulse in sync
  }

  /**
   * k = 0..1 visibility of the owner (fades out with it).
   * PULSE (sawtooth, period = cfg.pulse seconds): every period a layer starts
   * thin (cfg.minRadius) at full alpha (cfg.alpha) and widens with ease-out
   * cubic to its full radius. Its alpha stays full until the radius reaches
   * cfg.dimStart x radius, then falls to 0 at the full radius. Then it restarts.
   */
  update(dt, k = 1) {
    const cfg = this.cfg;
    this.t += dt;
    const fadeIn = easings.easeOutCubic(Math.min(1, this.t / cfg.fadeInSeconds));
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
      L.setRadius(grow);
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
    const a = anyPerpendicular(dir);
    const b = cross(dir, a);
    const spin = rng() * Math.PI * 2; // layers do not line their strokes up
    // per vertex: point on the axis, unit radial direction and the full radius
    // there (bottom radius -> topRadius), so the radius can be animated
    this.axis = new Float32Array(n * 3);
    this.radial = new Float32Array(n * 3);
    this.fullR = new Float32Array(n);
    let i = 0;
    for (let k = 0; k <= rings; k++) {
      const u = k / rings;
      const h = baseHeight - cfg.startBelow + cfg.height * u;
      const r = cfg.radius + (cfg.topRadius - cfg.radius) * u;
      for (let s = 0; s < seg; s++, i++) {
        // staggered rings + a little jitter so strokes do not line up
        const th = spin + ((s + (k % 2) * 0.5 + (rng() - 0.5) * 0.4) / seg) * Math.PI * 2;
        const ox = Math.cos(th), oy = Math.sin(th);
        const nx = a[0] * ox + b[0] * oy, ny = a[1] * ox + b[1] * oy, nz = a[2] * ox + b[2] * oy;
        this.axis.set([dir[0] * h, dir[1] * h, dir[2] * h], i * 3);
        this.radial.set([nx, ny, nz], i * 3);
        this.fullR[i] = r;
        // flipped normals: pointing to the axis
        src.nrm[i * 3] = -nx; src.nrm[i * 3 + 1] = -ny; src.nrm[i * 3 + 2] = -nz;
      }
    }
    fillLook(src, cfg, rng);
    this.source = src;
    this.setRadius(1);
    src.computeBounds(); // at full radius: valid for every smaller one too
    src.alpha = 0;
  }

  /** Radius scale s (1 = settings radius / topRadius). */
  setRadius(s) {
    const pos = this.source.pos;
    const A = this.axis, D = this.radial, F = this.fullR;
    for (let i = 0; i < F.length; i++) {
      const r = F[i] * s, i3 = i * 3;
      pos[i3] = A[i3] + D[i3] * r;
      pos[i3 + 1] = A[i3 + 1] + D[i3 + 1] * r;
      pos[i3 + 2] = A[i3 + 2] + D[i3 + 2] * r;
    }
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
