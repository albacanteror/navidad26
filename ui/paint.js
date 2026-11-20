// Painted UI: backgrounds for dialog boxes, buttons, hints and the calendar
// are made of the same procedural brush dabs as the 3D world (render/brush.js),
// tinted and stamped on a 2D canvas. Text stays in Georgia.
// Settings: settings.ui.paint.

import { makeBrushAtlas } from '../render/brush.js';
import { makeRng } from '../core/rng.js';

const VARIANTS = 4, DW = 128, DH = 48;
let atlas = null;
const tinted = new Map(); // color -> canvas of tinted dabs

function getAtlas() {
  if (!atlas) atlas = makeBrushAtlas(VARIANTS, DW, DH, 4242);
  return atlas;
}

/** The brush atlas tinted to a CSS color (alpha of the color is kept in the dabs). */
function tint(color) {
  let c = tinted.get(color);
  if (c) return c;
  const a = getAtlas();
  c = document.createElement('canvas');
  c.width = a.width;
  c.height = a.height;
  const x = c.getContext('2d');
  x.drawImage(a, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  tinted.set(color, c);
  return c;
}

/** Lighter / darker variants of a CSS color, for the painterly color jitter. */
function shade(color, k) {
  // mix with white (k > 0) or black (k < 0) via a tiny canvas
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = x.getImageData(0, 0, 1, 1).data;
  const t = Math.abs(k), to = k > 0 ? 255 : 0;
  const m = (v) => Math.round(v + (to - v) * t);
  return `rgba(${m(r)}, ${m(g)}, ${m(b)}, ${(a / 255).toFixed(3)})`;
}

/** Stamp one brush dab centered at (x, y), length `len`, rotation `rot` (radians). */
export function dab(ctx, color, x, y, len, rot, rng, alpha = 1, thick = 0.38) {
  const src = tint(color);
  const v = Math.floor(rng() * VARIANTS);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.drawImage(src, v * DW, 0, DW, DH, -len / 2, (-len * thick) / 2, len, len * thick);
  ctx.restore();
}

/**
 * Fill the rectangle (x, y, w, h) of a 2D context with brush dabs, mostly
 * horizontal, denser in the middle, with ragged borders.
 */
export function paintRect(ctx, x, y, w, h, color, seed, P) {
  const rng = makeRng(seed);
  const THICK = 0.38;
  // dabs must fit: never longer than half the width, never thicker than the height
  const s = Math.max(4, Math.min(P.dabSize, w * 0.5, (h * 0.9) / THICK));
  const colors = [color, shade(color, P.colorJitter), shade(color, -P.colorJitter)];
  const rough = P.edgeRoughness;
  const pick = () => colors[rng() < 0.6 ? 0 : rng() < 0.5 ? 1 : 2];
  // 1) like painting a wall: overlapping horizontal rows of dabs, so the
  //    middle is solid. Rows start / end at random places = ragged sides.
  const rowStep = (s * THICK * 0.5) / Math.max(0.3, P.density / 1.7);
  for (let yy = s * THICK * 0.5; yy <= h - s * THICK * 0.5 + 0.01; yy += rowStep) {
    const x0 = (s / 2) * (1 + rough * rng() * rng());
    const x1 = w - (s / 2) * (1 + rough * rng() * rng());
    for (let xx = x0; xx <= x1 + 0.01; xx += s * 0.45) {
      const len = s * (0.85 + rng() * 0.3);
      dab(ctx, pick(), x + Math.min(xx, x1), y + yy + (rng() - 0.5) * rowStep * 0.6, len,
        (rng() - 0.5) * 0.1 + (rng() < 0.5 ? 0 : Math.PI), rng, P.opacity * (0.75 + rng() * 0.25), THICK);
    }
  }
  // 2) loose dabs on top, for texture
  const count = Math.ceil(((w * h) / (s * s * THICK)) * P.density * 0.4);
  for (let i = 0; i < count; i++) {
    const len = s * (0.7 + rng() * 0.6);
    const th = len * THICK;
    // the whole dab stays inside the box (so the border is made of dab ends,
    // never clipped straight); edgeRoughness pulls some of them further inside
    const mx = (len / 2) * (1 + rough * rng() * rng());
    const my = (th / 2) * (1 + rough * rng() * rng());
    const px = x + mx + rng() * Math.max(0, w - 2 * mx);
    const py = y + my + rng() * Math.max(0, h - 2 * my);
    const rot = (rng() - 0.5) * 0.12 + (rng() < 0.5 ? 0 : Math.PI);
    const col = colors[rng() < 0.6 ? 0 : rng() < 0.5 ? 1 : 2];
    dab(ctx, col, px, py, len, rot, rng, P.opacity * (0.7 + rng() * 0.3), THICK);
  }
}

/**
 * Keep only a rounded rectangle of what is painted on the canvas, with a soft
 * (blurred) border: corners are round and no dab ends in a hard cut.
 * radius / feather in CSS px; dpr = canvas pixels per CSS px.
 */
export function roundFeather(canvas, radius, feather, dpr = 1) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const f = Math.max(0, feather * dpr);
  const inset = f * 1.2;
  const r = Math.min(radius * dpr, (W - 2 * inset) / 2, (H - 2 * inset) / 2);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  if (f > 0) ctx.filter = `blur(${f}px)`;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.roundRect(inset, inset, W - 2 * inset, H - 2 * inset, Math.max(0, r));
  ctx.fill();
  ctx.restore();
}

/** A hand-drawn line made of small dabs along a polyline [[x,y],...]. */
export function paintPath(ctx, pts, color, width, rng, P, progress = 1) {
  if (pts.length < 2) return;
  // total length, to draw only `progress` of it
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const limit = total * progress;
  const len = width / 0.42; // dab thickness = line width
  const step = len * 0.3;
  let acc = 0, next = 0;
  for (let i = 1; i < pts.length && acc < limit; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    const rot = Math.atan2(y1 - y0, x1 - x0);
    while (next <= acc + seg && next <= limit) {
      const t = seg > 0 ? (next - acc) / seg : 0;
      dab(ctx, color, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, len * (0.8 + rng() * 0.4), rot + (rng() - 0.5) * 0.3, rng, P.opacity, 0.42);
      next += step;
    }
    acc += seg;
  }
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Give an element a painted background (replaces its CSS background, border
 * and shadow). Repaints when its size changes. Returns { repaint(seed) }.
 */
export function paintElement(el, color, S, extra = {}) {
  const P = { ...S.ui.paint, ...extra };
  let seed = hashString(el.id || el.textContent || 'el') + (P.seed || 0);
  let lastKey = '';
  const draw = () => {
    const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
    if (w < 2 || h < 2) return;
    const key = `${w}x${h}|${seed}|${color}`;
    if (key === lastKey) return;
    lastKey = key;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * dpr);
    c.height = Math.ceil(h * dpr);
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    paintRect(ctx, 0, 0, w, h, color, seed, P);
    if (P.cornerRadius || P.feather) roundFeather(c, P.cornerRadius || 0, P.feather || 0, dpr);
    Object.assign(el.style, {
      backgroundColor: 'transparent',
      backgroundImage: `url(${c.toDataURL()})`,
      backgroundSize: '100% 100%',
      backgroundRepeat: 'no-repeat',
      border: 'none',
      boxShadow: 'none',
    });
  };
  new ResizeObserver(draw).observe(el);
  draw();
  return {
    repaint(newSeed = seed + 1) { seed = newSeed; draw(); },
    setColor(c) { color = c; draw(); },
  };
}

/** Painted buttons: new random paint on hover, so they feel alive. */
export function paintButton(btn, S) {
  const p = paintElement(btn, S.ui.buttonColor, S, {
    cornerRadius: S.ui.cornerRadius, feather: S.ui.feather, ...(S.ui.buttonPaint || {}),
  });
  btn.style.color = S.ui.buttonTextColor;
  if (S.ui.repaintOnHover) btn.addEventListener('mouseenter', () => p.repaint());
  return p;
}
