// Life and spirit (points) bars: two thin full-width rectangles at the bottom
// of the screen, spirit on top of life. No labels. Sizes in settings.hud.

export class Hud {
  constructor(S) {
    this.S = S;
    const H = S.hud;
    this.el = document.getElementById('hud');
    this.lifeFill = document.getElementById('lifeFill');
    this.pointsFill = document.getElementById('pointsFill');
    Object.assign(this.el.style, {
      left: `${H.sideMargin}px`,
      right: `${H.sideMargin}px`,
      bottom: `${H.bottomMargin}px`,
      gap: `${H.barGap}px`,
    });
    for (const t of this.el.querySelectorAll('.track')) {
      t.style.background = H.barBackground;
      t.style.height = `${H.barThickness}px`;
    }
    this.lifeFill.style.background = H.lifeColor;
    this.pointsFill.style.background = H.pointsColor;
    for (const f of [this.lifeFill, this.pointsFill]) {
      f.style.transition = `width ${H.easeSeconds}s cubic-bezier(0.33, 1, 0.68, 1)`; // ease-out cubic
    }
    this.last = '';
  }

  show(v) { this.el.classList.toggle('hidden', !v); }

  update(life, maxLife, points) {
    const key = `${life.toFixed(2)}|${points}`;
    if (key === this.last) return;
    this.last = key;
    this.lifeFill.style.width = `${Math.max(0, Math.min(1, life / maxLife)) * 100}%`;
    this.pointsFill.style.width = `${Math.min(1, points / this.S.hud.pointsBarMax) * 100}%`;
  }
}
