// Procedural brush dabs: an atlas of N elongated, ragged, bristly strokes.
// Only the alpha channel matters: the stroke color comes from the material.

import { makeRng } from '../core/rng.js';

const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function noise1(table) {
  const n = table.length;
  return (x) => {
    const i = Math.floor(x), f = x - i;
    const a = table[((i % n) + n) % n], b = table[(((i + 1) % n) + n) % n];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
}

function noise2(rng) {
  const t = Array.from({ length: 64 * 64 }, () => rng());
  const at = (x, y) => t[(((y % 64) + 64) % 64) * 64 + (((x % 64) + 64) % 64)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * u;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * u;
    return a + (b - a) * v;
  };
}

/** Returns a canvas: `variants` dabs side by side, each w x h pixels. */
export function makeBrushAtlas(variants, w, h, seed = 1337) {
  const canvas = document.createElement('canvas');
  canvas.width = w * variants;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(canvas.width, h);
  const rng = makeRng(seed);

  for (let v = 0; v < variants; v++) {
    const ragged = noise1(Array.from({ length: 32 }, () => rng()));
    const bristles = noise1(Array.from({ length: 64 }, () => rng()));
    const dry = noise2(rng);
    const taper = rng.range(0.15, 0.5);       // narrower tail
    const dryAmount = rng.range(0.25, 0.7);   // gaps toward the tail
    const bristleFreq = rng.range(10, 22);
    const exp = rng.range(1.8, 2.8);          // superellipse roundness
    const flip = rng() < 0.5 ? -1 : 1;        // which end is the tail
    for (let y = 0; y < h; y++) {
      const vy = ((y + 0.5) / h) * 2 - 1;
      const lenMod = 0.8 + 0.2 * ragged(vy * 3 + v * 5.3);
      const br = 0.55 + 0.45 * bristles(vy * bristleFreq + v * 11);
      for (let x = 0; x < w; x++) {
        const ux = (((x + 0.5) / w) * 2 - 1) * flip;
        const wv = 1 - taper * sstep(-0.3, 1, ux);
        const d = Math.pow(Math.abs(ux / lenMod), exp) + Math.pow(Math.abs(vy) / wv, 2.2);
        let a = 1 - sstep(0.6, 1.0, d);
        const tail = sstep(0.0, 1.0, ux) * dryAmount;
        a *= 1 - tail * (1 - sstep(0.35, 0.65, dry(ux * 3 + v * 7, vy * 14)));
        a *= br;
        const o = (y * canvas.width + v * w + x) * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
        img.data[o + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
