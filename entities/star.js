// The star over the frozen lake. Reaching it ends the game.

import { getModel, ModelInstance } from '../models/model.js';
import { buildStar, starMaterialSet } from '../models/props.js';
import { scale, add, anyPerpendicular, cross, rotateAxis, fromBasis, DEG, arcDist, hexToRgb } from '../core/math.js';
import { easings } from '../core/easing.js';
import { LightBeam } from '../world/beams.js';

export class Star {
  constructor(game) {
    const S = game.S, T = S.star;
    this.game = game;
    this.S = S;
    this.T = T;
    this.dir = game.planet.lakeDir;
    this.pos = scale(this.dir, game.planet.heightAt(this.dir) + T.height);
    const model = getModel(S, 'star', buildStar, 'props', T.scale);
    this.instance = new ModelInstance(S, model, starMaterialSet);
    this.spin = 0;
    this.time = 0;
    this.glow = T.glow;
    this.ending = false;
    this.endT = 0;
    this.appearT = 0;
    this.alive = true;
    this.seen = false;
    this.source.alpha = 0;
    this.auraColor = hexToRgb(T.aura.color);
    // beam of light from the star into the sky
    this.beam = new LightBeam({ ...S.beams, ...(T.beam || {}) }, this.dir, game.planet.heightAt(this.dir) + T.height, game.rng);
  }

  get source() { return this.instance.source; }

  /** Point light around the star: eases in when it appears, grows during the ending. */
  aura() {
    const A = this.T.aura;
    const fadeIn = easings.easeOutCubic(Math.min(1, this.appearT / A.fadeInSeconds));
    const end = this.ending ? 1 + (A.endBoost - 1) * Math.min(1, this.endT / this.T.endGlowSeconds) : 1;
    const pulse = 1 - A.pulse * 0.5 * (1 + Math.sin(this.time * A.pulseSpeed * Math.PI * 2));
    return {
      pos: add(this.pos, scale(this.dir, A.height)),
      color: this.auraColor,
      strength: A.strength * fadeIn * end * pulse,
      radius: A.radius,
    };
  }

  distanceToPlayer() {
    return arcDist(this.dir, this.game.player.dir, this.game.planet.radius);
  }

  update(dt) {
    const T = this.T;
    this.time += dt;
    this.appearT += dt;
    this.spin += T.spinSpeed * DEG * dt;
    if (this.ending) {
      this.endT += dt;
      this.glow = T.glow + (T.endGlow - T.glow) * Math.min(1, this.endT / T.endGlowSeconds);
    } else {
      this.glow = T.glow + T.glowPulse * Math.sin(this.time * 2.2);
    }
    const s = this.source;
    s.alpha = Math.min(1, this.appearT / 1.5);
    s.emisAdd = this.glow;
    s.sizeMul = 1 + this.glow * 0.15;
    const up = this.dir;
    const side = anyPerpendicular(up);
    const Z = rotateAxis(side, up, this.spin);
    const X = cross(up, Z);
    const bob = Math.sin(this.time * 1.3) * 0.15;
    const p = scale(up, this.game.planet.heightAt(up) + T.height + bob);
    this.pos = p;
    this.instance.applyTransform(fromBasis(X, up, Z, p, T.scale), T.scale);
    // the beam leans toward / grows for a far player (beams.far*)
    this.beam.update(dt, 1, this.game.player.dir, this.distanceToPlayer());
  }
}
