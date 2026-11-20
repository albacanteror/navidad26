// Shared material library.
// Materials only determine the stroke color (plus brightness variance and
// emissive). Their values live in settings.materials. Every model file has
// its own MATERIAL SET: a map from the model's roles (e.g. "foliage",
// "trunk") to a material. A role can point to:
//   - a shared material name:   'pineDark'
//   - a raw color:              '#ff0000'           (variance 0.08, emissive 0)
//   - a full material object:   { color, variance, emissive }
// so materials can be shared between models, or overridden per instance.

import { hexToRgb } from '../core/math.js';

export function resolveMaterial(S, ref) {
  if (typeof ref === 'string' && ref.startsWith('#')) return { rgb: hexToRgb(ref), variance: 0.08, emissive: 0, strokeScale: 1 };
  if (typeof ref === 'object' && ref) {
    return { rgb: hexToRgb(ref.color), variance: ref.variance ?? 0.08, emissive: ref.emissive ?? 0, strokeScale: ref.strokeScale ?? 1 };
  }
  const m = S.materials[ref];
  if (!m) {
    console.warn(`[materials] unknown material "${ref}", using magenta`);
    return { rgb: [1, 0, 1], variance: 0, emissive: 1, strokeScale: 1 };
  }
  return { rgb: hexToRgb(m.color), variance: m.variance ?? 0, emissive: m.emissive ?? 0, strokeScale: m.strokeScale ?? 1 };
}

/**
 * Fill color + emissive arrays for a list of per-vertex roles.
 * `set` maps role -> material reference. Unknown roles fall back to the role
 * name itself as a material name.
 * `size` (optional): per-vertex stroke sizes, multiplied by the material's strokeScale.
 */
export function fillColors(S, roles, seeds, set, col, emis, size = null) {
  const cache = {};
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    let m = cache[role];
    if (!m) m = cache[role] = resolveMaterial(S, set[role] !== undefined ? set[role] : role);
    const v = 1 + m.variance * (((seeds[i] * 7.919) % 1) - 0.5) * 2;
    col[i * 3] = Math.min(1, m.rgb[0] * v);
    col[i * 3 + 1] = Math.min(1, m.rgb[1] * v);
    col[i * 3 + 2] = Math.min(1, m.rgb[2] * v);
    emis[i] = m.emissive;
    if (size) size[i] *= m.strokeScale;
  }
}
