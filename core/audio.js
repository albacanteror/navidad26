// Music bus (synced looping files crossfaded by volume) + procedural SFX.

export class AudioSystem {
  constructor(settings) {
    this.S = settings.audio;
    this.ctx = null;
    this.tracks = {}; // name -> { gain, source }
    this.wanted = null;
    this.t0 = 0;
    this.noiseBuffer = null;
    this.lastFootstep = 0;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Create / resume the AudioContext. Must be called from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.S.masterVolume;
      this.master.connect(this.ctx.destination);
      this.music = this.ctx.createGain();
      this.music.gain.value = this.S.musicVolume;
      this.music.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.S.sfxVolume;
      this.sfxBus.connect(this.master);
      this.t0 = this.ctx.currentTime + 0.15;
      this.makeNoise();
      this.loadTracks();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 1;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  async loadTracks() {
    for (const [name, path] of Object.entries(this.S.tracks)) {
      try {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        const buffer = await this.ctx.decodeAudioData(data);
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        gain.connect(this.music);
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(gain);
        // keep every track in sync: all share the same loop length and start time t0
        const now = this.ctx.currentTime + 0.05;
        if (now <= this.t0) src.start(this.t0, 0);
        else src.start(now, (now - this.t0) % buffer.duration);
        this.tracks[name] = { gain, src };
        // a track that is already wanted fades in (e.g. gameplay right after Start)
        if (this.wanted === name) this.fadeTo(gain, 1, this.fadeSeconds);
      } catch (err) {
        console.warn(`[audio] music track "${name}" (${path}) not loaded: ${err.message}`);
      }
    }
  }

  /**
   * Crossfade to a music track by name (gameplay, wiseman, nearStar, final),
   * or null to fade all music out. `seconds` overrides audio.crossfadeSeconds.
   */
  setTrack(name, seconds = this.S.crossfadeSeconds) {
    if (this.wanted === name) return;
    this.wanted = name;
    this.fadeSeconds = seconds;
    if (!this.ctx) return;
    for (const [n, t] of Object.entries(this.tracks)) this.fadeTo(t.gain, n === name ? 1 : 0, seconds);
  }

  /** Exponential approach to `value` (fast at first, easing out), ~done after `seconds`. */
  fadeTo(gain, value, seconds) {
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.setTargetAtTime(value, now, Math.max(0.01, seconds / 4));
  }

  // ------------------------------------------------------------ SFX helpers
  env(g, t, attack, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  tone(type, freq, t, attack, peak, decay, dest, freqEnd) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + attack + decay);
    const g = this.ctx.createGain();
    this.env(g, t, attack, peak, decay);
    o.connect(g).connect(dest || this.sfxBus);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  noise(t, seconds, peak, filterType, freq, freqEnd, q = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + seconds);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, Math.min(0.02, seconds * 0.2), peak, seconds);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + seconds + 0.1);
  }

  /** Play a procedural sound effect by name. */
  sfx(name) {
    if (!this.ready) return;
    const p = this.S.sfx[name];
    if (!p) return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'click':
        this.tone('sine', p.freq, t, 0.004, p.volume, p.seconds);
        this.tone('triangle', p.freq * 1.5, t, 0.004, p.volume * 0.3, p.seconds * 0.8);
        break;
      case 'throw':
        this.noise(t, p.seconds, p.volume, 'bandpass', p.freqStart, p.freqEnd, 1.6);
        break;
      case 'hit':
        this.tone('sine', p.freqStart, t, 0.005, p.volume, p.seconds, null, p.freqEnd);
        this.noise(t, p.seconds * 0.5, p.volume * 0.6, 'lowpass', 2200, 400, 0.7);
        break;
      case 'magic': {
        const steps = [0, 4, 7, 12, 16, 19, 24, 28];
        steps.forEach((st, i) => {
          const f = p.baseFreq * Math.pow(2, st / 12);
          const ti = t + i * 0.07;
          this.tone('sine', f, ti, 0.01, p.volume * 0.35, p.seconds * 0.7);
          this.tone('triangle', f * 1.003, ti, 0.01, p.volume * 0.12, p.seconds * 0.6);
        });
        this.noise(t, p.seconds, p.volume * 0.25, 'highpass', 4000, 9000, 0.5);
        this.tone('sine', p.baseFreq / 4, t, 0.3, p.volume * 0.4, p.seconds, null, p.baseFreq / 2);
        break;
      }
      case 'footstep': {
        const now = this.ctx.currentTime;
        if (now - this.lastFootstep < 0.12) return;
        this.lastFootstep = now;
        this.noise(t, p.seconds, p.volume, 'lowpass', p.cutoff * (0.8 + Math.random() * 0.4), p.cutoff * 0.4, 0.8);
        break;
      }
      case 'starSeen': {
        const partials = [[1, 1], [2.0, 0.5], [2.76, 0.35], [5.4, 0.2], [8.93, 0.1]];
        for (const [m, a] of partials) this.tone('sine', p.freq * m, t, 0.005, p.volume * a, p.seconds / m ** 0.3);
        break;
      }
      case 'heal':
        [0, 7, 12].forEach((st, i) => this.tone('sine', p.baseFreq * Math.pow(2, st / 12), t + i * 0.09, 0.01, p.volume * 0.5, p.seconds));
        break;
      default:
        break;
    }
  }
}
