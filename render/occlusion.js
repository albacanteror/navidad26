// Occlusion geometry: triangles are never shown, they are only rendered into
// (a) the camera depth buffer, used to test which vertices are visible, and
// (b) the lantern shadow map, used to test which vertices the lantern hits.

import { createProgram, createDepthTarget, deleteDepthTarget } from './gl.js';
import { depthVS, depthFS, debugFS } from './shaders.js';

/** A triangle buffer (positions + indices) in world space. */
class TriBuffer {
  constructor(gl, usage) {
    this.gl = gl;
    this.usage = usage;
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    this.ibo = gl.createBuffer();
    this.count = 0;
    this.vcap = 0;
    this.icap = 0;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bindVertexArray(null);
  }

  upload(pos, idx, vcount, icount) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    if (vcount * 3 > this.vcap) {
      this.vcap = Math.ceil(vcount * 3 * 1.3);
      gl.bufferData(gl.ARRAY_BUFFER, this.vcap * 4, this.usage);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos, 0, vcount * 3);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    if (icount > this.icap) {
      this.icap = Math.ceil(icount * 1.3);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.icap * 4, this.usage);
    }
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, idx, 0, icount);
    gl.bindVertexArray(null);
    this.count = icount;
  }

  draw() {
    if (this.count) this.drawRange(0, this.count);
  }

  /** Draw `count` indices starting at index `start`. */
  drawRange(start, count) {
    if (!count) return;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, start * 4);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteBuffer(this.vbo);
    gl.deleteBuffer(this.ibo);
    gl.deleteVertexArray(this.vao);
  }
}

export class Occlusion {
  constructor(gl, S) {
    this.gl = gl;
    this.S = S;
    this.prog = createProgram(gl, depthVS, depthFS);
    this.debugProg = createProgram(gl, depthVS, debugFS);
    this.static = new TriBuffer(gl, gl.STATIC_DRAW);
    this.terrain = new TriBuffer(gl, gl.STATIC_DRAW);     // the ground: may be clipped near the camera
    this.staticNear = new TriBuffer(gl, gl.STATIC_DRAW); // trees: a whole tree is skipped when near the camera
    this.nearSources = [];
    this.nearRanges = [];
    this.dynamic = new TriBuffer(gl, gl.DYNAMIC_DRAW);
    this.camTarget = null;
    this.shadow = createDepthTarget(gl, S.render.shadowMapSize, S.render.shadowMapSize);
    this.dynPos = new Float32Array(30000);
    this.dynIdx = new Uint32Array(60000);
  }

  resize(w, h) {
    const s = this.S.render.depthScale;
    const dw = Math.max(1, Math.round(w * s)), dh = Math.max(1, Math.round(h * s));
    if (this.camTarget && this.camTarget.w === dw && this.camTarget.h === dh) return;
    deleteDepthTarget(this.gl, this.camTarget);
    this.camTarget = createDepthTarget(this.gl, dw, dh);
  }

  /**
   * Static world triangles, merged from sources:
   *  - `isTerrain` sources: the ground buffer (never clipped, back faces kept);
   *  - `nearAnchor` sources (trees): their own buffer, drawn tree by tree: a
   *    tree hidden near the camera (source.nearHidden) does not occlude anything;
   *  - the rest (canes...).
   */
  setStatic(sources) {
    const ok = (s) => s.writesDepth && s.indices;
    this.uploadMerged(this.terrain, sources.filter((s) => ok(s) && s.isTerrain));
    this.uploadMerged(this.static, sources.filter((s) => ok(s) && !s.nearAnchor && !s.isTerrain));
    this.nearSources = sources.filter((s) => ok(s) && s.nearAnchor);
    this.nearRanges = this.uploadMerged(this.staticNear, this.nearSources);
  }

  /** Returns [{ source, start, count }] (index ranges, in upload order). */
  uploadMerged(buf, sources) {
    let nv = 0, ni = 0;
    for (const s of sources) { nv += s.n; ni += s.indices.length; }
    const pos = new Float32Array(Math.max(3, nv * 3));
    const idx = new Uint32Array(Math.max(3, ni));
    const ranges = [];
    let vo = 0, io = 0;
    for (const s of sources) {
      pos.set(s.pos, vo * 3);
      for (let i = 0; i < s.indices.length; i++) idx[io + i] = s.indices[i] + vo;
      ranges.push({ source: s, start: io, count: s.indices.length });
      vo += s.n;
      io += s.indices.length;
    }
    buf.upload(pos, idx, nv, ni);
    return ranges;
  }

  /** Draw the tree buffer, skipping trees hidden near the camera (merged into runs). */
  drawNear(skipHidden) {
    if (!skipHidden) { this.staticNear.draw(); return; }
    let runStart = -1, runCount = 0;
    for (const r of this.nearRanges) {
      if (r.source.nearHidden) {
        if (runCount) this.staticNear.drawRange(runStart, runCount);
        runCount = 0;
        continue;
      }
      if (!runCount) runStart = r.start;
      runCount += r.count;
    }
    if (runCount) this.staticNear.drawRange(runStart, runCount);
  }

  /** Dynamic triangles (characters, projectiles), merged every frame. */
  setDynamic(sources) {
    let nv = 0, ni = 0;
    for (const s of sources) if (s.visible && s.writesDepth && s.indices && s.alpha > 0.3) { nv += s.n; ni += s.indices.length; }
    if (nv * 3 > this.dynPos.length) this.dynPos = new Float32Array(Math.ceil(nv * 3 * 1.5));
    if (ni > this.dynIdx.length) this.dynIdx = new Uint32Array(Math.ceil(ni * 1.5));
    let vo = 0, io = 0;
    for (const s of sources) {
      if (!(s.visible && s.writesDepth && s.indices && s.alpha > 0.3)) continue;
      this.dynPos.set(s.pos, vo * 3);
      const I = s.indices;
      for (let i = 0; i < I.length; i++) this.dynIdx[io + i] = I[i] + vo;
      vo += s.n;
      io += I.length;
    }
    this.dynamic.upload(this.dynPos, this.dynIdx, nv, ni);
  }

  /** Back faces never occlude (meshes are counter-clockwise outward). */
  cullBack() {
    const gl = this.gl;
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
  }

  /**
   * camPass: true for the camera depth buffer: trees hidden near the camera do
   * not occlude, and everything but the ground closer than objectNear
   * (render.near: its strokes are cut there too) hides nothing.
   * THE GROUND is never clipped and keeps its back faces: it always blocks, so
   * the planet can never be seen from the inside. Every other mesh culls back
   * faces: from inside it, its far wall hides nothing.
   */
  renderDepth(target, viewProj, camPass = false, objectNear = 0) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.w, target.h);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog.program);
    gl.uniformMatrix4fv(this.prog.u.uViewProj, false, viewProj);
    gl.disable(gl.CULL_FACE);
    gl.uniform1f(this.prog.u.uClipNear, 0);
    this.terrain.draw();
    this.cullBack();
    gl.uniform1f(this.prog.u.uClipNear, camPass ? objectNear : 0);
    this.static.draw();
    this.dynamic.draw();
    this.drawNear(camPass);
    gl.disable(gl.CULL_FACE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Debug: draw the occlusion triangles on screen. */
  drawDebug(viewProj, w, h) {
    const gl = this.gl;
    gl.viewport(0, 0, w, h);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.debugProg.program);
    gl.uniformMatrix4fv(this.debugProg.u.uViewProj, false, viewProj);
    gl.uniform4f(this.debugProg.u.uColor, 1, 0.3, 0.6, 0.18);
    gl.disable(gl.CULL_FACE);
    this.terrain.draw();
    this.cullBack(); // shows exactly what occludes
    this.static.draw();
    this.drawNear(true);
    this.dynamic.draw();
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
  }
}
