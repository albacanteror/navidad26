// The two reindeer (the player and the camera-bearer follower) and the
// third-person camera rig.

import { SurfaceEntity } from './entity.js';
import { Eased } from '../core/easing.js';
import { getModel, ModelInstance } from '../models/model.js';
import { buildAnimations, AnimationPlayer } from '../anim/animation.js';
import * as reindeer from '../models/reindeer.js';
import { DEG, clamp, lerp, headingVec, add, sub, scale, normalize, length, hexToRgb } from '../core/math.js';

// a heading angle +a (entity.forward) is a model-space turn of -a around +Y
const BOOM_YAW_SIGN = -1;

/** Shared reindeer logic: model, eased walking, idle/walk animation, red hit tint. */
class Reindeer extends SurfaceEntity {
  constructor(game, dir, cfg, modelName, buildOpts, roleSet, anims) {
    super(game, dir, { scale: cfg.scale, radius: cfg.collisionRadius, sink: cfg.groundSink, turnSeconds: cfg.turnSeconds });
    this.cfg = cfg;
    const model = getModel(this.S, modelName, () => reindeer.build(buildOpts), 'characters', cfg.scale);
    this.instance = new ModelInstance(this.S, model, roleSet);
    this.anims = buildAnimations(model, anims);
    this.anim = new AnimationPlayer(this.instance);
    this.anim.play(this.anims.idle);
    this.vx = new Eased(0, cfg.accelerateSeconds);
    this.vy = new Eased(0, cfg.accelerateSeconds);
    this.hitTimer = 0;
    this.hitColor = hexToRgb(this.S.player.hitFlashColor);
    this.speed = 0;
  }

  /** Ease the velocity toward (angle, speed) in the tangent frame; speed 0 = stop. */
  steer(angle, speed) {
    const P = this.cfg;
    if (speed > 0) {
      this.vx.set(Math.cos(angle) * speed, P.accelerateSeconds);
      this.vy.set(Math.sin(angle) * speed, P.accelerateSeconds);
    } else {
      this.vx.set(0, P.stopSeconds);
      this.vy.set(0, P.stopSeconds);
    }
  }

  integrate(dt) {
    const P = this.cfg;
    this.vx.update(dt);
    this.vy.update(dt);
    this.heading.update(dt);
    const sp = Math.hypot(this.vx.value, this.vy.value);
    this.speed = sp;
    if (sp > 1e-4) this.moveHeading(Math.atan2(this.vy.value, this.vx.value), sp * dt);
    if (sp > P.walkThreshold) {
      this.anim.play(this.anims.walk);
      this.anim.speed = Math.max(0.4, sp / P.walkAnimSpeedRef);
    } else {
      this.anim.play(this.anims.idle);
      this.anim.speed = 1;
    }
    if (this.hitTimer > 0) this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.source.mixColor = this.hitColor;
    this.source.mixAmount = (this.hitTimer / this.S.player.hitFlashSeconds) * 0.75;
  }

  animate(dt) {
    this.anim.update(dt);
    this.updateModel();
  }

  /** Chest position, where projectiles hit and where the camera light aims. */
  chest() {
    return add(this.worldPos(), scale(this.dir, this.S.projectiles.targetHeight * this.scale));
  }
}

export class Player extends Reindeer {
  constructor(game, dir) {
    const P = game.S.player;
    super(game, dir, P, 'reindeer', { prop: 'none', body: game.S.reindeerBody }, reindeer.materialSet, game.S.animations.player);
    this.anim.onEvent = (name) => { if (name === 'step') game.audio.sfx('footstep'); };
    this.life = P.maxLife;
  }

  update(dt, input, camYaw, canMove) {
    const P = this.cfg;
    let f = 0, s = 0;
    if (canMove && input) {
      f = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
      s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    }
    if (f || s) {
      const ang = camYaw + Math.atan2(s, f);
      this.steer(ang, P.walkSpeed * (f < 0 && !s ? P.backwardSpeedFactor : 1));
      this.heading.set(ang);
    } else {
      this.steer(0, 0);
    }
    this.integrate(dt);
  }

  /** Forced idle while a dialog is open. */
  idle(dt) {
    this.update(dt, null, 0, false);
  }
}

/**
 * A crew reindeer (settings.follower.crew): follows the player with a delay and
 * less speed, a bit to one side, always facing the player. Carries a prop:
 * 'camera' (cinema camera whose lamp is the main light) or 'boom' (boom mic).
 */
export class Follower extends Reindeer {
  constructor(game, dir, crew) {
    const { crew: _list, ...common } = game.S.follower;
    const F = { ...common, ...crew };
    const prop = F.prop || 'none';
    // the boom pole does not follow baseRotation: it is turned back by it, then by its own boomRotation
    const boomYaw = BOOM_YAW_SIGN * ((F.boomRotation || 0) - (F.baseRotation || 0));
    const buildOpts = { prop, boomLength: F.boomLength, boomTilt: F.boomTilt, boomOffset: F.boomOffset, boomYaw, body: game.S.reindeerBody };
    super(game, dir, F, `reindeer-${prop}`, buildOpts, { ...reindeer.materialSet, ...F.colors }, game.S.animations.follower);
    this.F = F;
    this.prop = prop;
    this.modelYaw = (F.baseRotation || 0) * DEG; // the model walks rotated by this much
    this.trail = [];
    this.lightDir = null;
  }

  update(dt, canMove) {
    const g = this.game, F = this.F, pl = g.player;
    // remember where the player was (and its left side), to follow its path with a delay
    this.trail.push({ t: g.time, dir: pl.dir.slice(), left: pl.left() });
    while (this.trail.length > 2 && this.trail[1].t < g.time - F.followDelay) this.trail.shift();
    const old = this.trail[0].t <= g.time - F.followDelay ? this.trail[0] : null;
    // the delayed point, shifted to this follower's side of the path
    const target = old ? normalize(add(old.dir, scale(old.left, (F.side || 0) / this.R))) : null;

    const d = this.distanceTo(pl.dir);
    if (canMove && d > F.followDistance) {
      const factor = d > F.catchUpDistance ? F.catchUpSpeedFactor : F.speedFactor;
      const aim = target && this.distanceTo(target) > 0.3 ? target : pl.dir;
      this.steer(this.bearingTo(aim), g.S.player.walkSpeed * factor);
    } else {
      this.steer(0, 0);
    }
    // always face (and point the camera at) the main character
    if (d > 0.2) this.heading.set(this.bearingTo(pl.dir), F.turnSeconds);
    this.integrate(dt);
  }

  /** Camera light: origin in front of the lens, aimed at the player's chest. */
  light(dt) {
    const F = this.F;
    const up = this.dir;
    const fwd = this.forward();
    const pos = add(add(this.worldPos(), scale(up, F.lightHeight * this.scale)), scale(fwd, F.lightForward * this.scale));
    const want = normalize(sub(this.game.player.chest(), pos));
    if (!this.lightDir) this.lightDir = want;
    // ease-out toward the target direction
    const k = 1 - Math.exp(-dt / Math.max(1e-3, this.S.lighting.lightEaseSeconds));
    this.lightDir = normalize(add(this.lightDir, scale(sub(want, this.lightDir), k)));
    return { pos, dir: this.lightDir, up };
  }
}

export class CameraRig {
  constructor(S, player) {
    this.S = S;
    const C = S.camera;
    this.C = C;
    this.yawOffset = player.heading.value; // mouse at the window center looks along the start heading
    this.yawTarget = this.yawOffset;
    this.pitchTarget = C.initialPitch * DEG;
    this.yaw = new Eased(this.yawTarget, C.easeSeconds, true);
    this.pitch = new Eased(this.pitchTarget, C.easeSeconds);
    this.pos = [0, 0, 0];
    this.target = [0, 0, 0];
    this.up = [0, 1, 0];
  }

  update(dt, input, player, planet, allowLook = true) {
    const C = this.C;
    if (allowLook) {
      // absolute mouse position -> orbit angles
      this.yawTarget = this.yawOffset + (input.mouseX - 0.5) * C.orbitRange * DEG;
      const y = C.invertY ? 1 - input.mouseY : input.mouseY;
      const p = y < 0.5 ? lerp(C.minPitch, C.initialPitch, y / 0.5) : lerp(C.initialPitch, C.maxPitch, (y - 0.5) / 0.5);
      this.pitchTarget = clamp(p, C.minPitch, C.maxPitch) * DEG;
    }
    this.yaw.set(this.yawTarget, C.easeSeconds);
    this.pitch.set(this.pitchTarget, C.easeSeconds);
    this.yaw.update(dt);
    this.pitch.update(dt);

    const up = player.dir;
    const target = add(player.worldPos(), scale(up, C.targetHeight));
    const f = headingVec(up, player.ref, this.yaw.value);
    const p = this.pitch.value;
    const look = add(scale(f, Math.cos(p)), scale(up, -Math.sin(p)));
    let pos = add(target, scale(look, -C.distance));
    // keep the eye above the terrain
    const d = length(pos);
    const pdir = scale(pos, 1 / d);
    const minH = planet.heightAt(pdir) + C.groundClearance;
    if (d < minH) pos = scale(pdir, minH);
    this.pos = pos;
    this.target = target;
    this.up = up;
  }
}
