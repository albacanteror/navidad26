// Easing functions and the Eased value used for every movement in the game.
// Every movement (speed, turning, camera, posture blends) eases out with a
// cubic curve: fast at the start, gentle at the end.

import { wrapAngle } from './math.js';

export const easings = {
  linear: (t) => t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInCubic: (t) => t * t * t,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  step: (t) => (t < 1 ? 0 : 1),
};

export function ease(name, t) {
  return (easings[name] || easings.linear)(t < 0 ? 0 : t > 1 ? 1 : t);
}

/**
 * A number that moves toward a target with an ease-out-cubic tween.
 * Calling set() with a new target restarts the tween from the current value,
 * so continuous input (mouse, steering) still eases smoothly at the end.
 * With `isAngle`, the shortest way around the circle is used.
 */
export class Eased {
  constructor(value, seconds, isAngle = false) {
    this.value = value;
    this.from = value;
    this.to = value;
    this.t = 1;
    this.seconds = Math.max(1e-4, seconds);
    this.isAngle = isAngle;
  }

  set(target, seconds) {
    if (seconds !== undefined) this.seconds = Math.max(1e-4, seconds);
    if (this.isAngle) target = this.value + wrapAngle(target - this.value);
    if (Math.abs(target - this.to) < 1e-6) return;
    this.from = this.value;
    this.to = target;
    this.t = 0;
  }

  snap(v) {
    this.value = this.from = this.to = v;
    this.t = 1;
  }

  update(dt) {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.seconds);
      this.value = this.from + (this.to - this.from) * easings.easeOutCubic(this.t);
    } else {
      this.value = this.to;
    }
    if (this.isAngle && Math.abs(this.value) > 50) {
      const w = wrapAngle(this.value);
      const d = w - this.value;
      this.value += d; this.from += d; this.to += d;
    }
    return this.value;
  }
}
