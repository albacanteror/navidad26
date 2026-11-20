// Small vector / matrix library. Vectors are plain [x, y, z] arrays.
// Matrices are column-major Float32Array(16) (WebGL convention).

export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---------------------------------------------------------------- vec3
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const addScaled = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export function normalize(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
export const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Rodrigues rotation of v around unit axis k by angle a. */
export function rotateAxis(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
}

/** Any unit vector perpendicular to n. */
export function anyPerpendicular(n) {
  const a = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return normalize(cross(n, a));
}

// ---------------------------------------------------------------- sphere surface helpers
// A surface point is a unit direction `up`. A tangent `ref` vector is carried
// along by parallel transport when moving, and headings are angles measured
// from `ref` toward `right = cross(ref, up)`.

/** Remove the radial component of ref and normalize it. */
export function orthoRef(up, ref) {
  const r = sub(ref, scale(up, dot(ref, up)));
  const l = length(r);
  return l < 1e-6 ? anyPerpendicular(up) : scale(r, 1 / l);
}
export const rightOf = (up, ref) => cross(ref, up);

/** Unit tangent pointing at `angle` in the (ref, right) frame. */
export function headingVec(up, ref, angle) {
  const r = cross(ref, up);
  const c = Math.cos(angle), s = Math.sin(angle);
  return [ref[0] * c + r[0] * s, ref[1] * c + r[1] * s, ref[2] * c + r[2] * s];
}

/** Heading angle (in the ref frame at `up`) of the great circle toward `targetDir`. */
export function bearing(up, ref, targetDir) {
  const t = sub(targetDir, scale(up, dot(targetDir, up)));
  const r = cross(ref, up);
  return Math.atan2(dot(t, r), dot(t, ref));
}

/** Arc length between two unit directions on a sphere of radius R. */
export function arcDist(a, b, R) {
  return Math.acos(clamp(dot(a, b), -1, 1)) * R;
}

/**
 * Move a surface point along unit tangent `t` by `angle` radians.
 * Returns { up, ref } with ref parallel-transported.
 */
export function moveOnSphere(up, ref, t, angle) {
  const k = cross(up, t);
  const kl = length(k);
  if (kl < 1e-9 || angle === 0) return { up, ref };
  const kn = scale(k, 1 / kl);
  const nu = normalize(rotateAxis(up, kn, angle));
  const nr = orthoRef(nu, rotateAxis(ref, kn, angle));
  return { up: nu, ref: nr };
}

/** Direction reached by walking `arc` world units from `up` toward heading `angle`. */
export function offsetDir(up, ref, angle, arc, R) {
  const t = headingVec(up, ref, angle);
  return moveOnSphere(up, ref, t, arc / R).up;
}

// ---------------------------------------------------------------- mat4
export function mat4() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

export function lookAt(eye, target, up) {
  const f = normalize(sub(target, eye));
  const s = normalize(cross(f, up));
  const u = cross(s, f);
  const m = new Float32Array(16);
  m[0] = s[0]; m[4] = s[1]; m[8] = s[2];
  m[1] = u[0]; m[5] = u[1]; m[9] = u[2];
  m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2];
  m[12] = -dot(s, eye);
  m[13] = -dot(u, eye);
  m[14] = dot(f, eye);
  m[15] = 1;
  return m;
}

export function multiply(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

export function translation(t) {
  const m = mat4();
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2];
  return m;
}
export function scaling(s) {
  const m = mat4();
  m[0] = s[0]; m[5] = s[1]; m[10] = s[2];
  return m;
}
/** Euler rotation in degrees, applied X then Y then Z (R = Rz * Ry * Rx). */
export function rotationEuler(r) {
  const [x, y, z] = [r[0] * DEG, r[1] * DEG, r[2] * DEG];
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  const m = mat4();
  // Rz*Ry*Rx
  m[0] = cz * cy; m[4] = cz * sy * sx - sz * cx; m[8] = cz * sy * cx + sz * sx;
  m[1] = sz * cy; m[5] = sz * sy * sx + cz * cx; m[9] = sz * sy * cx - cz * sx;
  m[2] = -sy;     m[6] = cy * sx;                m[10] = cy * cx;
  return m;
}

/** Model matrix from an orthonormal basis (columns X, Y, Z), origin and uniform scale. */
export function fromBasis(X, Y, Z, o, s = 1) {
  const m = new Float32Array(16);
  m[0] = X[0] * s; m[1] = X[1] * s; m[2] = X[2] * s;
  m[4] = Y[0] * s; m[5] = Y[1] * s; m[6] = Y[2] * s;
  m[8] = Z[0] * s; m[9] = Z[1] * s; m[10] = Z[2] * s;
  m[12] = o[0]; m[13] = o[1]; m[14] = o[2]; m[15] = 1;
  return m;
}

export function transformPoint(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}
