// One play session: world generation, update loop, interactions, endings.

import { makeRng, hash3 } from './core/rng.js';
import {
  hexToRgb, mixRgb, smoothstep, normalize, sub, dot, dist, add, scale, cross, DEG, clamp, arcDist,
} from './core/math.js';
import { Planet } from './geometry/planet.js';
import { StrokeSource } from './render/strokes.js';
import { fillColors } from './models/materials.js';
import { clearModelCache } from './models/model.js';
import { plantTrees } from './world/trees.js';
import { Snow } from './world/snow.js';
import { Sky } from './world/sky.js';
import { Player, Follower, CameraRig } from './entities/player.js';
import { easings } from './core/easing.js';
import { Projectile } from './entities/projectile.js';
import { Director } from './entities/director.js';
import { LightCone } from './world/beams.js';
import { plantCanes } from './world/canes.js';

export class Game {
  constructor({ S, renderer, audio, input, hud, dialog, screens, seed, onRetry }) {
    Object.assign(this, { S, renderer, audio, input, hud, dialog, screens, onRetry });
    this.seed = seed;
    const t0 = performance.now();
    const rng = makeRng(seed);
    this.rng = rng;
    clearModelCache();

    // ---- world
    this.planet = new Planet(S, rng);
    const terrainRange = { ...S.mesh.default, ...S.mesh.terrain };
    const { mesh, normals } = this.planet.buildMesh(terrainRange, S.mesh.maxRefineIterations, S.debug.logMeshStats);
    this.terrainSources = this.chunkTerrain(mesh, normals, terrainRange);
    // the ground is never clipped by the camera (only the UI clearing removes it),
    // and its back-facing strokes are painted too: never a see-through to the inside
    for (const s of this.terrainSources) {
      s.neverClip = true;
      s.backface = false;
    }
    this.trees = plantTrees(S, this.planet, rng, this.planet.startDir);
    // trees whose base is near / behind the game camera, or with the camera inside
    // them, are neither painted nor occlude
    for (const s of this.trees.sources) {
      s.nearCull = S.trees.hideNearerThan ?? 0;
      s.nearInside = S.trees.hideInsideMargin ?? 0;
    }
    this.canes = plantCanes(S, this.planet, rng, this.planet.startDir, this.trees.colliders);
    this.trees.colliders.push(...this.canes.colliders); // canes block like small trunks
    this.sky = new Sky(S, rng, seed);
    this.snow = new Snow(S, this.planet, rng);
    // occlusion: one depth-only source for the whole terrain + trees + canes
    const terrainDepth = { n: mesh.vertexCount, pos: mesh.postures[0], indices: mesh.indices, writesDepth: true, isTerrain: true };
    this.terrainDepth = terrainDepth;
    renderer.setStatic([terrainDepth, ...this.trees.sources, ...this.canes.sources]);
    this.staticSources = [...this.terrainSources, ...this.trees.sources, ...this.canes.sources];
    this.treeCos = this.trees.colliders.map((c) => c);

    // ---- actors
    this.player = new Player(this, this.planet.startDir);
    this.player.heading.snap(this.player.bearingTo(this.planet.lakeDir) + Math.PI * 0.6);
    // the camera-bearer starts a few steps behind the player, facing it
    // the crew starts a few steps behind the player (each on its side), facing it
    const pf = this.player.forward(), pl = this.player.left(), R = this.planet.radius;
    this.followers = S.follower.crew.map((crew) => {
      const side = crew.side ?? 0;
      const d = normalize(add(this.planet.startDir, add(scale(pf, -S.follower.startDistance / R), scale(pl, side / R))));
      const f = new Follower(this, d, crew);
      f.heading.snap(f.bearingTo(this.player.dir));
      return f;
    });
    // the camera-bearer's lamp is the main light
    this.follower = this.followers.find((f) => f.prop === 'camera') || this.followers[0];
    this.characters = [this.player, ...this.followers];
    // translucent cone along the lamp's real light
    this.lightCone = S.follower.lightCone && S.follower.lightCone.enabled ? new LightCone(S.follower.lightCone, S.lighting, rng) : null;
    this.camera = new CameraRig(S, this.player);
    this.enemies = [];
    this.projectiles = [];
    this.wisemen = [];
    this.candies = [];
    this.star = null;
    this.activeWise = null;
    this.director = new Director(this, rng);

    // ---- state
    this.points = 0;
    this.phase = 'ready'; // ready | play | ending | gameover
    this.frozen = false;  // enemies / projectiles / spawners paused (dialogs, magic)
    this.locked = false;  // player cannot move (dialogs, magic, endings)
    this.time = 0;
    this.playTime = 0;
    this.paintT = 0;
    this.paintDone = S.debug.skipPaintIn;
    this.revealOrigin = this.player.worldPos(1);
    this.flashes = []; // short point lights: wise-man magic, projectile hits (see addFlash)
    this.endT = 0;
    this.starSeen = false;
    this.colors = { welcome: hexToRgb(S.colors.welcome), night: hexToRgb(S.colors.night) };
    this.statT = 0;
    this.frames = 0;
    this.fps = 0;
    this.buildMs = performance.now() - t0;
    console.log(`[game] world ${seed} built in ${this.buildMs.toFixed(0)} ms`);
  }

  /** Split the terrain vertices into chunks (nearest of N directions) for culling. */
  chunkTerrain(mesh, normals, range) {
    const S = this.S;
    const K = S.planet.terrainChunks;
    const centers = [];
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < K; i++) {
      const y = 1 - (2 * (i + 0.5)) / K;
      const r = Math.sqrt(1 - y * y);
      centers.push([Math.cos(ga * i) * r, y, Math.sin(ga * i) * r]);
    }
    const pos = mesh.postures[0];
    const n = mesh.vertexCount;
    const owner = new Int32Array(n);
    const counts = new Int32Array(K);
    for (let v = 0; v < n; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      let best = 0, bd = -Infinity;
      for (let c = 0; c < K; c++) {
        const d = x * centers[c][0] + y * centers[c][1] + z * centers[c][2];
        if (d > bd) { bd = d; best = c; }
      }
      owner[v] = best;
      counts[best]++;
    }
    const seeds = new Float32Array(n);
    for (let v = 0; v < n; v++) seeds[v] = (hash3(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) + v * 0.618034) % 1;
    const col = new Float32Array(n * 3), emis = new Float32Array(n);
    fillColors(S, mesh.mats, seeds, {}, col, emis);
    const size = range.maxEdge * range.strokeSize;
    const sources = [];
    const fill = new Int32Array(K);
    for (let c = 0; c < K; c++) {
      const s = new StrokeSource(counts[c]);
      s.writesDepth = false;
      sources.push(s);
    }
    for (let v = 0; v < n; v++) {
      const c = owner[v], s = sources[c], i = fill[c]++;
      s.pos[i * 3] = pos[v * 3]; s.pos[i * 3 + 1] = pos[v * 3 + 1]; s.pos[i * 3 + 2] = pos[v * 3 + 2];
      s.nrm[i * 3] = normals[v * 3]; s.nrm[i * 3 + 1] = normals[v * 3 + 1]; s.nrm[i * 3 + 2] = normals[v * 3 + 2];
      s.col[i * 3] = col[v * 3]; s.col[i * 3 + 1] = col[v * 3 + 1]; s.col[i * 3 + 2] = col[v * 3 + 2];
      s.seed[i] = seeds[v];
      s.size[i] = size;
      s.emis[i] = emis[v];
    }
    const out = sources.filter((s) => s.n > 0);
    for (const s of out) s.computeBounds();
    return out;
  }

  start() {
    this.phase = 'play';
    this.hud.show(true);
  }

  // ================================================================== queries
  canInteract() {
    return this.phase === 'play' && !this.locked && !this.dialog.active;
  }

  /** Push an entity out of the tree trunks. Returns true if it touched one. */
  collideTrees(e) {
    const R = this.planet.radius;
    let hit = false;
    for (const t of this.trees.colliders) {
      const lim = (t.radius + e.radius) / R;
      const d = e.dir;
      if (d[0] * t.dir[0] + d[1] * t.dir[1] + d[2] * t.dir[2] < Math.cos(lim)) continue;
      if (e.pushFrom(t.dir, t.radius + e.radius)) hit = true;
    }
    return hit;
  }

  // ================================================================== events
  spawnProjectile(enemy) {
    this.projectiles.push(new Projectile(this, enemy, this.rng));
    this.audio.sfx('throw');
  }

  /**
   * Add a point light that fades out with ease-out cubic.
   * All flashes (magic glow, projectile hits) go through the same system.
   */
  addFlash(pos, colorHex, strength, radius, seconds) {
    this.flashes.push({ pos, color: hexToRgb(colorHex), strength0: strength, strength, radius, seconds, t: 0 });
  }

  updateFlashes(dt) {
    for (const f of this.flashes) {
      f.t += dt;
      f.strength = f.strength0 * (1 - easings.easeOutCubic(Math.min(1, f.t / f.seconds)));
    }
    this.flashes = this.flashes.filter((f) => f.t < f.seconds);
  }

  /** A projectile hit one of the two reindeer: both share the same life. */
  hitCharacter(target, damage) {
    if (this.phase !== 'play') return;
    const L = this.S.lighting;
    this.audio.sfx('hit');
    target.hitTimer = this.S.player.hitFlashSeconds;
    this.addFlash(target.chest(), L.hitFlashColor, L.hitFlashStrength, L.hitFlashRadius, L.hitFlashSeconds);
    if (this.S.debug.godMode) return;
    this.player.life -= damage;
    if (this.player.life <= 0) this.gameOver();
  }

  onEnemyDied() {
    this.points += this.S.wisemen.pointsPerKill;
  }

  startWiseDialog(w) {
    this.locked = true;
    this.frozen = true;
    this.dialog.open(w.def.name, w.def.pages, () => w.startMagic());
  }

  magicBurst(w) {
    const W = this.S.wisemen;
    const L = this.S.lighting;
    this.addFlash(w.worldPos(1.6), L.magicFlashColor, L.magicFlashStrength, L.magicFlashRadius, L.magicFlashSeconds);
    this.audio.sfx('magic');
    for (const e of this.enemies) if (!e.dying && e.distanceTo(w.dir) < W.killRange) e.die();
    if (this.S.projectiles.dissolveInMagic) {
      for (const p of this.projectiles) if (dist(p.pos, w.worldPos()) < W.killRange) p.alive = false;
    }
  }

  endMagic(w) {
    this.frozen = false;
    this.locked = false;
    if (this.activeWise === w) this.activeWise = null;
    this.director.onMagicDone();
  }

  startCandyDialog(c) {
    this.locked = true;
    this.frozen = true;
    this.dialog.open(c.name, [c.line], () => {
      c.vanish();
      this.player.life = Math.min(this.S.player.maxLife, this.player.life + this.S.candy.heal);
      this.audio.sfx('heal');
      this.locked = false;
      this.frozen = false;
    });
  }

  startEnding() {
    this.phase = 'ending';
    this.locked = true;
    this.frozen = true;
    this.star.ending = true;
    this.endT = 0;
  }

  gameOver() {
    this.phase = 'gameover';
    this.locked = true;
    this.frozen = true;
    this.endT = 0;
  }

  // ================================================================== update
  update(dt) {
    const S = this.S, input = this.input;
    this.time += dt;

    if (input.wasPressed('F2')) S.debug.showStats = !S.debug.showStats;
    if (input.wasPressed('F3')) S.debug.showOcclusionGeometry = !S.debug.showOcclusionGeometry;

    if (this.phase === 'ready') return;
    if (this.phase === 'play') this.playTime += dt;

    // ---- paint-in
    if (!this.paintDone) {
      this.paintT += dt;
      if (this.paintT >= S.timing.paintInSeconds) this.paintDone = true;
    }

    // ---- dialog + player
    this.dialog.update(dt, input);
    const canMove = this.phase === 'play' && !this.locked && !this.dialog.active;
    if (canMove) this.player.update(dt, input, this.camera.yaw.value, true);
    else this.player.idle(dt);
    for (const f of this.followers) f.update(dt, canMove);
    for (const c of this.characters) {
      this.collideTrees(c);
      for (const e of this.enemies) if (!e.dying) c.pushFrom(e.dir, c.radius + e.radius, 0.5);
      for (const w of this.wisemen) c.pushFrom(w.dir, c.radius + w.radius);
    }
    // followers give way to the player and keep apart from each other
    const sep = S.follower.separation;
    this.followers.forEach((f, i) => {
      f.pushFrom(this.player.dir, f.radius + this.player.radius);
      for (let j = i + 1; j < this.followers.length; j++) {
        const o = this.followers[j];
        f.pushFrom(o.dir, sep, 0.5);
        o.pushFrom(f.dir, sep, 0.5);
      }
    });
    this.camera.update(dt, input, this.player, this.planet, this.phase === 'play' || this.phase === 'ending');

    // ---- world
    if (!this.frozen) this.director.update(dt);
    for (const e of this.enemies) e.update(dt, this.frozen);
    if (!this.frozen) this.separateEnemies();
    for (const e of this.enemies) e.updateModel();
    for (const p of this.projectiles) p.update(dt, this.frozen);
    for (const w of this.wisemen) w.update(dt);
    for (const c of this.candies) c.update(dt);
    if (this.star) this.updateStar(dt);
    this.snow.update(dt, this.player.dir);
    this.sky.update(dt);
    this.player.animate(dt);
    for (const f of this.followers) f.animate(dt);
    this.updateFlashes(dt);

    this.enemies = this.enemies.filter((e) => e.alive);
    this.projectiles = this.projectiles.filter((p) => p.alive);
    this.wisemen = this.wisemen.filter((w) => w.alive);
    this.candies = this.candies.filter((c) => c.alive);

    this.updateEndings(dt);
    this.updateMusic();
    this.hud.update(this.player.life, S.player.maxLife, this.points);
    this.lightFrame = this.follower.light(dt);
    if (this.lightCone) this.lightCone.update(this.lightFrame);
    this.screens.showLockHint(this.phase === 'play' && input.usesLock && !input.locked);
  }

  separateEnemies() {
    const E = this.enemies;
    for (let i = 0; i < E.length; i++) {
      const a = E[i];
      if (a.dying || !a.emerged) continue;
      for (let j = i + 1; j < E.length; j++) {
        const b = E[j];
        if (b.dying || !b.emerged) continue;
        const min = a.radius + b.radius;
        const d = arcDist(a.dir, b.dir, this.planet.radius);
        if (d < min) {
          a.pushFrom(b.dir, min, 0.5);
          b.pushFrom(a.dir, min, 0.5);
        }
      }
      for (const c of this.characters) a.pushFrom(c.dir, a.radius + c.radius, 0.5);
    }
  }

  updateStar(dt) {
    const st = this.star, T = this.S.star;
    st.update(dt);
    const d = st.distanceToPlayer();
    if (!this.starSeen && d < T.viewRange && this.inView(st.pos)) {
      this.starSeen = true;
      this.audio.sfx('starSeen');
    }
    if (this.phase === 'play' && d < T.triggerRange) this.startEnding();
  }

  inView(p) {
    const cam = this.camera;
    const fwd = normalize(sub(cam.target, cam.pos));
    const right = normalize(cross(fwd, cam.up));
    const up = cross(right, fwd);
    const rel = sub(p, cam.pos);
    const z = dot(rel, fwd);
    if (z <= 0) return false;
    const tanY = Math.tan((this.S.render.fovY * DEG) / 2);
    const aspect = this.renderer.canvas.width / this.renderer.canvas.height;
    return Math.abs(dot(rel, right)) < z * tanY * aspect && Math.abs(dot(rel, up)) < z * tanY;
  }

  updateEndings(dt) {
    const S = this.S, T = S.star;
    if (this.phase === 'ending') {
      this.endT += dt;
      const k = clamp(this.endT / T.whiteoutSeconds, 0, 1);
      this.screens.setOverlay(S.colors.endingOverlay, k * k * (3 - 2 * k));
      if (this.endT > T.whiteoutSeconds + T.textDelaySeconds && !this.endShown) {
        this.endShown = true;
        this.input.releaseLock();
        // play time of every try, this one included
        this.screens.showWin(this.points, this.onRetry, (this.pastPlayTime || 0) + this.playTime);
      }
    } else if (this.phase === 'gameover') {
      this.endT += dt;
      const k = clamp(this.endT / 2, 0, 1);
      this.screens.setOverlay(S.colors.gameOverOverlay, 0.85 * k);
      if (this.endT > 1.2 && !this.endShown) {
        this.endShown = true;
        this.input.releaseLock();
        this.screens.showEnd(S.text.gameOverTitle, S.text.gameOverPoints.replace('{points}', this.points), this.onRetry, true);
      }
    }
  }

  updateMusic() {
    const S = this.S;
    let track = 'gameplay';
    if (this.phase === 'ending') track = 'final';
    else if (this.phase === 'gameover') track = S.audio.gameOverTrack;
    else if (this.wisemen.some((w) => w.mode !== 'fading')) track = 'wiseman';
    else if (this.star && this.star.distanceToPlayer() < S.star.nearRange) track = 'nearStar';
    this.audio.setTrack(track);
  }

  // ================================================================== render
  /** Every point light this frame; the renderer keeps the most relevant ones. */
  pointLights() {
    const out = [...this.flashes];
    for (const w of this.wisemen) out.push(w.aura());
    if (this.star) out.push(this.star.aura());
    for (const e of this.enemies) out.push(e.aura());
    return out;
  }

  render() {
    const S = this.S;
    // background: welcome color -> night during the paint-in
    let bg = this.colors.night;
    let revealRadius = 1e6;
    if (!this.paintDone) {
      const u = clamp(this.paintT / S.timing.paintInSeconds, 0, 1);
      const [a, b] = S.timing.backgroundFade;
      bg = mixRgb(this.colors.welcome, this.colors.night, smoothstep(a, b, u));
      revealRadius = S.timing.paintInRevealMax * Math.pow(u, S.timing.paintInPower);
    }
    if (this.phase === 'ready') revealRadius = -1;

    const dynamic = this.characters.map((c) => c.source);
    for (const e of this.enemies) dynamic.push(e.source);
    for (const p of this.projectiles) dynamic.push(p.source);
    for (const w of this.wisemen) dynamic.push(w.source);
    for (const c of this.candies) dynamic.push(c.source);
    if (this.star) { this.star.source.writesDepth = false; dynamic.push(this.star.source); }
    // translucent light shapes (no depth, painted last by distance like any stroke)
    const glows = [];
    for (const w of this.wisemen) glows.push(...w.beam.sources);
    if (this.star) glows.push(...this.star.beam.sources);
    if (this.lightCone) glows.push(this.lightCone.source);
    const sources = [...this.staticSources, ...this.sky.sources, this.snow.source, ...dynamic, ...glows];

    // the follower's cinema-camera lamp, always aimed at the player
    const light = this.lightFrame || this.follower.light(0);
    const L = S.lighting;
    const t = this.time;
    const flicker = 1 + L.lightFlicker * (Math.sin(t * 13.1) * 0.5 + Math.sin(t * 7.3 + 1.3) * 0.3 + Math.sin(t * 23.7) * 0.2);
    const lantern = { ...light, boost: L.lightBoost * flicker };

    this.renderer.render({
      sources,
      dynamicSources: dynamic,
      camera: { pos: this.camera.pos, target: this.camera.target, up: this.camera.up },
      lantern,
      background: bg,
      reveal: { origin: this.revealOrigin, radius: revealRadius },
      // point lights: short flashes + auras (wise men, star, enemies)
      flashes: this.pointLights(),
      playerPos: this.player.chest(),
      time: this.time,
      // no strokes behind the dialog box / "click to return" text, so it stays legible
      holes: this.screens.uiHoles(),
      arcHole: this.dialog.arc(),
    });
  }
}
