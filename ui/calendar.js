// Win screen calendar (settings.calendar): a painted month where only a few
// days can be clicked. Each click circles the day with the next hand-drawn
// spiral (settings.calendar.marks); clicking a marked day erases every mark.
// Text is Georgia, everything else is brush dabs (ui/paint.js).

import { paintRect, paintPath, dab, roundFeather } from './paint.js';
import { makeRng } from '../core/rng.js';

export class Calendar {
  constructor(S, canvas, onChange) {
    this.S = S;
    this.C = S.calendar;
    this.canvas = canvas;
    this.onChange = onChange;
    this.marks = []; // { day, index, t, seed }
    this.base = null;
    this.raf = 0;
    this.layout();
    canvas.addEventListener('click', (e) => { e.stopPropagation(); this.click(e); });
    canvas.addEventListener('mousemove', (e) => {
      const d = this.dayAt(e);
      canvas.style.cursor = d && this.C.selectableDays.includes(d) ? 'pointer' : 'default';
    });
    window.addEventListener('resize', () => { if (this.visible) { this.layout(); this.draw(); } });
  }

  /** The chosen days in click order: [first, second, third]. */
  get days() { return this.marks.map((m) => m.day); }
  get complete() { return this.marks.length >= this.C.marks.length; }

  show() {
    this.visible = true;
    this.layout();
    this.draw();
  }

  hide() { this.visible = false; }

  clear() {
    this.marks = [];
    this.draw();
    if (this.onChange) this.onChange(this);
  }

  // ------------------------------------------------------------------ layout
  layout() {
    const C = this.C;
    const W = Math.max(200, Math.min(C.width, window.innerWidth * C.maxWidthFraction));
    const cell = W / 7.7;
    const pad = cell * 0.35;
    const first = new Date(C.year, C.month - 1, 1).getDay();
    const offset = (first - C.firstWeekday + 7) % 7;
    const daysIn = new Date(C.year, C.month, 0).getDate();
    const rows = Math.ceil((offset + daysIn) / 7);
    const titleH = cell * (C.bandHeight ?? 0.95), headH = cell * 0.75;
    const H = pad + titleH + headH + rows * cell + pad;
    Object.assign(this, { W, H, cell, pad, offset, daysIn, rows, titleH, headH });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.ceil(W * dpr);
    this.canvas.height = Math.ceil(H * dpr);
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    this.base = null; // repaint the paper, title and numbers
  }

  /** Center of a day's cell, in CSS px. */
  cellCenter(day) {
    const i = this.offset + day - 1;
    const col = i % 7, row = Math.floor(i / 7);
    return [this.pad + (col + 0.5) * this.cell, this.pad + this.titleH + this.headH + (row + 0.5) * this.cell];
  }

  dayAt(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * this.W - this.pad;
    const y = ((e.clientY - r.top) / r.height) * this.H - this.pad - this.titleH - this.headH;
    if (x < 0 || y < 0 || x >= 7 * this.cell) return 0;
    const col = Math.floor(x / this.cell), row = Math.floor(y / this.cell);
    const day = row * 7 + col - this.offset + 1;
    return day >= 1 && day <= this.daysIn ? day : 0;
  }

  // ------------------------------------------------------------------ input
  click(e) {
    const day = this.dayAt(e);
    if (!day || !this.C.selectableDays.includes(day)) return;
    if (this.marks.some((m) => m.day === day)) {
      this.clear(); // clicking a marked day erases every mark
      return;
    }
    this.mark(day);
  }

  /** Mark a day with the next spiral (also usable from the console). */
  mark(day) {
    if (this.complete || this.marks.some((m) => m.day === day)) return;
    this.marks.push({ day, index: this.marks.length, t: 0, seed: (Math.random() * 1e9) | 0 });
    if (this.onChange) this.onChange(this);
    this.animate();
  }

  animate() {
    if (this.raf) return;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let busy = false;
      for (const m of this.marks) {
        m.t += dt;
        if (m.t < this.duration(m) + 0.05) busy = true;
      }
      this.draw();
      this.raf = busy && this.visible ? requestAnimationFrame(step) : 0;
    };
    this.raf = requestAnimationFrame(step);
  }

  duration(m) {
    const spec = this.C.marks[m.index];
    return spec.turns * this.C.drawSecondsPerTurn + (spec.rays ? 0.35 : 0);
  }

  // ------------------------------------------------------------------ drawing
  paintBase() {
    const C = this.C, S = this.S;
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const ctx = c.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    const P = { ...S.ui.paint, ...(S.ui.calendarPaint || {}) };
    paintRect(ctx, 0, 0, this.W, this.H, C.panelColor, 777, P);
    // top band behind the month name, in its own color
    const bandH = this.pad + this.titleH;
    paintRect(ctx, 0, 0, this.W, bandH, C.bandColor, 778, { ...P, edgeRoughness: 0.3 });

    const cell = this.cell;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // month title on the band
    const name = C.monthNames[C.month - 1];
    const title = C.titleFormat
      .replace('{Month}', name.charAt(0).toUpperCase() + name.slice(1))
      .replace('{month}', name)
      .replace('{year}', C.year);
    ctx.fillStyle = C.monthColor;
    ctx.font = `italic ${Math.round(cell * 0.46)}px Georgia, 'Times New Roman', serif`;
    ctx.fillText(title, this.W / 2, bandH * 0.53);
    // weekday letters
    ctx.fillStyle = C.inkColor;
    ctx.font = `${Math.round(cell * 0.3)}px Georgia, 'Times New Roman', serif`;
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 7; i++) {
      const letter = C.weekdayLetters[(i + C.firstWeekday) % 7];
      ctx.fillText(letter, this.pad + (i + 0.5) * cell, this.pad + this.titleH + this.headH * 0.45);
    }
    // painted dabs behind the clickable days
    const rng = makeRng(99);
    for (const d of C.selectableDays) {
      if (d < 1 || d > this.daysIn) continue;
      const [x, y] = this.cellCenter(d);
      for (let k = 0; k < 3; k++) {
        dab(ctx, C.selectableColor, x + (rng() - 0.5) * cell * 0.12, y + (rng() - 0.5) * cell * 0.15,
          cell * (0.62 + rng() * 0.2), (rng() - 0.5) * 0.5, rng, 0.9, 0.5);
      }
    }
    // day numbers
    ctx.font = `${Math.round(cell * 0.36)}px Georgia, 'Times New Roman', serif`;
    for (let d = 1; d <= this.daysIn; d++) {
      const [x, y] = this.cellCenter(d);
      ctx.globalAlpha = C.selectableDays.includes(d) ? 1 : C.dimmedAlpha;
      ctx.fillText(String(d), x, y + cell * 0.02);
    }
    ctx.globalAlpha = 1;
    roundFeather(c, C.cornerRadius, C.feather, this.dpr); // rounded, soft-edged paper
    this.base = c;
  }

  draw() {
    if (!this.base) this.paintBase();
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const m of this.marks) this.drawMark(ctx, m);
  }

  drawMark(ctx, m) {
    const C = this.C, spec = C.marks[m.index];
    const cell = this.cell;
    const [cx, cy] = this.cellCenter(m.day);
    const spiralT = spec.turns * C.drawSecondsPerTurn;
    const progress = Math.min(1, m.t / Math.max(0.01, spiralT));
    const P = { ...this.S.ui.paint, opacity: 0.85 };

    // the slow wobble is shared by every pass, the tremor is per pass
    const shape = makeRng(m.seed);
    const a0 = shape() * Math.PI * 2;
    const dir = shape() < 0.5 ? 1 : -1;
    const waves = [0.6, 1.4, 2.6].map((f) => [f * (0.8 + shape() * 0.4), shape() * Math.PI * 2, 0.4 + shape() * 0.6]);
    const drift = [(shape() - 0.5) * 0.04 * cell, (shape() - 0.5) * 0.04 * cell];
    const total = spec.turns * Math.PI * 2;
    let rEnd = 0;
    for (let pass = 0; pass < C.markPasses; pass++) {
      const rng = makeRng(m.seed + 17 * (pass + 1));
      const pts = [];
      const n = Math.max(12, Math.ceil(spec.turns * 64));
      const passShift = (rng() - 0.5) * 0.04 * cell;
      for (let i = 0; i <= n; i++) {
        const th = (total * i) / n;
        const turn = th / (Math.PI * 2);
        let wob = 0;
        for (const [f, ph, amp] of waves) wob += Math.sin(th * f + ph) * amp;
        const r = cell * (C.spiralStartRadius + C.spiralGrowth * turn) + cell * C.spiralJitter * wob / 1.5 + passShift
          + (rng() - 0.5) * C.spiralNoise * 2;
        const ang = a0 + dir * th;
        pts.push([cx + drift[0] * turn + Math.cos(ang) * r, cy + drift[1] * turn + Math.sin(ang) * r * C.spiralSquash]);
        rEnd = Math.max(rEnd, r);
      }
      paintPath(ctx, pts, C.markColor, C.markWidth * (pass === 0 ? 1 : 0.75), rng, P, progress);
    }

    // little rays around the last spiral
    if (spec.rays && m.t > spiralT) {
      const k = Math.min(1, (m.t - spiralT) / 0.35);
      const rng = makeRng(m.seed + 999);
      const shown = Math.ceil(spec.rays * k);
      for (let i = 0; i < shown; i++) {
        const ang = a0 + (i / spec.rays) * Math.PI * 2 + (rng() - 0.5) * 0.35;
        const r0 = rEnd + cell * C.rayGap * (0.8 + rng() * 0.4);
        const len = cell * (C.rayLength[0] + rng() * (C.rayLength[1] - C.rayLength[0]));
        const bend = (rng() - 0.5) * 0.25;
        const pts = [];
        for (let j = 0; j <= 4; j++) {
          const t = j / 4;
          const a = ang + bend * t * t;
          const rr = r0 + len * t;
          pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * C.spiralSquash]);
        }
        paintPath(ctx, pts, C.markColor, C.markWidth, rng, P, 1);
      }
    }
  }

  // ------------------------------------------------------------------ message
  formatDate(day) {
    const C = this.C;
    const wd = new Date(C.year, C.month - 1, day).getDay();
    return C.dateFormat
      .replace('{weekday}', C.weekdayNames[wd])
      .replace('{day}', day)
      .replace('{month}', C.monthNames[C.month - 1])
      .replace('{year}', C.year);
  }

  message() {
    const names = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
    let text = this.C.messageTemplate;
    this.days.forEach((d, i) => { text = text.split(`{${names[i]} date}`).join(this.formatDate(d)); });
    return text.split('{elapsedTime}').join(this.formatElapsed(this.elapsedSeconds || 0));
  }

  /** e.g. "1 hora, 4 minutos y 12 segundos" (zero units left out). */
  formatElapsed(seconds) {
    const C = this.C;
    const U = C.elapsedUnits || { hour: ['hora', 'horas'], minute: ['minuto', 'minutos'], second: ['segundo', 'segundos'] };
    const [sep, last] = C.elapsedJoin || [', ', ' y '];
    const t = Math.max(0, Math.round(seconds));
    const parts = [[Math.floor(t / 3600), U.hour], [Math.floor((t % 3600) / 60), U.minute], [t % 60, U.second]]
      .filter(([v]) => v > 0)
      .map(([v, names]) => `${v} ${v === 1 ? names[0] : names[1]}`);
    if (!parts.length) return `0 ${U.second[1]}`;
    return parts.length === 1 ? parts[0] : parts.slice(0, -1).join(sep) + last + parts[parts.length - 1];
  }

  whatsappUrl() {
    const number = String(this.C.whatsappNumber || '').replace(/\D/g, '');
    return this.C.whatsappUrl
      .replace('{number}', number)
      .replace('{text}', encodeURIComponent(this.message()));
  }
}
