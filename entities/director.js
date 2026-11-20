// Pacing: enemy spawning (interval ramps down, capped), candy spawning, and the
// wise-men -> star schedule. Only runs while the world is not frozen.

import { Enemy } from './enemy.js';
import { WiseMan } from './wiseman.js';
import { Candy } from './candy.js';
import { Star } from './star.js';
import { arcDist, offsetDir, lerp, clamp, DEG } from '../core/math.js';

export class Director {
  constructor(game, rng) {
    this.game = game;
    this.S = game.S;
    this.rng = rng;
    this.wiseIndex = 0;
    this.wiseTimer = this.S.wisemen.firstSpawnTime;
    this.sincePaint = 0;
    this.enemyTimer = 0;
    this.candyTimer = this.S.candy.firstSpawnDelay;
    this.spawnClock = 0; // time since enemies started spawning (for the ramp)
    this.waitingStar = false;
  }

  update(dt) {
    const g = this.game, S = this.S;

    // ---- wise men, then the star
    if (!g.activeWise && !g.star) {
      this.wiseTimer -= dt;
      if (this.wiseTimer <= 0) {
        if (this.wiseIndex < S.wisemen.list.length) this.spawnWiseMan();
        else this.spawnStar();
      }
    }

    if (!g.paintDone) return;
    this.sincePaint += dt;

    // ---- enemies
    if (this.sincePaint >= S.timing.enemySpawnDelayAfterPaint) {
      this.spawnClock += dt;
      this.enemyTimer -= dt;
      if (this.enemyTimer <= 0) {
        const E = S.enemies;
        const k = clamp(this.spawnClock / E.spawnRampSeconds, 0, 1);
        this.enemyTimer = lerp(this.rng.val(E.spawnIntervalStart), this.rng.val(E.spawnIntervalEnd), k);
        if (g.enemies.filter((e) => !e.dying).length < E.maxAlive) this.spawnEnemy();
      }
    }

    // ---- candies
    this.candyTimer -= dt;
    if (this.candyTimer <= 0) {
      this.candyTimer = this.rng.val(S.candy.spawnInterval);
      if (g.candies.filter((c) => c.mode !== 'fading').length < S.candy.maxAlive) this.spawnCandy();
    }
  }

  /** A free surface point: not in the lake, not in trees, not on other entities. */
  isFree(d, clearance) {
    const g = this.game, R = g.planet.radius;
    if (g.planet.lakeWeight(d) > 0.01) return false;
    for (const t of g.trees.colliders) if (arcDist(d, t.dir, R) < t.radius + clearance) return false;
    for (const e of g.enemies) if (arcDist(d, e.dir, R) < e.radius + clearance) return false;
    return true;
  }

  randomAround(dist, tries = 30, clearance = 1) {
    const g = this.game, R = g.planet.radius, p = g.player;
    for (let i = 0; i < tries; i++) {
      const d = offsetDir(p.dir, p.ref, this.rng.range(-Math.PI, Math.PI), this.rng.val(dist), R);
      if (this.isFree(d, clearance)) return d;
    }
    return null;
  }

  spawnEnemy() {
    const d = this.randomAround(this.S.enemies.spawnDistance, 30, this.S.enemies.spawnTreeClearance);
    if (d) this.game.enemies.push(new Enemy(this.game, d, this.rng));
  }

  spawnCandy() {
    const d = this.randomAround(this.S.candy.spawnDistance, 30, 1);
    if (d) this.game.candies.push(new Candy(this.game, d, this.rng));
  }

  spawnWiseMan() {
    const g = this.game, W = this.S.wisemen, R = g.planet.radius, p = g.player;
    let dir = null;
    // in the visible range of the player: in front of the camera
    for (let i = 0; i < 40 && !dir; i++) {
      const ang = g.camera.yaw.value + this.rng.range(-1, 1) * W.spawnAngleJitter * DEG * (1 + i / 10);
      const d = offsetDir(p.dir, p.ref, ang, this.rng.val(W.spawnDistance), R);
      if (this.isFree(d, 1.2)) dir = d;
    }
    if (!dir) dir = offsetDir(p.dir, p.ref, g.camera.yaw.value, W.spawnDistance[0], R);
    const w = new WiseMan(g, dir, this.wiseIndex);
    this.wiseIndex++;
    g.wisemen.push(w);
    g.activeWise = w;
  }

  spawnStar() {
    this.game.star = new Star(this.game);
  }

  /** Called after a wise man's magic finishes. */
  onMagicDone() {
    this.wiseTimer = this.wiseIndex < this.S.wisemen.list.length ? this.S.wisemen.nextDelay : this.S.star.spawnDelay;
  }
}
