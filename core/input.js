// Keyboard + mouse input.
// W / left click = forward, S / right click = backward, A / D = strafe.
// The camera ("the eye") orbits with a CURSOR POSITION: mouseX / mouseY,
// normalized 0..1 over the window.
//
// During the game the pointer is LOCKED (settings.camera.lockPointer): the real
// mouse cannot leave the browser window, and mouse movement drives a virtual
// cursor: mouseX is unbounded (endless orbit), mouseY stays in 0..1.
// Esc releases the lock (the browser does this);
// clicking the game locks it again (that click does not move the player).
//
// One-frame events read by the dialog: 'Click' (left click, tap) and 'Back'
// (right click, Backspace, long press on touch screens).
// TOUCH SCREENS: there is no pointer lock. Holding a finger = holding the left
// button (walk forward), or the right one if it started in the lower
// camera.touchBackZone of the screen (walk backward); moving it orbits the
// camera. A tap = 'Click', holding still for dialog.longPressMs = 'Back'.

export class Input {
  constructor(canvas, S) {
    this.canvas = canvas;
    this.C = S.camera;
    this.longPressMs = (S.dialog && S.dialog.longPressMs) || 450;
    // phones / tablets: no pointer lock (and no mouse)
    const mq = (q) => window.matchMedia && window.matchMedia(q).matches;
    this.touchOnly = mq('(pointer: coarse)') && !mq('(any-pointer: fine)');
    this.lastTouch = -1e9;
    this.touch = null;
    this.keys = new Set();
    this.mouseLeft = false;
    this.mouseRight = false;
    this.mouseX = 0.5;
    this.mouseY = 0.5;
    this.pressed = new Set(); // one-frame "just pressed" events: 'Space', 'Click', key codes
    this.enabled = false;
    this.wantLock = false;    // the game wants the pointer locked (during play)
    this.locked = false;      // the pointer is locked right now

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.mouseLeft = this.mouseRight = false;
    });
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Backspace') this.pressed.add('Back');
      if (e.code === 'Space' || e.code.startsWith('Arrow') || (e.code === 'Backspace' && this.enabled)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseLeft = this.mouseRight = false;
    });
    window.addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });
    window.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (performance.now() - this.lastTouch < 800) return; // mouse events copied from a touch
      // a click while the lock was released (Esc) only takes the pointer back
      if (this.usesLock && !this.locked) {
        if (e.target === this.canvas || e.target.id === 'lockHint') this.lock();
        return;
      }
      if (e.button === 0) { this.mouseLeft = true; this.pressed.add('Click'); }
      if (e.button === 2) { this.mouseRight = true; this.pressed.add('Back'); }
    });

    // ---- touch (one finger; buttons / calendar keep their own taps)
    //  - holding the finger down = holding the left mouse button (walk forward);
    //    if it STARTED in the lower camera.touchBackZone of the screen = holding
    //    the right button (walk backward)
    //  - moving it orbits the camera (like the captured mouse); both work at once
    //  - dialogs: a tap (short, finger still) = next page, anywhere on the screen;
    //    holding still for dialog.longPressMs = one page back
    const onUi = (e) => e.target && e.target.closest && e.target.closest('button, #calendar');
    const findOwn = (list) => {
      if (!this.touch) return null;
      for (const t of list) if (t.identifier === this.touch.id) return t;
      return null;
    };
    const endTouch = (tap) => {
      clearTimeout(this.touchTimer);
      const T = this.touch;
      if (!T) return;
      if (T.back) this.mouseRight = false; else this.mouseLeft = false;
      if (tap && !T.long && !T.moved) this.pressed.add('Click');
      this.touch = null;
    };
    window.addEventListener('touchstart', (e) => {
      this.lastTouch = performance.now();
      if (this.touch || !this.enabled || onUi(e)) return; // extra fingers are ignored
      const t = e.changedTouches[0];
      const back = t.clientY > window.innerHeight * (1 - (this.C.touchBackZone ?? 0.27));
      this.touch = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, back, long: false, moved: false };
      if (back) this.mouseRight = true; else this.mouseLeft = true;
      this.touchTimer = setTimeout(() => {
        if (this.touch && !this.touch.moved) { this.touch.long = true; this.pressed.add('Back'); }
      }, this.longPressMs);
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      const T = this.touch, t = findOwn(e.changedTouches);
      if (!T || !t) return;
      // orbit: relative movement, like the captured mouse (X unbounded, Y in 0..1)
      const k = this.C.touchSpeed ?? 1;
      this.mouseX += ((t.clientX - T.x) * k) / Math.max(1, window.innerWidth);
      this.mouseY = clamp01(this.mouseY + ((t.clientY - T.y) * k) / Math.max(1, window.innerHeight));
      T.x = t.clientX; T.y = t.clientY;
      if (!T.moved && Math.hypot(t.clientX - T.x0, t.clientY - T.y0) > 12) { T.moved = true; clearTimeout(this.touchTimer); }
    }, { passive: true });
    window.addEventListener('touchend', (e) => {
      this.lastTouch = performance.now();
      if (findOwn(e.changedTouches)) endTouch(true);
    }, { passive: true });
    window.addEventListener('touchcancel', (e) => { if (findOwn(e.changedTouches)) endTouch(false); }, { passive: true });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseLeft = false;
      if (e.button === 2) this.mouseRight = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (performance.now() - this.lastTouch < 800) return; // copied from a touch: no camera jump
      if (this.locked) {
        // virtual cursor: relative movement. X is NOT clamped, so the camera can
        // keep orbiting in the same direction forever; Y stays within the window.
        const k = this.C.cursorSpeed;
        this.mouseX += (e.movementX * k) / Math.max(1, window.innerWidth);
        this.mouseY = clamp01(this.mouseY + (e.movementY * k) / Math.max(1, window.innerHeight));
      } else if (!this.usesLock) {
        this.mouseX = clamp01(e.clientX / Math.max(1, window.innerWidth));
        this.mouseY = clamp01(e.clientY / Math.max(1, window.innerHeight));
      }
      // lock wanted but released (Esc): the camera holds still until the next click
    });
  }

  /** True while the game wants the pointer locked (and the setting is on). */
  get usesLock() { return this.wantLock && this.C.lockPointer && !this.touchOnly; }

  /** Ask for the pointer lock. Must be called from a click / key handler. */
  requestLock() {
    this.wantLock = true;
    this.lock();
  }

  lock() {
    if (!this.C.lockPointer || this.locked || this.touchOnly) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {}); // e.g. re-locking too soon after Esc: just click again
    } catch (err) { /* not supported: absolute cursor mode keeps working */ }
  }

  /** Give the pointer back (end screens). */
  releaseLock() {
    this.wantLock = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }

  get forward() { return this.down('KeyW') || this.down('ArrowUp') || this.mouseLeft; }
  get backward() { return this.down('KeyS') || this.down('ArrowDown') || this.mouseRight; }
  get left() { return this.down('KeyA') || this.down('ArrowLeft'); }
  get right() { return this.down('KeyD') || this.down('ArrowRight'); }

  /** Call at the end of every frame. */
  endFrame() {
    this.pressed.clear();
  }
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
