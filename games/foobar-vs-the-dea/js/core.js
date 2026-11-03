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

// Touch controls, beside or under the playfield so no thumb covers it: a stick for the left
// thumb, FIRE and BOMB for the right. They set Input.t, the same six flags as the keys, so the
// ship still moves 4 px a frame on each axis, all or nothing, and a held button repeats on the
// original's own timers like a held key.
//  - The stick centres where the thumb lands and is dragged along past its rim, so turning
//    round never takes more than a short slide. Its offset reads as one of eight directions.
//  - A thumb in the gap between the two buttons (the +) holds both, as a second finger does.
// el: { stick, base, knob, btns, fire, bomb }. onButton runs when a button goes down, so a
// screen that waits for a key (the briefing) can take a button press as one.
export class TouchPad {
  constructor(input, el, onButton) {
    this.t = input.t; this.el = el; this.onButton = onButton || null;
    this.ptr = new Map();          // pointerId -> where that finger is and which zone it holds
    const zone = (z, name) => {
      if (!z) return;
      z.addEventListener('pointerdown', e => this._down(e, name));
      z.addEventListener('pointermove', e => this._move(e));
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'])
        z.addEventListener(t, e => this._up(e));
      // iOS: no selection loupe, callout or double-tap zoom under a held thumb
      z.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
      z.addEventListener('contextmenu', e => e.preventDefault());
    };
    zone(el.stick, 'stick'); zone(el.btns, 'btns');
    addEventListener('blur', () => this.reset());
  }
  _down(e, zone) {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    const p = { zone, x: e.clientX, y: e.clientY };
    if (zone === 'stick') {
      for (const [id, q] of this.ptr) if (q.zone === 'stick') this.ptr.delete(id);  // newest thumb steers
      const b = this.el.base, k = this.el.knob;
      p.box = this.el.stick.getBoundingClientRect();
      p.R = Math.max(16, ((b.offsetWidth || 110) - (k.offsetWidth || 50)) / 2);    // knob travel
      p.ox = e.clientX; p.oy = e.clientY;
    } else {
      p.fr = this.el.fire.getBoundingClientRect().right;   // FIRE on the left, BOMB on the right
      p.bl = this.el.bomb.getBoundingClientRect().left;
    }
    this.ptr.set(e.pointerId, p);
    this._apply();
    if (zone === 'btns' && this.onButton) this.onButton();
  }
  _move(e) {
    const p = this.ptr.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    this._apply();
  }
  _up(e) { if (this.ptr.delete(e.pointerId)) this._apply(); }
  reset() { this.ptr.clear(); this._apply(); }
  _apply() {
    const t = this.t; t.left = t.right = t.up = t.down = t.fire = t.bomb = 0;
    let stick = null;
    for (const p of this.ptr.values()) {
      if (p.zone === 'stick') { stick = p; continue; }
      if (p.x < p.bl) t.fire = 1;                       // in the gap between them, both
      if (p.x > p.fr) t.bomb = 1;
    }
    const { base, knob, fire, bomb } = this.el;
    if (stick) {
      let dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = Math.hypot(dx, dy);
      if (d > stick.R) {                                // drag the centre along behind the thumb
        stick.ox = stick.x - dx * stick.R / d; stick.oy = stick.y - dy * stick.R / d;
        const B = stick.box;                            // but keep it over the stick's own zone
        stick.ox = Math.min(B.right, Math.max(B.left, stick.ox));
        stick.oy = Math.min(B.bottom, Math.max(B.top, stick.oy));
        dx = stick.x - stick.ox; dy = stick.y - stick.oy; d = Math.hypot(dx, dy);
      }
      if (d >= 8) {                                     // dead zone, then 45 degree sectors
        const c = d * 0.3827;                           // sin 22.5
        t.left = dx < -c ? 1 : 0; t.right = dx > c ? 1 : 0;
        t.up = dy < -c ? 1 : 0; t.down = dy > c ? 1 : 0;
      }
      const kd = Math.min(d, stick.R), kx = d ? dx / d * kd : 0, ky = d ? dy / d * kd : 0;
      base.style.left = (stick.ox - stick.box.left) + 'px'; base.style.top = (stick.oy - stick.box.top) + 'px';
      knob.style.transform = `translate(calc(-50% + ${kx.toFixed(1)}px), calc(-50% + ${ky.toFixed(1)}px))`;
      base.classList.add('on');
    } else if (base) {
      base.style.left = base.style.top = knob.style.transform = '';
      base.classList.remove('on');
    }
    if (fire) { fire.classList.toggle('on', !!t.fire); bomb.classList.toggle('on', !!t.bomb); }
  }
}

export const V = '26';

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
    if (this.ctx) { this.wake(); return; }
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
  // The page left the screen: hold every sound, the intro's music included, where it is. A
  // phone otherwise plays on with the screen off, and a background tab plays on unseen.
  suspend() {
    const c = this.ctx; if (!c || c.state !== 'running' || typeof c.suspend !== 'function') return;
    const p = c.suspend(); if (p && p.catch) p.catch(() => {});
  }
  // Back on screen, or a tap. iOS can leave the context 'interrupted' after a call or a trip to
  // another app, not only 'suspended', so anything short of running is resumed.
  wake() {
    const c = this.ctx; if (!c || c.state === 'running' || c.state === 'closed') return;
    const p = c.resume(); if (p && p.catch) p.catch(() => {});
  }
}
