// Candy cane: an inverted "J" (straight shaft + round hook at the top) with
// red and white diagonal stripes. Stuck into the snow by world/canes.js.
// Model space: base at y = 0, the hook bends toward +X. Values in settings.canes.

import { Mesh, pathTube } from '../geometry/mesh.js';

/** Material set: role -> shared material (see settings.materials). */
export const materialSet = { caneRed: 'caneRed', caneWhite: 'caneWhite' };

export function build(C) {
  const step = C.ringStep;
  const H = C.shaftHeight, R = C.hookRadius;
  const pts = [];
  // shaft, straight up
  const nShaft = Math.max(2, Math.ceil(H / step));
  for (let i = 0; i <= nShaft; i++) pts.push([0, (H * i) / nShaft, 0]);
  // hook: half circle over the top, from the shaft to the other side
  const nHook = Math.max(4, Math.ceil((Math.PI * R) / step));
  for (let i = 1; i <= nHook; i++) {
    const phi = Math.PI - (Math.PI * i) / nHook;
    pts.push([R + R * Math.cos(phi), H + R * Math.sin(phi), 0]);
  }
  // short tail hanging down
  const nTail = Math.max(1, Math.ceil(C.tailLength / step));
  for (let i = 1; i <= nTail; i++) pts.push([2 * R, H - (C.tailLength * i) / nTail, 0]);

  const g = pathTube(pts, C.tubeRadius, C.segments);
  // diagonal stripes: alternate by (arc length + a twist around the tube)
  const mats = g.s.map((s, i) => {
    const k = Math.floor((s + (g.a[i] / (Math.PI * 2)) * C.stripeTwist) / C.stripeWidth);
    return k % 2 === 0 ? 'caneRed' : 'caneWhite';
  });
  return new Mesh([new Float32Array(g.positions)], ['rest'], new Uint32Array(g.indices), mats);
}
