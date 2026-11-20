// Enemy behaviour: emerge -> idle -> walk -> throw, plus dying (magic).
// Each enemy rolls its own scale, ranges, colors, projectile, damage, speed.

import { SurfaceEntity, scaleBucket } from './entity.js';
import { Eased, easings } from '../core/easing.js';
import { getModel, ModelInstance } from '../models/model.js';
import { buildAnimations, AnimationPlayer } from '../anim/animation.js';
import { State, StateMachine } from '../anim/stateMachine.js';
import * as enemyModel from '../models/enemy.js';
import { hexToRgb } from '../core/math.js';

export class Enemy extends SurfaceEntity {
  constructor(game, dir, rng) {
    const E = game.S.enemies;
    const sc = scaleBucket(rng.val(E.scale));
    super(game, dir, { scale: sc, radius: E.collisionRadius * sc, sink: E.groundSink, turnSeconds: E.turnSeconds, heading: rng.range(-Math.PI, Math.PI) });
    this.E = E;
    this.rng = rng;
    // per-enemy random parameters
    this.walkRange = rng.val(E.walkRange);
    this.throwRange = Math.min(rng.val(E.throwRange), this.walkRange - 0.5);
    this.speed = rng.val(E.speed);
    this.damage = rng.val(E.damage);
    this.throwCycleMs = rng.val(E.throwCycleMs);
    this.projectileType = rng.pick(E.projectileTypes);

    const model = getModel(this.S, 'enemy', enemyModel.build, 'characters', sc);
    this.instance = new ModelInstance(this.S, model, {
      ...enemyModel.materialSet,
      body: rng.pick(E.bodyColors),
      head: rng.pick(E.headColors),
      hat: rng.pick(E.hatColors),
      hatTrim: { color: E.hatTrimColor, variance: 0.04, emissive: 0.1 },
    });
    this.anims = buildAnimations(model, this.S.animations.enemy);
    this.anim = new AnimationPlayer(this.instance);
    this.anim.onEvent = (name) => {
      if (name === 'release' && this.sm.name === 'throw') game.spawnProjectile(this);
    };
    this.speedE = new Eased(0, E.accelerateSeconds);
    this.moveAngle = this.heading.value;
    this.sidestep = 0;
    this.sideSign = 1;
    this.emerged = false;
    this.dying = false;
    this.dieT = 0;
    this.glowColor = hexToRgb(E.glowColor);
    this.auraColor = hexToRgb(E.aura.color);
    this.age = 0;
    this.phase = rng();            // so the auras do not pulse in sync

    const pr = E.statePriority;
    // enemies go for whichever reindeer is closer (player or camera-bearer)
    const dist = () => this.distanceTo(this.target().dir);
    this.sm = new StateMachine(this, this.anim, {
      dying: new State({ name: 'dying', animation: null, priority: pr.dying, when: (e) => e.dying, locked: true }),
      emerge: new State({
        name: 'emerge', animation: this.anims.emerge, priority: pr.emerge, locked: true,
        when: (e) => !e.emerged, exit: (e) => { e.emerged = true; },
      }),
      throw: new State({
        name: 'throw', animation: this.anims.throw, priority: pr.throw, canDamage: true,
        duration: (e) => e.throwCycleMs,
        when: (e) => e.emerged && dist() < e.throwRange,
        behaviour: (e) => { e.heading.set(e.bearingTo(e.target().dir)); e.speedE.set(0); e.moveAngle = e.heading.value; },
      }),
      walk: new State({
        name: 'walk', animation: this.anims.walk, priority: pr.walk, canMove: true,
        when: (e) => e.emerged && dist() < e.walkRange,
        behaviour: (e, dt) => {
          const b = e.bearingTo(e.target().dir);
          e.heading.set(b);
          if (e.sidestep > 0) {
            e.sidestep -= dt;
            e.moveAngle = e.heading.value + e.sideSign * Math.PI / 2; // perpendicular to its forward
          } else {
            e.moveAngle = e.heading.value; // linear path toward the player
          }
          e.speedE.set(e.speed);
        },
      }),
      idle: new State({
        name: 'idle', animation: this.anims.idle, priority: pr.idle,
        when: (e) => e.emerged,
        behaviour: (e) => { e.speedE.set(0); },
      }),
    });
  }

  /** Red point light around the enemy: eases in while emerging, fades out while dying. */
  aura() {
    const A = this.E.aura;
    const fadeIn = easings.easeOutCubic(Math.min(1, this.age / A.fadeInSeconds));
    const fadeOut = this.dying ? 1 - Math.min(1, this.dieT / this.E.dieSeconds) : 1;
    const pulse = 1 - A.pulse * 0.5 * (1 + Math.sin((this.age * A.pulseSpeed + this.phase) * Math.PI * 2));
    return {
      pos: this.worldPos(A.height * this.scale),
      color: this.auraColor,
      strength: A.strength * fadeIn * fadeOut * pulse,
      radius: A.radius,
    };
  }

  /** The nearest of the two reindeer: the one this enemy walks to and throws at. */
  target() {
    let best = null, bd = Infinity;
    for (const c of this.game.characters) {
      const d = this.distanceTo(c.dir);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  die() {
    if (this.dying) return;
    this.dying = true;
    this.dieT = 0;
  }

  /** frozen: the world is frozen by a dialog (enemies keep their pose). */
  update(dt, frozen) {
    if (!frozen) this.age += dt;
    if (this.dying) {
      this.dieT += dt;
      const t = Math.min(1, this.dieT / this.E.dieSeconds);
      const s = this.source;
      s.mixColor = this.glowColor;
      s.mixAmount = Math.min(1, t * 1.6);
      s.emisAdd = t * 2.5;
      s.sizeMul = 1 + this.E.dieGrow * t;
      s.alpha = 1 - Math.max(0, (t - 0.55) / 0.45);
      if (t >= 1) {
        this.alive = false;
        this.game.onEnemyDied(this);
      }
      this.anim.paused = true;
      this.anim.update(dt);
      return;
    }
    if (frozen) {
      this.anim.paused = true;
      this.anim.update(dt);
      return;
    }
    this.anim.paused = false;
    this.sm.update(dt, this.game);
    this.heading.update(dt);
    this.speedE.update(dt);
    const st = this.sm.current;
    if (st && st.canMove && this.speedE.value > 1e-4) {
      this.moveHeading(this.moveAngle, this.speedE.value * dt);
      if (this.game.collideTrees(this) && this.sidestep <= 0) {
        this.sidestep = this.rng.val(this.E.sidestepSeconds);
        this.sideSign = this.rng.sign();
      }
    } else if (this.speedE.value > 1e-4) {
      // easing out the remaining speed after leaving the walk state
      this.moveHeading(this.moveAngle, this.speedE.value * dt);
      this.game.collideTrees(this);
    }
    this.anim.update(dt);
  }

  /** Release point of a thrown object (right hand, high). */
  handPos() {
    const P = this.S.projectiles;
    const up = this.dir, f = this.forward(), l = this.left();
    const base = this.worldPos();
    const s = this.scale;
    return [
      base[0] + up[0] * P.releaseHeight * s + f[0] * 0.35 * s - l[0] * 0.3 * s,
      base[1] + up[1] * P.releaseHeight * s + f[1] * 0.35 * s - l[1] * 0.3 * s,
      base[2] + up[2] * P.releaseHeight * s + f[2] * 0.35 * s - l[2] * 0.3 * s,
    ];
  }
}
