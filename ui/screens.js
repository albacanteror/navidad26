// Welcome page, full-screen color overlay (white-out / game over), end text,
// the win calendar + Send, and retry. Buttons and hints are painted (ui/paint.js).

import { paintButton } from './paint.js';
import { Calendar } from './calendar.js';

export class Screens {
  constructor(S) {
    this.S = S;
    this.welcome = document.getElementById('welcome');
    this.overlay = document.getElementById('overlay');
    this.end = document.getElementById('endScreen');
    this.endTitle = document.getElementById('endTitle');
    this.endText = document.getElementById('endText');
    this.winLines = document.getElementById('winLines');
    this.retry = document.getElementById('retry');
    this.send = document.getElementById('send');
    this.buttons = document.getElementById('endButtons');
    this.welcome.style.background = S.colors.welcome;
    document.getElementById('title').textContent = S.text.title;
    document.getElementById('start').textContent = S.text.start;
    // touch screens (no mouse) get their own controls hint
    const touchOnly = window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
    document.getElementById('controlsHint').textContent = (touchOnly && S.text.controlsHintTouch) || S.text.controlsHint;
    this.retry.textContent = S.text.retry;
    this.send.textContent = S.text.send;
    this.lockHint = document.getElementById('lockHint');
    this.lockHint.textContent = S.text.clickToResume;
    this.overlayOpacity = 0;

    // painted backgrounds instead of clean CSS boxes. The dialog box and the
    // lock hint have NO background: the strokes behind them are skipped (uiHoles)
    for (const b of document.querySelectorAll('button')) paintButton(b, S);
    this.dialogEl = document.getElementById('dialog');

    this.calendar = new Calendar(S, document.getElementById('calendar'), () => this.updateSend());
    this.send.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.calendar.complete) return;
      const url = this.calendar.whatsappUrl();
      console.log('[send]', url);
      window.open(url, '_blank', 'noopener');
    });
  }

  onStart(cb) {
    document.getElementById('start').addEventListener('click', (e) => { e.stopPropagation(); cb(); });
  }

  hideWelcome() {
    const w = this.welcome;
    w.style.transition = `opacity ${this.S.timing.welcomeFadeSeconds}s ease-out`;
    w.style.opacity = 0;
    w.style.pointerEvents = 'none';
    setTimeout(() => w.classList.add('hidden'), this.S.timing.welcomeFadeSeconds * 1000);
  }

  setOverlay(color, opacity) {
    this.overlay.classList.toggle('hidden', opacity <= 0);
    this.overlay.style.background = color;
    this.overlay.style.opacity = opacity;
  }

  showEnd(title, text, onRetry, dark) {
    this.endTitle.textContent = title;
    this.endText.textContent = text;
    this.endTitle.classList.toggle('hidden', !title);
    this.endText.classList.toggle('hidden', !text);
    this.setWinParts(false);
    this.end.classList.toggle('dark', !!dark);
    this.end.classList.remove('hidden');
    this.retry.onclick = (e) => {
      e.stopPropagation(); onRetry();
      this.S.debug.godMode = true;
    };
  }

  /** Win screen: several lines of text, the calendar, then Retry + Send side by side. */
  showWin(points, onRetry, elapsedSeconds = 0) {
    this.showEnd('', '', onRetry, false);
    this.calendar.elapsedSeconds = elapsedSeconds;
    this.winLines.replaceChildren(...this.S.text.endingLines.map((line) => {
      const d = document.createElement('div');
      d.textContent = line.replace('{points}', points);
      return d;
    }));
    this.setWinParts(true);
    this.calendar.clear();
    this.calendar.show();
    this.buttons.style.width = this.calendar.canvas.style.width; // aligned with the calendar
  }

  setWinParts(v) {
    this.end.classList.toggle('win', v);
    if (!v) this.buttons.style.width = '';
    this.winLines.classList.toggle('hidden', !v);
    this.calendar.canvas.classList.toggle('hidden', !v);
    this.send.classList.toggle('hidden', !v);
    if (!v) this.calendar.hide();
    this.updateSend();
  }

  /** Send only works once every mark is placed. */
  updateSend() {
    const ok = this.calendar.complete;
    this.send.disabled = !ok;
    this.send.classList.toggle('disabled', !ok);
  }

  hideEnd() {
    this.end.classList.add('hidden');
    this.calendar.hide();
    this.setOverlay('#000', 0);
  }

  /**
   * Screen rectangles (NDC: -1..1, y up) where no stroke is painted: the area
   * behind the "click to return" text. The holes stay in place on screen, so
   * whatever strokes fall there are skipped.
   */
  uiHoles() {
    const holes = [];
    const pad = this.S.ui.holePadding;
    const W = window.innerWidth, H = window.innerHeight;
    for (const el of [this.lockHint]) {
      if (!el || el.classList.contains('hidden')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1) continue;
      holes.push([
        ((r.left - pad) / W) * 2 - 1,
        1 - ((r.bottom + pad) / H) * 2,
        ((r.right + pad) / W) * 2 - 1,
        1 - ((r.top - pad) / H) * 2,
      ]);
    }
    return holes;
  }

  /** "Click to return to the game" after Esc released the mouse. */
  showLockHint(v) {
    if (this._lockHint === v) return;
    this._lockHint = v;
    this.lockHint.classList.toggle('hidden', !v);
  }
}
