// Wise man NPC: idle until the player is in talking range, then dialog,
// then magic (duck + lift arms), light explosion, fade out.

import { SurfaceEntity } from './entity.js';
import { getModel, ModelInstance } from '../models/model.js';
import { buildAnimations, AnimationPlayer } from '../anim/animation.js';
import * as wiseModel from '../models/wiseman.js';
import { hexToRgb } from '../core/math.js';
import { easings } from '../core/easing.js';
import { LightBeam } from '../world/beams.js';

export class WiseMan extends SurfaceEntity {
  constructor(game, dir, index) {
    const W = game.S.wisemen;
    super(game, dir, { scale: W.scale, radius: W.collisionRadius, turnSeconds: W.faceSeconds });
    this.W = W;
    this.index = index;
    this.def = W.list[index % W.list.length];
    const model = getModel(this.S, 'wiseman', wiseModel.build, 'characters', W.scale);
    this.instance = new ModelInstance(this.S, model, { ...wiseModel.materialSet, ...this.def.colors });
    this.anims = buildAnimations(model, this.S.animations.wiseman);
    this.anim = new AnimationPlayer(this.instance);
    this.anim.play(this.anims.idle);
    this.mode = 'idle'; // idle | talking | magic | fading
    this.fadeT = 0;
    this.heading.snap(this.bearingTo(game.player.dir));
    this.glow = hexToRgb(this.S.lighting.magicFlashColor);
    this.auraColor = hexToRgb(W.aura.color);
    this.age = 0;
    // beam of light from his feet into the sky
    this.beam = new LightBeam({ ...this.S.beams, ...(W.beam || {}) }, this.dir, game.planet.heightAt(this.dir), game.rng);
  }

  /** The point light floating over him: eases in when he appears, fades out with him. */
  aura() {
    const A = this.W.aura;
    const fadeIn = easings.easeOutCubic(Math.min(1, this.age / A.fadeInSeconds));
    const fadeOut = this.mode === 'fading' ? 1 - Math.min(1, this.fadeT / this.W.fadeSeconds) : 1;
    const pulse = 1 - A.pulse * 0.5 * (1 + Math.sin(this.age * A.pulseSpeed * Math.PI * 2));
    return {
      pos: this.worldPos(A.height),
      color: this.auraColor,
      strength: A.strength * fadeIn * fadeOut * pulse,
      radius: A.radius,
    };
  }

  update(dt) {
    const g = this.game;
    this.age += dt;
    if (this.mode !== 'fading') this.heading.set(this.bearingTo(g.player.dir));
    this.heading.update(dt);
    if (this.mode === 'idle' && g.canInteract() && this.distanceTo(g.player.dir) < this.W.talkRange) {
      this.mode = 'talking';
      g.startWiseDialog(this);
    }
    if (this.mode === 'magic' && this.pauseT !== undefined) {
      this.pauseT -= dt;
      if (this.pauseT <= 0) {
        this.pauseT = undefined;
        this.mode = 'fading';
        g.endMagic(this);
      }
    }
    if (this.mode === 'fading') {
      this.fadeT += dt;
      const t = Math.min(1, this.fadeT / this.W.fadeSeconds);
      const s = this.source;
      s.mixColor = this.glow;
      s.mixAmount = t;
      s.emisAdd = t * 2;
      s.alpha = 1 - t;
      if (t >= 1) this.alive = false;
    }
    this.anim.update(dt);
    this.updateModel();
    this.beam.update(dt, this.mode === 'fading' ? 1 - Math.min(1, this.fadeT / this.W.fadeSeconds) : 1);
  }

  startMagic() {
    this.mode = 'magic';
    this.anim.onEvent = (name) => { if (name === 'burst') this.game.magicBurst(this); };
    this.anim.onEnd = () => { this.pauseT = this.W.afterMagicPause; };
    this.anim.play(this.anims.magic);
  }
}
