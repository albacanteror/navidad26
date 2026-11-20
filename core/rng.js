// Seeded pseudo random numbers (mulberry32) plus helpers.

export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + (hi - lo) * rng();
  rng.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * rng());
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  /** A settings value: [min,max] -> random in range, number -> itself. */
  rng.val = (v) => (Array.isArray(v) ? rng.range(v[0], v[1]) : v);
  /** Same as val, but an integer. */
  rng.ival = (v) => (Array.isArray(v) ? rng.int(v[0], v[1]) : v);
  rng.sign = () => (rng() < 0.5 ? -1 : 1);
  /** Uniform random unit vector built from a pair of random angles. */
  rng.dir = () => {
    const lon = rng() * Math.PI * 2;
    const lat = Math.asin(rng() * 2 - 1);
    return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
  };
  /** Weighted pick from an object { key: weight }. */
  rng.weighted = (obj) => {
    const entries = Object.entries(obj);
    let total = 0;
    for (const [, w] of entries) total += w;
    let r = rng() * total;
    for (const [k, w] of entries) {
      if ((r -= w) <= 0) return k;
    }
    return entries[entries.length - 1][0];
  };
  return rng;
}

/** Stable hash of 3 numbers -> [0, 1). */
export function hash3(x, y, z) {
  let h = Math.imul(Math.floor(x * 1000.3) | 0, 374761393) ^ Math.imul(Math.floor(y * 1000.7) | 0, 668265263) ^ Math.imul(Math.floor(z * 1000.1) | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function randomSeed() {
  return (Math.random() * 4294967296) >>> 0;
}
