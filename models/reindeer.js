// Super simple low-poly humanoid reindeer. Used for the whole crew:
//  - the player:    build({ prop: 'none' })
//  - camera-bearer: build({ prop: 'camera' }) - carries a cinema camera with a light
//  - boom operator: build({ prop: 'boom', boomLength, boomTilt, boomOffset }) - boom pole + microphone
// `body` = settings.reindeerBody (leg length / thickness): the body is lowered
// onto the legs so the feet always stand on the ground.
// Model space: feet at y = 0, facing +Z, the reindeer's left side is +X.
// Four postures: idle1, idle2 (breathing), walk1, walk2.
//
// Thin parts (antlers, boom pole) are built with `tube`, which has many rings
// along its length, and their roles are listed in settings.mesh.keepRoles so
// the refinement never collapses them: they always get enough strokes.

import { MeshBuilder, ellipsoid, sphere, cone, cylinder, box, tube, xform } from '../geometry/mesh.js';

export const materialSet = {
  fur: 'reindeerFur',
  belly: 'reindeerBelly',
  hoof: 'reindeerHoof',
  antler: 'antler',
  nose: 'reindeerNose',
  eye: 'eyeDark',
  cameraBody: 'cameraBody',
  cameraReel: 'cameraReel',
  cameraLens: 'cameraLens',
  cameraLamp: 'cameraLamp',
  boomPole: 'boomPole',
  boomMic: 'boomMic',
};

/** Ring count so a tube of length h gets a vertex ring about every `step` model units. */
const ringsFor = (h, step = 0.055) => Math.max(2, Math.ceil(h / step));

/** Antlers: a main beam per side, curving out and back, with three tines. */
function addAntlers(b) {
  for (const sx of [1, -1]) {
    const beam = 0.52;
    b.add('head', xform(tube(0.034, 0.014, beam, 5, ringsFor(beam)), { t: [0.08 * sx, 1.57, -0.02], r: [-12, 0, -34 * sx] }), 'antler');
    // tines branch off along the beam (front / up / back)
    const tines = [
      { at: [0.17, 1.72, -0.05], len: 0.22, r: [38, 0, 8 * sx] },
      { at: [0.24, 1.84, -0.08], len: 0.2, r: [-8, 0, -6 * sx] },
      { at: [0.31, 1.94, -0.1], len: 0.17, r: [-40, 0, -18 * sx] },
    ];
    for (const tn of tines) {
      b.add('head', xform(tube(0.02, 0, tn.len, 4, ringsFor(tn.len)), { t: [tn.at[0] * sx, tn.at[1], tn.at[2]], r: tn.r }), 'antler');
    }
  }
}

/**
 * Boom pole held up with both hands, rising forward at `tilt` degrees, with a
 * furry microphone hanging at its end (above whatever the reindeer faces).
 */
function addBoom(b, length, tilt, offset = [0, 0, 0]) {
  const a = (tilt * Math.PI) / 180;
  const dir = [0, Math.sin(a), Math.cos(a)];
  // starts a bit behind the hands; `offset` (model units) moves pole + mic together
  const p0 = [offset[0], 1.52 - dir[1] * 0.35 + offset[1], 0.3 - dir[2] * 0.35 + offset[2]];
  // +Y of the tube rotated (90 - tilt) degrees around X points along `dir`
  b.add('torso', xform(tube(0.022, 0.016, length, 5, ringsFor(length, 0.06)), { t: p0, r: [90 - tilt, 0, 0] }), 'boomPole');
  const end = [p0[0] + dir[0] * length, p0[1] + dir[1] * length, p0[2] + dir[2] * length];
  // short hanger + the microphone windscreen pointing down
  b.add('torso', xform(tube(0.012, 0.012, 0.1, 4, 2), { t: [end[0], end[1] - 0.1, end[2]] }), 'boomPole');
  b.add('torso', xform(ellipsoid(0.075, 0.2, 0.075, 7, 6), { t: [end[0], end[1] - 0.3, end[2]] }), 'boomMic');
}

/** Cinema camera held in front of the chest (two film reels, lens, lamp). */
function addCinemaCamera(b) {
  b.add('torso', xform(box(0.22, 0.2, 0.34), { t: [0, 1.1, 0.33] }), 'cameraBody');
  b.add('torso', xform(cylinder(0.1, 0.05, 8), { t: [0.025, 1.3, 0.24], r: [0, 0, 90] }), 'cameraReel');
  b.add('torso', xform(cylinder(0.1, 0.05, 8), { t: [0.025, 1.3, 0.44], r: [0, 0, 90] }), 'cameraReel');
  b.add('torso', xform(cone(0.05, 0.065, 0.13, 7), { t: [0, 1.1, 0.5], r: [90, 0, 0] }), 'cameraLens');
  b.add('torso', xform(box(0.12, 0.06, 0.04), { t: [0, 1.235, 0.5] }), 'cameraLamp');
}

/** Hip height of the original (long-legged) layout the body coordinates below are written for. */
const ORIGINAL_HIP = 0.62;

/**
 * How much the whole body above the legs is lowered for a given leg length
 * (settings.reindeerBody.legLength). Anything placed relative to the feet
 * (e.g. follower.lightHeight) must account for this.
 */
export function bodyDrop(body) {
  return ORIGINAL_HIP - body.legLength;
}

export function build({ prop = 'none', boomLength = 2.4, boomTilt = 34, boomOffset = [0, 0, 0], boomYaw = 0, body = { legLength: ORIGINAL_HIP, legThickness: 0.085 } } = {}) {
  const b = new MeshBuilder();
  b.part('torso', { pivot: [0, 0.62, 0] });
  b.part('head', { parent: 'torso', pivot: [0, 1.28, 0] });
  b.part('armL', { parent: 'torso', pivot: [0.26, 1.16, 0] });
  b.part('armR', { parent: 'torso', pivot: [-0.26, 1.16, 0] });

  // torso + belly + tail
  b.add('torso', xform(ellipsoid(0.27, 0.36, 0.21, 8, 5), { t: [0, 0.96, 0] }), 'fur');
  b.add('torso', xform(ellipsoid(0.19, 0.26, 0.1, 7, 4), { t: [0, 0.92, 0.13] }), 'belly');
  b.add('torso', xform(ellipsoid(0.07, 0.09, 0.06, 5, 3), { t: [0, 0.72, -0.22] }), 'belly');

  // head
  b.add('head', xform(ellipsoid(0.17, 0.17, 0.19, 8, 5), { t: [0, 1.45, 0.03] }), 'fur');
  b.add('head', xform(ellipsoid(0.1, 0.09, 0.14, 6, 4), { t: [0, 1.39, 0.19] }), 'belly');
  b.add('head', xform(sphere(0.055, 6, 4), { t: [0, 1.41, 0.33] }), 'nose');
  b.add('head', xform(sphere(0.032, 5, 3), { t: [0.08, 1.5, 0.17] }), 'eye');
  b.add('head', xform(sphere(0.032, 5, 3), { t: [-0.08, 1.5, 0.17] }), 'eye');
  b.add('head', xform(ellipsoid(0.04, 0.1, 0.025, 5, 3), { t: [0.17, 1.56, -0.01], r: [0, 0, -55] }), 'fur');
  b.add('head', xform(ellipsoid(0.04, 0.1, 0.025, 5, 3), { t: [-0.17, 1.56, -0.01], r: [0, 0, 55] }), 'fur');
  addAntlers(b);

  // arms + hoof hands
  for (const [part, x] of [['armL', 0.3], ['armR', -0.3]]) {
    b.add(part, xform(ellipsoid(0.065, 0.25, 0.065, 6, 4), { t: [x, 0.94, 0] }), 'fur');
    b.add(part, xform(sphere(0.065, 5, 3), { t: [x * 1.03, 0.69, 0] }), 'hoof');
  }

  let hold = null;
  if (prop === 'camera') {
    addCinemaCamera(b);
    // both arms forward, holding the camera; legs still walk
    hold = { armL: { r: [-72, 0, -14] }, armR: { r: [-72, 0, 14] } };
  } else if (prop === 'boom') {
    const first = b.chunks.length;
    addBoom(b, boomLength, boomTilt, boomOffset);
    // turn the pole + mic (only them) around the vertical axis of the reindeer
    if (boomYaw) {
      const a = (boomYaw * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      for (const ch of b.chunks.slice(first)) {
        const p = ch.geom.positions;
        for (let i = 0; i < p.length; i += 3) {
          const x = p[i], z = p[i + 2];
          p[i] = x * c + z * s;
          p[i + 2] = -x * s + z * c;
        }
      }
    }
    // both arms raised forward, hands meeting under the pole
    hold = { armL: { r: [-140, 0, -16] }, armR: { r: [-140, 0, 16] } };
  }

  // Everything above was written for hips at ORIGINAL_HIP: lower it all onto the
  // (shorter) legs, so the feet stay on the ground.
  const drop = bodyDrop(body);
  for (const ch of b.chunks) {
    const p = ch.geom.positions;
    for (let i = 1; i < p.length; i += 3) p[i] -= drop;
  }
  for (const part of Object.values(b.parts)) if (part.name !== 'root') part.pivot = [part.pivot[0], part.pivot[1] - drop, part.pivot[2]];

  // legs + hooves: from the hips (y = legLength) down to the ground
  const L = body.legLength, T = body.legThickness;
  b.part('legL', { pivot: [0.12, L, 0] });
  b.part('legR', { pivot: [-0.12, L, 0] });
  for (const [part, x] of [['legL', 0.12], ['legR', -0.12]]) {
    b.add(part, xform(ellipsoid(T, L / 2 + 0.02, T, 6, 4), { t: [x, L / 2 + 0.05, 0] }), 'fur');
    b.add(part, xform(box(T * 1.6, 0.1, T * 2), { t: [x, 0.05, 0.02] }), 'hoof');
  }

  if (hold) {
    return b.build([
      { name: 'idle1', parts: { ...hold } },
      { name: 'idle2', parts: { ...hold, torso: { r: [2, 0, 0], t: [0, 0.012, 0] }, head: { r: [-5, 8, 0] } } },
      { name: 'walk1', parts: { ...hold, root: { t: [0, 0.03, 0] }, legL: { r: [-32, 0, 0] }, legR: { r: [26, 0, 0] }, torso: { r: [4, -4, 0] } } },
      { name: 'walk2', parts: { ...hold, legL: { r: [26, 0, 0] }, legR: { r: [-32, 0, 0] }, torso: { r: [4, 4, 0] } } },
    ]);
  }

  return b.build([
    { name: 'idle1', parts: { armL: { r: [6, 0, 8] }, armR: { r: [6, 0, -8] } } },
    { name: 'idle2', parts: { armL: { r: [2, 0, 12] }, armR: { r: [2, 0, -12] }, torso: { r: [3, 0, 0], t: [0, 0.015, 0] }, head: { r: [-6, 10, 0] } } },
    { name: 'walk1', parts: { root: { t: [0, 0.03, 0] }, legL: { r: [-32, 0, 0] }, legR: { r: [26, 0, 0] }, armL: { r: [28, 0, 8] }, armR: { r: [-28, 0, -8] }, torso: { r: [5, -7, 0] } } },
    { name: 'walk2', parts: { legL: { r: [26, 0, 0] }, legR: { r: [-32, 0, 0] }, armL: { r: [-26, 0, 8] }, armR: { r: [26, 0, -8] }, torso: { r: [5, 7, 0] } } },
  ]);
}
