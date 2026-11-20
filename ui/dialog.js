// Dialog box with a typewriter effect. Click / tap / Space completes the current
// page, then advances to the next one. After the last page, onClose runs.
// Right click / Backspace / long press goes back one page (down to the first).

/**
 * Height at the middle (px) of the circular arc through the screen's bottom
 * corners (-hw, 0), (hw, 0) that passes through the point (a, t).
 */
function arcThrough(hw, a, t) {
  const c = (hw * hw - a * a - t * t) / (2 * t); // circle center, this far below the bottom edge
  return Math.sqrt(hw * hw + c * c) - c;
}

export class Dialog {
  constructor(S) {
    this.S = S;
    this.el = document.getElementById('dialog');
    this.nameEl = document.getElementById('dialogName');
    this.textEl = document.getElementById('dialogText');
    this.hintEl = document.getElementById('dialogHint');
    // no background: no strokes are painted below an arc (Screens.dialogArc)
    this.el.style.color = S.dialog.textColor;
    if (S.dialog.textBottom != null) this.el.style.bottom = S.dialog.textBottom;
    this.nameEl.style.color = S.dialog.nameColor;
    this.hintEl.textContent = S.text.dialogHint;
    this.active = false;
  }

  open(name, pages, onClose) {
    this.active = true;
    this.pages = pages;
    this.page = 0;
    this.chars = 0;
    this.fitKey = null; // new text: measure the box again (arc)
    this.onClose = onClose;
    this.nameEl.textContent = name;
    this.textEl.textContent = '';
    this.el.classList.remove('hidden');
    this.grace = 0.25; // ignore input for a moment so a held click does not skip text
  }

  close() {
    this.active = false;
    this.el.classList.add('hidden');
    const cb = this.onClose;
    this.onClose = null;
    if (cb) cb();
  }

  /**
   * While open: no stroke is painted below a circular arc that goes through the
   * two bottom corners of the screen. The arc is only as high as the text box
   * needs (its top corners + arcMargin), so on big screens it is relatively
   * lower; it never rises above dialog.arcHeight x screen height (the box gets
   * narrower and taller instead). Returns null when closed.
   */
  arc() {
    const D = this.S.dialog;
    if (!this.active || !(D.arcHeight > 0)) return null;
    const W = window.innerWidth, H = window.innerHeight;
    const hw = W / 2, h = this.fit(W, H);
    const R = (hw * hw + h * h) / (2 * h); // circle through (-hw, 0), (hw, 0) and (0, h)
    return { hw, hh: H / 2, h, R, jitter: D.arcEdgeJitter || 0 };
  }

  /**
   * Choose the box width and the arc height, measured with the whole page
   * text: the widest box (maxWidth .. minWidth) whose arc stays within
   * arcHeight x screen height. Once per page / window size. Returns the arc
   * height in px.
   */
  fit(W, H) {
    const D = this.S.dialog, el = this.el;
    const key = `${this.page}|${W}x${H}|${D.arcHeight}|${D.arcMargin}`;
    if (key === this.fitKey) return this.arcH;
    this.fitKey = key;
    const shown = this.textEl.textContent;
    this.textEl.textContent = this.pages[this.page];
    const hw = W / 2, m = D.arcMargin || 0, maxH = D.arcHeight * H;
    const maxW = Math.max(100, Math.min(D.maxWidth || 640, W - 32));
    const minW = Math.min(maxW, D.minWidth || 260);
    let best = null, bestW = maxW, bestH = Infinity;
    for (let w = maxW; w >= minW; w -= 10) {
      el.style.width = `${w}px`;
      const h = arcThrough(hw, w / 2 + m, H - el.getBoundingClientRect().top + m);
      if (h <= maxH) { best = w; bestH = h; break; }
      if (h < bestH) { bestH = h; bestW = w; } // nothing fits: the lowest arc
    }
    el.style.width = `${best ?? bestW}px`;
    this.textEl.textContent = shown;
    this.arcH = bestH;
    return bestH;
  }

  update(dt, input) {
    if (!this.active) return;
    const text = this.pages[this.page];
    this.chars = Math.min(text.length, this.chars + this.S.dialog.charsPerSecond * dt);
    this.textEl.textContent = text.slice(0, Math.floor(this.chars));
    this.hintEl.style.opacity = this.chars >= text.length ? 1 : 0.3;
    if (this.grace > 0) { this.grace -= dt; return; }
    // right click / Backspace / long press: one page back (stops at the first
    // page; the dialog only closes by reaching its end)
    if (input.wasPressed('Back')) {
      if (this.page > 0) {
        this.page--;
        this.chars = this.pages[this.page].length; // already read: shown whole
      }
      return;
    }
    if (input.wasPressed('Space') || input.wasPressed('Click') || input.wasPressed('Enter')) {
      if (this.chars < text.length) {
        this.chars = text.length;
      } else if (this.page < this.pages.length - 1) {
        this.page++;
        this.chars = 0;
      } else {
        this.close();
      }
    }
  }
}
