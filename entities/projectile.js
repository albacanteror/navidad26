// A thrown object. It always hits: it homes on its target reindeer (the one
// nearest to the thrower: player or camera-bearer) along an arc, easing
// (settings.projectiles.easing), and deals damage to the shared life on arrival.

import { getModel, ModelInstance } from '../models/model.js';
import { projectileBuilders, projectileMaterialSets } from '../models/props.js';
import { ease } from '../core/easing.js';
import { add, scale, lerp3, normalize, rotateAxis, fromBasis, DEG } from '../core/math.js';

export class Projectile {
  constructor(game, enemy, rng) {
    const S = game.S, P = S.projectiles;
    this.game = game;
    this.S = S;
    this.P = P;
    this.type = enemy.projectileType;
    this.scale = P.scale[this.type] ?? 1;
    const model = getModel(S, `proj_${this.type}`, projectileBuilders[this.type], 'props', this.scale);
    this.instance = new ModelInstance(S, model, projectileMaterialSets[this.type]);
    this.start = enemy.handPos();
    this.t = 0;
    this.T = rng.val(P.flightSeconds);
    this.arc = rng.val(P.arcHeight);
    this.damage = enemy.damage;
    this.victim = enemy.target();
    this.spin = 0;
    this.axis = normalize(rng.dir());
    this.alive = true;
    this.pos = this.start;
    this.place();
  }

  get source() { return this.instance.source; }

  target() {
    return this.victim.chest();
  }

  update(dt, frozen) {
    if (!frozen) {
      this.t += dt;
      this.spin += this.P.spinSpeed * DEG * dt;
      const u = Math.min(1, this.t / this.T);
      const s = ease(this.P.easing, u);
      const p = lerp3(this.start, this.target(), s);
      this.pos = add(p, scale(normalize(p), this.arc * 4 * s * (1 - s)));
      if (u >= 1) {
        this.alive = false;
        this.game.hitCharacter(this.victim, this.damage);
        return;
      }
    }
    this.place();
  }

  place() {
    const X = rotateAxis([1, 0, 0], this.axis, this.spin);
    const Y = rotateAxis([0, 1, 0], this.axis, this.spin);
    const Z = rotateAxis([0, 0, 1], this.axis, this.spin);
    this.instance.applyTransform(fromBasis(X, Y, Z, this.pos, this.scale), this.scale);
  }
}
