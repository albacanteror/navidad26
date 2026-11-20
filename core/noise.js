// 3D value noise and fractal sum, seeded.

export function makeNoise3(seed) {
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) vals[i] = rnd() * 2 - 1;

  const fade = (t) => t * t * (3 - 2 * t);
  const v = (x, y, z) => vals[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];

  /** Value noise in [-1, 1]. */
  function noise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = fade(xf), w = fade(yf), t = fade(zf);
    const a = v(xi, yi, zi) + (v(xi + 1, yi, zi) - v(xi, yi, zi)) * u;
    const b = v(xi, yi + 1, zi) + (v(xi + 1, yi + 1, zi) - v(xi, yi + 1, zi)) * u;
    const c = v(xi, yi, zi + 1) + (v(xi + 1, yi, zi + 1) - v(xi, yi, zi + 1)) * u;
    const d = v(xi, yi + 1, zi + 1) + (v(xi + 1, yi + 1, zi + 1) - v(xi, yi + 1, zi + 1)) * u;
    const e = a + (b - a) * w;
    const f = c + (d - c) * w;
    return e + (f - e) * t;
  }

  /** Fractal sum, normalized to roughly [-1, 1]. */
  function fbm(x, y, z, octaves = 3, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(x * freq + o * 17.3, y * freq - o * 9.1, z * freq + o * 4.7);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  return { noise, fbm };
}
