// Snow flakes falling toward the center of the planet, around the player.
// Rendered as strokes like everything else.
// Wind: random short gusts push the flakes horizontally (settings.snow.wind).

import { StrokeSource } from '../render/strokes.js';
import { hexToRgb, offsetDir, anyPerpendicular, cross, normalize, scale, add } from '../core/math.js';
import { easings } from '../core/easing.js';

export class Snow {
  constructor(S, planet, rng) {
    this.S = S;
    this.W = S.snow;
    this.planet = planet;
    this.rng = rng;
    const n = this.W.count;
    this.n = n;
    const src = new StrokeSource(n);
    src.backface = false;
    src.writesDepth = false;
    const c = hexToRgb(this.W.color);
    for (let i = 0; i < n; i++) {
      src.col[i * 3] = c[0]; src.col[i * 3 + 1] = c[1]; src.col[i * 3 + 2] = c[2];
      src.seed[i] = rng();
      src.size[i] = this.W.size;
      src.emis[i] = this.W.emissive;
    }
    this.source = src;
    this.dir = new Float32Array(n * 3);
    this.h = new Float32Array(n);
    this.ground = new Float32Array(n);
    this.speed = new Float32Array(n);
    this.drift = new Float32Array(n * 3);
    // per-flake response to the wind: strength multiplier and direction offset
    this.windMul = new Float32Array(n);
    this.windTurn = new Float32Array(n);
    const V = this.W.wind;
    for (let i = 0; i < n; i++) {
      this.windMul[i] = V ? rng.val(V.flakeVariation) : 0;
      this.windTurn[i] = V ? rng.range(-V.turbulence, V.turbulence) : 0;
    }
    this.gust = null;                                   // the gust blowing now
    this.nextGust = V ? V.firstGustDelay : Infinity;    // seconds until the next one
    this.initialized = false;
  }

  spawn(i, center, anywhere) {
    const rng = this.rng, W = this.W, R = this.planet.radius;
    const ref = anyPerpendicular(center);
    const d = offsetDir(center, ref, rng.range(-Math.PI, Math.PI), W.areaRadius * Math.sqrt(rng()), R);
    const g = this.planet.heightAt(d);
    this.dir[i * 3] = d[0]; this.dir[i * 3 + 1] = d[1]; this.dir[i * 3 + 2] = d[2];
    this.ground[i] = g;
    this.h[i] = g + (anywhere ? rng() : 0.7 + 0.3 * rng()) * W.shellHeight;
    this.speed[i] = rng.val(W.fallSpeed);
    const dr = rng.dir();
    this.drift[i * 3] = dr[0] * W.drift; this.drift[i * 3 + 1] = dr[1] * W.drift; this.drift[i * 3 + 2] = dr[2] * W.drift;
  }

  /** Advance the gust schedule. Returns the current wind as {a, b, k}: two tangent axes and the strength now. */
  updateWind(dt, playerDir) {
    const V = this.W.wind;
    if (!V || !V.enabled) return null;
    const rng = this.rng;
    if (!this.gust) {
      this.nextGust -= dt;
      if (this.nextGust > 0) return null;
      // new gust: a random horizontal direction at the player, a duration and a peak strength
      const a = normalize(headingTangent(playerDir, rng.range(-Math.PI, Math.PI)));
      this.gust = { a, b: cross(playerDir, a), t: 0, T: rng.val(V.seconds), peak: rng.val(V.strength) };
    }
    const g = this.gust;
    g.t += dt;
    const u = g.t / g.T;
    if (u >= 1) {
      this.gust = null;
      this.nextGust = rng.val(V.interval);
      return null;
    }
    // ramp up with ease-out cubic, then calm down with ease-out cubic
    const env = u < V.attack
      ? easings.easeOutCubic(u / V.attack)
      : 1 - easings.easeOutCubic((u - V.attack) / (1 - V.attack));
    return { a: g.a, b: g.b, k: g.peak * env };
  }

  update(dt, playerDir) {
    const n = this.n, R = this.planet.radius;
    if (!this.initialized) {
      for (let i = 0; i < n; i++) this.spawn(i, playerDir, true);
      this.initialized = true;
    }
    const wind = this.updateWind(dt, playerDir);
    const cosArea = Math.cos((this.W.areaRadius * 1.15) / R);
    const P = this.source.pos, N = this.source.nrm, D = this.dir;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      this.h[i] -= this.speed[i] * dt;
      let dx = this.drift[i3], dy = this.drift[i3 + 1], dz = this.drift[i3 + 2];
      if (wind) {
        // the gust direction, turned a little per flake (turbulence)
        const k = wind.k * this.windMul[i];
        const c = Math.cos(this.windTurn[i]) * k, s = Math.sin(this.windTurn[i]) * k;
        dx += wind.a[0] * c + wind.b[0] * s;
        dy += wind.a[1] * c + wind.b[1] * s;
        dz += wind.a[2] * c + wind.b[2] * s;
      }
      // the radial part of the push is removed by the normalization: only horizontal motion remains
      let x = D[i3] + (dx * dt) / R;
      let y = D[i3 + 1] + (dy * dt) / R;
      let z = D[i3 + 2] + (dz * dt) / R;
      const l = Math.hypot(x, y, z);
      x /= l; y /= l; z /= l;
      D[i3] = x; D[i3 + 1] = y; D[i3 + 2] = z;
      if (this.h[i] < this.ground[i] || x * playerDir[0] + y * playerDir[1] + z * playerDir[2] < cosArea) {
        this.spawn(i, playerDir, false);
      }
      const h = this.h[i];
      P[i3] = D[i3] * h; P[i3 + 1] = D[i3 + 1] * h; P[i3 + 2] = D[i3 + 2] * h;
      N[i3] = D[i3]; N[i3 + 1] = D[i3 + 1]; N[i3 + 2] = D[i3 + 2];
    }
  }
}

/** A tangent vector at `up`, at angle `ang` around it. */
function headingTangent(up, ang) {
  const ref = anyPerpendicular(up);
  const right = cross(ref, up);
  return add(scale(ref, Math.cos(ang)), scale(right, Math.sin(ang)));
}
