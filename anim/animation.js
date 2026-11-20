// Posture-based vertex animation.
//
// Every vertex of an animated model owns one position per POSTURE.
// An Animation is:
//   postures      : sequence of posture INDICES of the model
//   durationMs    : time of one full cycle
//   interpolation : easing between consecutive postures
//   mode          : 'loop' | 'pingpong' | 'once'
//   triggers      : state triggered when a 'once' animation ends
//   events        : [{ at: 0..1, name }] fired once per cycle (e.g. 'release')
// The AnimationPlayer interpolates between posture positions and crossfades
// (ease-out cubic) from the previous pose when the animation changes.

import { ease, easings } from '../core/easing.js';

export class Animation {
  constructor(name, model, def) {
    this.name = name;
    this.postures = def.postures.map((p) => (typeof p === 'number' ? p : model.posture(p)));
    this.durationMs = def.durationMs;
    this.interpolation = def.interpolation || 'linear';
    this.mode = def.mode || 'loop';
    this.triggers = def.triggers || null;
    this.events = def.events || [];
    this.blendMs = def.blendMs ?? 150;
  }

  get segments() {
    const n = this.postures.length;
    if (n < 2) return 1;
    if (this.mode === 'loop') return n;
    if (this.mode === 'pingpong') return 2 * (n - 1);
    return n - 1;
  }

  /** Posture pair + weight at cycle phase u in [0,1]. */
  sample(u) {
    const P = this.postures, n = P.length;
    if (n === 1) return [P[0], P[0], 0];
    const segs = this.segments;
    const x = Math.min(u, 0.999999) * segs;
    const s = Math.floor(x);
    const w = ease(this.interpolation, x - s);
    let a, b;
    if (this.mode === 'loop') { a = s; b = (s + 1) % n; }
    else if (this.mode === 'pingpong') {
      const idx = (k) => (k < n ? k : 2 * (n - 1) - k);
      a = idx(s); b = idx(s + 1);
    } else { a = s; b = s + 1; }
    return [P[a], P[b], w];
  }
}

/** Build all animations of a model from a settings block { name: def }. */
export function buildAnimations(model, defs) {
  const out = {};
  for (const [name, def] of Object.entries(defs)) out[name] = new Animation(name, model, def);
  return out;
}

export class AnimationPlayer {
  constructor(instance) {
    this.instance = instance;
    this.anim = null;
    this.time = 0;          // ms within the current cycle
    this.duration = 1000;
    this.speed = 1;
    this.paused = false;
    this.finished = false;
    this.blend = 1;         // 0..1 crossfade progress
    this.blendMs = 0;
    this.fromPos = new Float32Array(instance.localPos.length);
    this.fromNrm = new Float32Array(instance.localNrm.length);
    this.onEvent = null;    // (name) => void
    this.onEnd = null;      // (animation) => void
  }

  /** Start an animation (no-op if it is already playing). durationMs overrides the cycle time. */
  play(anim, durationMs) {
    if (this.anim === anim) {
      if (durationMs) this.duration = durationMs;
      return;
    }
    if (this.anim) {
      this.fromPos.set(this.instance.localPos);
      this.fromNrm.set(this.instance.localNrm);
      this.blend = anim.blendMs > 0 ? 0 : 1;
    } else this.blend = 1;
    this.blendMs = anim.blendMs;
    this.anim = anim;
    this.duration = durationMs || anim.durationMs;
    this.time = 0;
    this.finished = false;
    this.firedAt = -1;
  }

  update(dtSeconds) {
    const a = this.anim;
    if (!a) return;
    if (!this.paused) {
      const dt = dtSeconds * 1000 * this.speed;
      const prev = this.time;
      this.time += dt;
      if (this.blend < 1) this.blend = Math.min(1, this.blend + dt / Math.max(1, this.blendMs));
      // events
      if (a.events.length && !this.finished) {
        const d = this.duration;
        const end = a.mode === 'once' ? Math.min(this.time, d) : this.time;
        for (const ev of a.events) {
          // the event happens at absolute times (k + at) * d, k = 0, 1, 2...
          const crossed = Math.floor(end / d - ev.at) - Math.floor(prev / d - ev.at);
          if (crossed > 0 && this.onEvent) this.onEvent(ev.name);
        }
      }
      if (a.mode === 'once' && this.time >= this.duration && !this.finished) {
        this.finished = true;
        this.time = this.duration;
        this.onEnd && this.onEnd(a);
      }
    }
    const u = a.mode === 'once' ? Math.min(1, this.time / this.duration) : (this.time % this.duration) / this.duration;
    const [pa, pb, w] = a.sample(u);
    const inst = this.instance;
    inst.setPose(pa, pb, w);
    if (this.blend < 1) {
      const k = easings.easeOutCubic(this.blend);
      const lp = inst.localPos, ln = inst.localNrm, fp = this.fromPos, fn = this.fromNrm;
      for (let i = 0; i < lp.length; i++) {
        lp[i] = fp[i] + (lp[i] - fp[i]) * k;
        ln[i] = fn[i] + (ln[i] - fn[i]) * k;
      }
    }
  }
}
