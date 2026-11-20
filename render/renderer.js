// Frame orchestration:
//   1. occlusion triangles -> camera depth buffer
//   2. occlusion triangles -> lantern shadow map
//   3. gather + sort strokes (CPU), then draw them far to near (GPU)

import { createContext } from './gl.js';
import { StrokeRenderer, updateNearHidden, GROUND_NEAR } from './strokes.js';
import { Occlusion } from './occlusion.js';
import { makeBrushAtlas } from './brush.js';
import { perspective, lookAt, multiply, normalize, sub, cross, add, DEG, hexToRgb } from '../core/math.js';

/** Same tone curve as contrastCurve() in the stroke shader (for the background). */
function contrastRgb(c, kd, kl, p) {
  if (Math.abs(kd - 1) < 1e-4 && Math.abs(kl - 1) < 1e-4) return c;
  return c.map((v) => {
    if (v >= 1) return v;
    if (v < p) return p * Math.pow(Math.max(0, v / p), kd);
    return 1 - (1 - p) * Math.pow(Math.max(0, (1 - v) / (1 - p)), kl);
  });
}


export class Renderer {
  constructor(canvas, S) {
    this.canvas = canvas;
    this.S = S;
    this.gl = createContext(canvas);
    const gl = this.gl;
    this.strokes = new StrokeRenderer(gl, S);
    this.occlusion = new Occlusion(gl, S);

    const R = S.render;
    const atlas = makeBrushAtlas(R.brushVariants, R.brushResolution[0], R.brushResolution[1]);
    this.brush = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.brush);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.dpr = 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.stats = { strokes: 0, candidates: 0 };
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, this.S.render.pixelRatioMax);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * this.dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.occlusion.resize(w, h);
  }

  setStatic(sources) {
    this.occlusion.setStatic(sources);
  }

  clear(rgb) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(rgb[0], rgb[1], rgb[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  /**
   * f = { sources, dynamicSources, camera:{pos,target,up}, lantern:{pos,dir,up,boost},
   *       background:[r,g,b], reveal:{origin,radius}, flashes:[{pos,color,strength,radius}],
   *       playerPos, time }
   */
  render(f) {
    const gl = this.gl;
    const S = this.S, R = S.render, L = S.lighting;
    this.resize();
    const w = this.canvas.width, h = this.canvas.height;

    // ---- camera
    const aspect = w / h;
    const fov = R.fovY * DEG;
    // the projection uses the ground's tiny near: render.near is applied per
    // stroke / per occluder instead (the ground is never cut by it)
    const proj = perspective(fov, aspect, GROUND_NEAR, R.far);
    const view = lookAt(f.camera.pos, f.camera.target, f.camera.up);
    const viewProj = multiply(proj, view);
    const fwd = normalize(sub(f.camera.target, f.camera.pos));
    const right = normalize(cross(fwd, f.camera.up));
    const up = cross(right, fwd);
    const tanY = Math.tan(fov / 2);

    // ---- trees near / behind / around the camera are hidden whole (strokes + occlusion).
    // nearReach = distance to the near plane's corners: a tree that close would be
    // cut open by it, so it is hidden whole instead
    const nearReach = R.near * Math.sqrt(1 + tanY * tanY * (1 + aspect * aspect));
    this.stats.treesHidden = updateNearHidden(this.occlusion.nearSources, f.camera.pos, fwd, nearReach);

    // ---- occlusion: camera depth (back faces never occlude, except the ground's;
    // everything but the ground closer than render.near hides nothing)
    this.occlusion.setDynamic(f.dynamicSources);
    this.occlusion.renderDepth(this.occlusion.camTarget, viewProj, true, R.near);

    // ---- lantern shadow map
    const lp = f.lantern.pos, ld = f.lantern.dir;
    const lightNear = 0.15, lightFar = L.lightRange;
    const lightProj = perspective((L.lightConeOuter * 2 + 8) * DEG, 1, lightNear, lightFar);
    const lightView = lookAt(lp, add(lp, ld), f.lantern.up);
    const lightVP = multiply(lightProj, lightView);
    this.occlusion.renderDepth(this.occlusion.shadow, lightVP);

    // ---- gather strokes
    this.strokes.gather(f.sources, { pos: f.camera.pos, fwd, right, up, tanX: tanY * aspect, tanY, near: R.near, far: R.far, holes: f.holes, arc: f.arcHole });
    this.stats.strokes = this.strokes.count;
    this.stats.candidates = this.strokes.candidates;

    // ---- draw
    this.clear(contrastRgb(f.background, R.darkBalance ?? 1, R.lightBalance ?? 1, R.contrastPivot ?? 0.5));
    if (S.debug.showOcclusionGeometry) this.occlusion.drawDebug(viewProj, w, h);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const amb = normalize(L.ambientDirection);
    const dpr = this.dpr;
    const lc = hexToRgb(L.lightColor);
    const ac = hexToRgb(L.ambientColor);
    const pc = hexToRgb(L.proximityColor);
    this.strokes.draw((u) => {
      gl.uniformMatrix4fv(u.uViewProj, false, viewProj);
      gl.uniformMatrix3fv(u.uViewRot, false, new Float32Array([view[0], view[1], view[2], view[4], view[5], view[6], view[8], view[9], view[10]]));
      gl.uniform2f(u.uViewport, w, h);
      gl.uniform1f(u.uFocalPx, h / 2 / tanY);
      gl.uniform2f(u.uNearFar, GROUND_NEAR, R.far);
      gl.uniform2f(u.uStrokeNear, R.near, GROUND_NEAR);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.occlusion.camTarget.tex);
      gl.uniform1i(u.uDepth, 0);
      gl.uniform1f(u.uDepthBias, R.depthBias);
      gl.uniform1f(u.uDepthBiasScale, R.depthBiasScale);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.occlusion.shadow.tex);
      gl.uniform1i(u.uShadow, 1);
      gl.uniformMatrix4fv(u.uLightVP, false, lightVP);
      gl.uniform2f(u.uLightNearFar, lightNear, lightFar);
      gl.uniform1f(u.uShadowBias, R.shadowBias);
      gl.uniform1f(u.uShadowNormalOffset, R.shadowNormalOffset);
      gl.uniform3fv(u.uLanternPos, lp);
      gl.uniform3fv(u.uLanternDir, ld);
      gl.uniform2f(u.uLanternCone, Math.cos(L.lightConeOuter * DEG), Math.cos(L.lightConeInner * DEG));
      gl.uniform1f(u.uLanternRange, L.lightRange);
      gl.uniform3fv(u.uLanternColor, lc);
      gl.uniform1f(u.uLanternBoost, f.lantern.boost);

      gl.uniform3fv(u.uAmbDir, amb);
      gl.uniform3fv(u.uAmbColor, ac);
      gl.uniform1f(u.uAmbBase, L.ambientBase);
      gl.uniform1f(u.uDiffuse, L.diffuse);

      gl.uniform3fv(u.uFogColor, f.background);
      gl.uniform3f(u.uContrast, R.darkBalance ?? 1, R.lightBalance ?? 1, R.contrastPivot ?? 0.5);
      gl.uniform2f(u.uFog, R.fogNear, R.fogFar);

      gl.uniform4f(u.uSize, R.strokeMinPx * dpr, R.strokeMaxPx * dpr, R.strokeAspect, R.strokeAspectJitter);
      gl.uniform4f(u.uShrink, R.shrinkNear, R.shrinkFar, R.shrinkFarScale, R.strokeScaleJitter);
      gl.uniform2f(u.uRot, R.rotationNormalWeight, R.rotationRandom);

      gl.uniform4f(u.uReveal, f.reveal.origin[0], f.reveal.origin[1], f.reveal.origin[2], f.reveal.radius);
      gl.uniform2f(u.uRevealParams, S.timing.paintInJitter, S.timing.paintInEdgeSoftness);

      // keep the most relevant point lights: strong, wide and close to the player
      const MAX = Math.max(1, R.maxPointLights | 0);
      const fp = new Float32Array(MAX * 4), fcr = new Float32Array(MAX * 4);
      const pp = f.playerPos;
      const score = (x) => (x.strength * x.radius) / (1 + Math.hypot(x.pos[0] - pp[0], x.pos[1] - pp[1], x.pos[2] - pp[2]));
      const fl = f.flashes.filter((x) => x.strength > 0).sort((a, b) => score(b) - score(a)).slice(0, MAX);
      fl.forEach((x, i) => {
        fp.set([x.pos[0], x.pos[1], x.pos[2], x.strength], i * 4);
        fcr.set([x.color[0], x.color[1], x.color[2], x.radius], i * 4);
      });
      gl.uniform4fv(u.uFlashPos, fp);
      gl.uniform4fv(u.uFlashCol, fcr);

      gl.uniform3fv(u.uPlayerPos, f.playerPos);
      gl.uniform3fv(u.uProxColor, pc);
      gl.uniform3f(u.uProx, L.proximityRadius, L.proximityBoost, L.proximityFalloff);

      gl.uniform1f(u.uTime, f.time);
      gl.uniform1f(u.uTwinkle, L.twinkleSpeed);
      gl.uniform1f(u.uVariants, R.brushVariants);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.brush);
      gl.uniform1i(u.uBrush, 2);
    });
    gl.depthMask(true);
  }
}
