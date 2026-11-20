// Boot: renderer, audio, input, UI, game loop, welcome / retry flow.

import S from './settings.js';
import { Renderer } from './render/renderer.js';
import { AudioSystem } from './core/audio.js';
import { Input } from './core/input.js';
import { Hud } from './ui/hud.js';
import { Dialog } from './ui/dialog.js';
import { Screens } from './ui/screens.js';
import { Game } from './game.js';
import { randomSeed } from './core/rng.js';
import { hexToRgb } from './core/math.js';

const canvas = document.getElementById('game');
const statsEl = document.getElementById('stats');
const errorEl = document.getElementById('error');

function showError(err) {
  console.error(err);
  errorEl.textContent = String(err && err.stack ? err.stack : err);
  errorEl.classList.remove('hidden');
}

let renderer;
try {
  renderer = new Renderer(canvas, S);
} catch (err) {
  showError(err);
  throw err;
}
const audio = new AudioSystem(S);
const input = new Input(canvas, S);
const hud = new Hud(S);
const dialog = new Dialog(S);
const screens = new Screens(S);

let game = null;
let mode = 'welcome';
let pastPlayTime = 0; // seconds played in the previous tries (for {elapsedTime})

function newGame() {
  const seed = S.seed ?? randomSeed();
  game = new Game({ S, renderer, audio, input, hud, dialog, screens, seed, onRetry: retry });
  game.pastPlayTime = pastPlayTime;
}

function begin() {
  audio.unlock();
  audio.sfx('click');
  audio.setTrack('gameplay', S.audio.gameplayFadeInSeconds); // the welcome page is silent
  screens.hideWelcome();
  input.enabled = true;
  input.requestLock();
  game.start();
  mode = 'play';
}

function retry() {
  audio.sfx('click');
  screens.hideEnd();
  if (dialog.active) dialog.close();
  if (game) pastPlayTime += game.playTime;
  newGame();
  input.enabled = true;
  input.requestLock();
  audio.setTrack('gameplay', S.audio.gameplayFadeInSeconds);
  game.start();
  mode = 'play';
}

// welcome page: silent, just the Start button
screens.onStart(() => { if (mode === 'welcome') begin(); });

try {
  newGame();
} catch (err) {
  showError(err);
}
if (S.debug.skipWelcome) begin();

let last = performance.now();
let statT = 0, frames = 0, fps = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000) * S.debug.timeScale;
  last = now;
  try {
    if (mode === 'welcome' || !game) {
      renderer.clear(hexToRgb(S.colors.welcome));
    } else {
      game.update(dt);
      game.render();
    }
  } catch (err) {
    showError(err);
    mode = 'error';
  }
  input.endFrame();

  frames++;
  statT += (now - (frame.prev || now)) / 1000;
  frame.prev = now;
  if (statT > 0.5) {
    fps = frames / statT;
    // adaptive stroke cap (render.targetFps); skip windows with a long pause (hidden tab)
    if (mode === 'play' && statT < 2 && !document.hidden) renderer.strokes.adapt(fps);
    frames = 0;
    statT = 0;
    if (S.debug.showStats && game) {
      const st = renderer.stats;
      statsEl.textContent = `${fps.toFixed(0)} fps · strokes ${st.strokes}/${st.candidates} (cap ${renderer.strokes.cap}) · enemies ${game.enemies.length} · trees hidden ${st.treesHidden || 0} · t ${game.playTime.toFixed(0)}s · seed ${game.seed}`;
    }
    statsEl.classList.toggle('hidden', !S.debug.showStats);
  }
}
requestAnimationFrame(frame);

// handy in the console: window.game, window.settings
Object.defineProperty(window, 'game', { get: () => game });
window.settings = S;
