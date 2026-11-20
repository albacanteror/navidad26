// GLSL sources.

// Depth-only pass: triangles into the camera depth buffer or lantern shadow map.
// vW = view depth; fragments closer than uClipNear are discarded (camera
// clipping of the ground, camera.terrainClips). uClipNear = 0: nothing clipped.
export const depthVS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
out float vW;
void main(){ gl_Position = uViewProj * vec4(aPos, 1.0); vW = gl_Position.w; }`;

export const depthFS = `#version 300 es
precision highp float;
in float vW;
uniform float uClipNear;
void main(){ if (vW < uClipNear) discard; }`;

// Debug: draw occlusion triangles translucently.
export const debugFS = `#version 300 es
precision mediump float;
uniform vec4 uColor;
out vec4 o;
void main(){ o = uColor; }`;

// The stroke shader. One instanced quad per visible vertex, camera facing,
// rotated on the screen plane. Lighting and occlusion are computed per vertex.
export const strokeVS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 iPos;
layout(location=2) in vec3 iNrm;
layout(location=3) in vec3 iCol;
layout(location=4) in vec4 iMisc;   // seed, world size (negative = ground), emissive, fog multiplier
layout(location=5) in float iAlpha;

uniform mat4 uViewProj;
uniform mat3 uViewRot;
uniform vec2 uViewport;
uniform float uFocalPx;
uniform vec2 uNearFar;          // projection near (GROUND_NEAR) / far: linearizes the depth buffer
uniform vec2 uStrokeNear;       // near cut: x = render.near (everything), y = GROUND_NEAR (the ground)

uniform sampler2D uDepth;
uniform float uDepthBias;
uniform float uDepthBiasScale;

uniform mat4 uLightVP;
uniform sampler2D uShadow;
uniform vec2 uLightNearFar;
uniform float uShadowBias;
uniform float uShadowNormalOffset;
uniform vec3 uLanternPos;
uniform vec3 uLanternDir;
uniform vec2 uLanternCone;      // cos(outer), cos(inner)
uniform float uLanternRange;
uniform vec3 uLanternColor;
uniform float uLanternBoost;

uniform vec3 uAmbDir;
uniform vec3 uAmbColor;
uniform float uAmbBase;
uniform float uDiffuse;

uniform vec3 uFogColor;
uniform vec2 uFog;

uniform vec4 uSize;             // minPx, maxPx, aspect, aspectJitter
uniform vec4 uShrink;           // near, far, farScale, scaleJitter
uniform vec2 uRot;              // normal weight, random amount

uniform vec4 uReveal;           // origin xyz, radius
uniform vec2 uRevealParams;     // jitter, edge softness

#define MAX_FLASHES 6
uniform vec4 uFlashPos[MAX_FLASHES];   // point flash lights: position xyz, strength
uniform vec4 uFlashCol[MAX_FLASHES];   // color rgb, radius

uniform vec3 uPlayerPos;        // proximity light: strokes closer to the player get more light
uniform vec3 uProxColor;
uniform vec3 uProx;             // radius, boost, falloff power

uniform float uTime;
uniform float uTwinkle;
uniform float uVariants;

out vec2 vUV;
out vec4 vColor;
flat out float vVariant;

float linDepth(float d, vec2 nf){
  float z = d * 2.0 - 1.0;
  return 2.0 * nf.x * nf.y / (nf.y + nf.x - z * (nf.y - nf.x));
}
float hash(float n){ return fract(sin(n) * 43758.5453123); }

uniform vec2 uContrast;         // amount (1 = off), pivot
// Contrast S-curve that keeps 0 and 1 fixed: below the pivot values are pushed
// down, above it pushed up. Values above 1 (glows) are left as they are.
vec3 contrastCurve(vec3 c){
  float k = uContrast.x, p = uContrast.y;
  if (abs(k - 1.0) < 1e-4) return c;
  vec3 lo = p * pow(clamp(c / p, 0.0, 1.0), vec3(k));
  vec3 hi = 1.0 - (1.0 - p) * pow(clamp((1.0 - c) / (1.0 - p), 0.0, 1.0), vec3(k));
  vec3 r = mix(lo, hi, step(vec3(p), c));
  return mix(r, c, step(vec3(1.0), c));
}

void main(){
  vec4 culled = vec4(2.0, 2.0, 2.0, 1.0);
  vec4 clip = uViewProj * vec4(iPos, 1.0);
  float seed = iMisc.x;
  bool ground = iMisc.y < 0.0;    // the ground is never cut by render.near
  float wsize = abs(iMisc.y);
  if (clip.w <= (ground ? uStrokeNear.y : uStrokeNear.x) || iAlpha <= 0.002) { gl_Position = culled; return; }
  vec3 ndc = clip.xyz / clip.w;
  if (abs(ndc.x) > 1.15 || abs(ndc.y) > 1.15) { gl_Position = culled; return; }

  // ---- paint-in reveal (near to far from the start point, with randomization)
  float rk = distance(iPos, uReveal.xyz) + seed * uRevealParams.x;
  if (rk > uReveal.w) { gl_Position = culled; return; }
  float revealFade = clamp((uReveal.w - rk) / max(uRevealParams.y, 1e-3), 0.0, 1.0);

  // ---- occlusion: only test against the camera depth buffer
  vec2 suv = clamp(ndc.xy * 0.5 + 0.5, 0.0, 1.0);
  float sceneZ = linDepth(texture(uDepth, suv).r, uNearFar);
  if (clip.w > sceneZ + uDepthBias + uDepthBiasScale * clip.w) { gl_Position = culled; return; }

  // ---- lighting
  vec3 n = normalize(iNrm);
  float e = iMisc.z;
  if (e < 0.0) { e = -e * (0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * uTwinkle + seed * 61.0))); } // twinkling bulb
  // ambient has a direction: luminance over diffuse
  vec3 light = uAmbColor * (uAmbBase + uDiffuse * max(dot(n, uAmbDir), 0.0));
  // lantern: vertices hit by the main light get a luminance boost
  vec3 L = iPos - uLanternPos;
  float ld = length(L);
  vec3 Ld = L / max(ld, 1e-4);
  float cone = smoothstep(uLanternCone.x, uLanternCone.y, dot(Ld, uLanternDir));
  float att = 1.0 - smoothstep(0.0, uLanternRange, ld);
  att *= att;
  float k = cone * att;
  if (k > 0.002) {
    vec4 lc = uLightVP * vec4(iPos + n * uShadowNormalOffset, 1.0);
    vec2 luv = (lc.xy / lc.w) * 0.5 + 0.5;
    float lit = 0.0;
    if (lc.w > 0.0 && luv.x > 0.0 && luv.x < 1.0 && luv.y > 0.0 && luv.y < 1.0) {
      float sz = linDepth(texture(uShadow, luv).r, uLightNearFar);
      lit = lc.w <= sz + uShadowBias ? 1.0 : 0.0;
    }
    float facing = 0.35 + 0.65 * max(dot(n, -Ld), 0.0);
    light += uLanternColor * uLanternBoost * k * facing * lit;
  }
  // flash lights (magic explosions, projectile hits)
  for (int i = 0; i < MAX_FLASHES; i++) {
    if (uFlashPos[i].w <= 0.0) continue;
    float fd = distance(iPos, uFlashPos[i].xyz);
    light += uFlashCol[i].rgb * uFlashPos[i].w * (1.0 - smoothstep(0.0, uFlashCol[i].w, fd));
  }
  // proximity: the closer to the player, the more light
  float pd = distance(iPos, uPlayerPos);
  light += uProxColor * uProx.y * pow(1.0 - clamp(pd / max(uProx.x, 1e-3), 0.0, 1.0), uProx.z);

  vec3 col = iCol * light;
  col = mix(col, iCol, clamp(e, 0.0, 1.0)) + iCol * max(e - 1.0, 0.0);

  // ---- depth fog toward the background color
  float f = smoothstep(uFog.x, uFog.y, clip.w) * iMisc.w;
  col = mix(col, uFogColor, f);

  // ---- global contrast: darks darker, brights brighter (render.contrast)
  col = contrastCurve(col);

  // ---- size: perspective, plus further vertices render smaller strokes
  float px = wsize * uFocalPx / clip.w;
  px *= mix(1.0, uShrink.z, smoothstep(uShrink.x, uShrink.y, clip.w));
  px *= 1.0 + uShrink.w * (hash(seed * 91.7 + 3.1) - 0.5);
  px = clamp(px, uSize.x, uSize.y);
  float aspect = uSize.z * (1.0 + uSize.w * (hash(seed * 13.1 + 7.7) - 0.5));

  // ---- rotation on the screen plane, tied to the projected normal + seed
  vec3 nv = uViewRot * n;
  float na = atan(nv.y, nv.x) + 1.5707963;
  float ang = uRot.x * na + (hash(seed * 5.3 + 1.9) - 0.5) * 6.2831853 * uRot.y;
  float c = cos(ang), s = sin(ang);
  vec2 q = aCorner * vec2(px * aspect, px) * 0.5;
  vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  vec2 off = r * 2.0 / uViewport;
  gl_Position = vec4(clip.xy + off * clip.w, 0.0, clip.w);

  vUV = aCorner * 0.5 + 0.5;
  vColor = vec4(col, iAlpha * revealFade);
  vVariant = floor(hash(seed * 7.31 + 0.5) * uVariants);
}`;

export const strokeFS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vColor;
flat in float vVariant;
uniform sampler2D uBrush;
uniform float uVariants;
out vec4 o;
void main(){
  float a = texture(uBrush, vec2((vVariant + vUV.x) / uVariants, vUV.y)).a * vColor.a;
  if (a < 0.01) discard;
  o = vec4(vColor.rgb, a);
}`;
