// Base class for everything that stands on the planet surface.
// Position = unit direction `dir` from the planet center. Heading = angle in
// the tangent frame (ref, right), where `ref` is parallel-transported when
// moving so headings never drift.

import { Eased } from '../core/easing.js';
import {
  normalize, anyPerpendicular, headingVec, moveOnSphere, bearing, arcDist, cross, sub, scale, dot, length, fromBasis,
} from '../core/math.js';

export class SurfaceEntity {
  constructor(game, dir, opts = {}) {
    this.game = game;
    this.S = game.S;
    this.dir = normalize(dir);
    this.ref = anyPerpendicular(this.dir);
    this.heading = new Eased(opts.heading ?? 0, opts.turnSeconds ?? 0.3, true);
    this.scale = opts.scale ?? 1;
    this.radius = opts.radius ?? 0.4;
    this.lift = opts.lift ?? 0;
    this.sink = opts.sink ?? 0;
    this.alive = true;
    this.instance = null;
    this.anim = null;
  }

  get planet() { return this.game.planet; }
  get R() { return this.game.planet.radius; }
  get source() { return this.instance.source; }

  forward(angle = this.heading.value) { return headingVec(this.dir, this.ref, angle); }
  /** Model +X axis in world: the entity's left. */
  left() { return cross(this.dir, this.forward()); }

  worldPos(extra = 0) {
    const h = this.planet.heightAt(this.dir) + this.lift - this.sink + extra;
    return scale(this.dir, h);
  }

  moveAlong(tangent, distance) {
    if (distance === 0) return;
    const r = moveOnSphere(this.dir, this.ref, tangent, distance / this.R);
    this.dir = r.up;
    this.ref = r.ref;
  }

  moveHeading(angle, distance) {
    this.moveAlong(headingVec(this.dir, this.ref, angle), distance);
  }

  bearingTo(otherDir) { return bearing(this.dir, this.ref, otherDir); }
  distanceTo(otherDir) { return arcDist(this.dir, otherDir, this.R); }

  /** Push this entity out of a circle of radius `minDist` around otherDir. Returns true if pushed. */
  pushFrom(otherDir, minDist, share = 1) {
    const d = this.distanceTo(otherDir);
    if (d >= minDist) return false;
    let t = sub(this.dir, otherDir);
    t = sub(t, scale(this.dir, dot(t, this.dir)));
    const l = length(t);
    const tangent = l < 1e-6 ? this.forward() : scale(t, 1 / l);
    this.moveAlong(tangent, (minDist - d) * share);
    return true;
  }

  matrix(extra = 0) {
    // modelYaw (radians, optional) turns only the model, not the movement / facing logic
    const f = this.forward(this.heading.value + (this.modelYaw || 0));
    const up = this.dir;
    return fromBasis(cross(up, f), up, f, this.worldPos(extra), this.scale);
  }

  updateModel(extra = 0) {
    this.instance.applyTransform(this.matrix(extra), this.scale);
  }
}

/** Quantize an instance scale so refined meshes can be cached and shared. */
export function scaleBucket(s, step = 0.1) {
  return Math.max(step, Math.round(s / step) * step);
}
