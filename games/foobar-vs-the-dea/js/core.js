// core.js - input, assets, audio

export class Input {
  constructor() {
    this.k = {}; this.t = { left: 0, right: 0, up: 0, down: 0, fire: 0, bomb: 0 }; this._jp = {};
    this.typed = []; this._lastType = 0;
    addEventListener('keydown', e => {
      if (e.target && e.target.tagName === 'INPUT') return;   // typing a high score name
      const k = e.key.toLowerCase();
      if (!this.k[k]) this._jp[k] = 1; this.k[k] = 1;
      if (/^[a-z0-9]$/.test(k)) {
        const now = Date.now();
        if (now - this._lastType > 1200) this.typed.length = 0;   // stale buffer
        this._lastType = now;
        this.typed.push(k);
        if (this.typed.length > 16) this.typed.shift();
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key)) e.preventDefault();
    });
    addEventListener('keyup', e => { this.k[e.key.toLowerCase()] = 0; });
    addEventListener('blur', () => { this.k = {}; });
    for (const [id, a] of Object.entries({ 't-left': 'left', 't-right': 'right', 't-up': 'up',
      't-down': 'down', 't-fire': 'fire', 't-bomb': 'bomb' })) {
      const el = document.getElementById(id); if (!el) continue;
      el.addEventListener('touchstart', e => { e.preventDefault(); this.t[a] = 1; }, { passive: false });
      el.addEventListener('touchend', () => this.t[a] = 0);
      el.addEventListener('touchcancel', () => this.t[a] = 0);
    }
  }
  // The original flew on W A S D by default, fired with Command and bombed with Option.
  // In a browser Command+W closes the tab and Alt+Left goes back a page, so fire and bomb
  // live on Z / Space and X / Shift instead.
  down(a) {
    const k = this.k; switch (a) {
      case 'left': return k['arrowleft'] || k['a'] || this.t.left;
      case 'right': return k['arrowright'] || k['d'] || this.t.right;
      case 'up': return k['arrowup'] || k['w'] || this.t.up;
      case 'down': return k['arrowdown'] || k['s'] || this.t.down;
      case 'fire': return k['z'] || k[' '] || this.t.fire;
      case 'bomb': return k['x'] || k['shift'] || this.t.bomb;
    }
    return 0;
  }
  pressed(k) { const v = this._jp[k] || 0; this._jp[k] = 0; return v; }
  typedBuffer() { return (this.typed || []).join(''); }
  clearTyped() { if (this.typed) this.typed.length = 0; }
  endFrame() { this._jp = {}; }
}

export const V = '25';

export class Assets {
  constructor() { this.img = {}; this.snd = {}; this.n = 0; this.total = 0; }
  async load(manifest) {
    const ids = manifest.sprites, ui = manifest.ui, snds = manifest.sounds;
    this.total = ids.length + ui.length + snds.length;
    await Promise.all([
      ...ids.map(id => this._img(id, `assets/sprites/cicn_${id}.png`)),
      ...ui.map(u => this._img(u, `assets/ui/${u}.png`)),
      ...snds.map(s => this._snd(s))]);
  }
  _img(key, src) {
    return new Promise(r => {
      const i = new Image();
      i.onload = () => { this.img[key] = i; this.n++; r(); };
      i.onerror = () => { this.n++; r(); }; i.src = src + '?v=' + V;
    });
  }
  _snd(name) {
    return fetch(`assets/sounds/${name}.wav?v=${V}`).then(r => r.arrayBuffer())
      .then(b => { this.snd[name] = b; this.n++; }).catch(() => { this.n++; });
  }
  get(id) { return this.img[id] || null; }
  progress() { return this.total ? this.n / this.total : 0; }
}

// SAT plays sounds on numbered channels: a new sound on a busy channel replaces the old one.
// Channel 2 is the music loop, which the original restarts on a fixed period rather than
// looping the sample, so the tail of each loop is cut exactly as it was.
export class Audio {
  constructor(a) {
    this.a = a; this.ctx = null; this.buf = {}; this.ch = {};
    this.musicOn = true; this.sfxOn = true; this.musicTimer = null; this.musicName = null;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.mg = this.ctx.createGain(); this.mg.gain.value = .5; this.mg.connect(this.ctx.destination);
    this.sg = this.ctx.createGain(); this.sg.gain.value = .55; this.sg.connect(this.ctx.destination);
  }
  async _dec(n) {
    if (this.buf[n]) return this.buf[n];
    const raw = this.a.snd[n]; if (!raw || !this.ctx) return null;
    try { const b = await this.ctx.decodeAudioData(raw.slice(0)); this.buf[n] = b; return b; }
    catch (e) { return null; }
  }
  _play(buffer, gain, ch) {
    const s = this.ctx.createBufferSource(); s.buffer = buffer; s.connect(gain);
    if (ch !== undefined) {
      const old = this.ch[ch]; if (old) { try { old.stop(); } catch (e) {} }
      this.ch[ch] = s;
    }
    s.start();
    return s;
  }
  async sfx(n, ch) {
    if (!this.ctx || !this.sfxOn) return;
    const b = await this._dec(n); if (!b) return;
    this._play(b, this.sg, ch);
  }
  // The Mac system beep that the original plays for protection and freeze.
  beep() {
    if (!this.ctx || !this.sfxOn) return;
    if (!this.buf._beep) {
      const sr = this.ctx.sampleRate, n = Math.round(sr * 0.16);
      const b = this.ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) {
        const t = i / sr, env = Math.min(1, (n - i) / (sr * 0.04));
        d[i] = (Math.sin(2 * Math.PI * 880 * t) > 0 ? 0.35 : -0.35) * env;
      }
      this.buf._beep = b;
    }
    this._play(this.buf._beep, this.sg, 'beep');
  }
  async loop(n, periodMs) {
    this.stopMusic();
    this.musicName = n; this.musicPeriod = periodMs;
    if (!this.ctx || !this.musicOn) return;
    const b = await this._dec(n); if (!b || this.musicName !== n) return;
    const fire = () => { if (this.musicOn) this._play(b, this.mg, 2); };
    fire();
    this.musicTimer = setInterval(fire, periodMs);
  }
  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    const m = this.ch[2]; if (m) { try { m.stop(); } catch (e) {} this.ch[2] = null; }
  }
  toggle() {
    this.musicOn = !this.musicOn;
    if (!this.musicOn) this.stopMusic();
    return this.musicOn;
  }
}
