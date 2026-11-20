// Candy creature: floats around, talk to it for a random line, then it
// sparkles away and heals the player.

import { SurfaceEntity, scaleBucket } from './entity.js';
import { getModel, ModelInstance } from '../models/model.js';
import { buildAnimations, AnimationPlayer } from '../anim/animation.js';
import * as candyModel from '../models/candy.js';
import { hexToRgb } from '../core/math.js';

export class Candy extends SurfaceEntity {
  constructor(game, dir, rng) {
    const C = game.S.candy;
    const sc = scaleBucket(rng.val(C.scale));
    super(game, dir, { scale: sc, radius: C.collisionRadius * sc, lift: C.hover, turnSeconds: 0.5, heading: rng.range(-3, 3) });
    this.C = C;
    const model = getModel(this.S, 'candy', candyModel.build, 'characters', sc);
    this.instance = new ModelInstance(this.S, model, {
      ...candyModel.materialSet,
      body: rng.pick(C.bodyColors),
      stripe: rng.pick(C.wrapperColors),
      wrapper: rng.pick(C.wrapperColors),
    });
    this.anims = buildAnimations(model, this.S.animations.candy);
    this.anim = new AnimationPlayer(this.instance);
    this.anim.play(this.anims.idle);
    this.anim.time = rng() * 3000;
    this.name = rng.pick(C.names);
    this.line = rng.pick(C.lines);
    this.mode = 'idle'; // idle | talking | fading
    this.fadeT = 0;
    this.appearT = 0;
    this.sparkle = hexToRgb(this.S.materials.sparkle.color);
    this.source.alpha = 0;
  }

  update(dt) {
    const g = this.game;
    this.appearT += dt;
    if (this.mode !== 'fading') {
      this.source.alpha = Math.min(1, this.appearT / 0.6);
      if (this.distanceTo(g.player.dir) < 6) this.heading.set(this.bearingTo(g.player.dir));
    }
    this.heading.update(dt);
    if (this.mode === 'idle' && g.canInteract() && this.distanceTo(g.player.dir) < this.C.talkRange) {
      this.mode = 'talking';
      g.startCandyDialog(this);
    }
    if (this.mode === 'fading') {
      this.fadeT += dt;
      const t = Math.min(1, this.fadeT / this.C.fadeSeconds);
      const s = this.source;
      s.mixColor = this.sparkle;
      s.mixAmount = t;
      s.emisAdd = t * 2;
      s.sizeMul = 1 + t * 0.8;
      s.alpha = 1 - t;
      this.lift = this.C.hover + t * 1.2;
      if (t >= 1) this.alive = false;
    }
    this.anim.update(dt);
    this.updateModel();
  }

  vanish() {
    this.mode = 'fading';
  }
}
