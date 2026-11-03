// game.js - runs the original rules (sim.js) at the original frame rate, draws them at the
// display rate, and turns the simulation's events into sound, craters and HUD updates.

import {Sim, W, H, LEVEL_END} from './sim.js?v=26';

export class Game {
  constructor(cfg, assets, audio, input, canvas) {
    this.cfg = cfg; this.a = assets; this.audio = audio; this.input = input;
    this.canvas = canvas;
    // The playfield is always fully painted, so an opaque canvas spares the compositor a blend.
    this.ctx = canvas.getContext('2d', { alpha: false }); this.ctx.imageSmoothingEnabled = false;
    // fff toggles this: display frames, logic frames and the slowest display frame per second.
    this.perf = { on: false, t0: 0, frames: 0, steps: 0, worst: 0, text: '' };
    this.state = 'title';
    this.diff = cfg.defaultDifficulty || 1;
    this.acc = 0;
    this.sim = null;
    this.strip = null;
    this.onHud = null; this.onState = null;
    this.seed = (Date.now() ^ 0x5f3759df) >>> 0;
  }

  async loadData() {
    const [L, E] = await Promise.all([
      fetch('data/levels.json?v=26').then(r => r.json()),
      fetch('data/enemies.json?v=26').then(r => r.json())]);
    this.LEV = L; this.ENE = E;
  }

  frameMs() {
    const T = this.cfg.timing || {};
    const base = (T.frameMs || {})[String(this.diff)] || 35;
    return base / (T.speedScale || 1);
  }
  L() { return this.cfg.levels[this.sim ? this.sim.level : 0]; }

  // ---------------------------------------------------------------- flow
  start(levelIndex = 0, carry = {}) {
    this.sim = new Sim(this.cfg, { badg: this.ENE }, { seed: this.seed++, frameMs: this.frameMs() });
    this.sim.god = !!this.god;
    this.sim.newGame(this.diff, levelIndex, carry);
    this.enterPlay();
  }
  continueLevel() {
    this.sim.beginNextLevel();
    this.enterPlay();
  }
  enterPlay() {
    this.acc = 0;
    this.buildStrip();
    this.drain();
    this.state = 'play';
    this.onState && this.onState('play');
    this.audio.init();
    this.startMusic();
    this.hud();
    this.save();
  }
  startMusic() {
    const m = this.L().music;
    this.audio.loop('snd_' + m.snd, m.periodTicks * 1000 / 60);
  }
  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause'; this.audio.stopMusic(); this.onState && this.onState('pause');
  }
  resume() {
    if (this.state !== 'pause') return;
    this.state = 'play'; this.acc = 0; this.audio.init(); this.startMusic();
    this.onState && this.onState('play');
  }

  save(ahead = 0) {
    if (!this.sim) return;
    const s = this.sim;
    try { localStorage.setItem('foobar_save', JSON.stringify({ lvl: s.level + ahead, score: s.score,
      lives: s.lives, diff: this.diff, rapid: s.rapid, rapidT: s.rapidT, clones: s.clones })); } catch (e) {}
  }
  loadSave() { try { return JSON.parse(localStorage.getItem('foobar_save')); } catch (e) { return null; } }

  // ---------------------------------------------------------------- time
  // Called once per animation frame with the real elapsed time.
  tick(dt) {
    if (this.perf.on) this._perfCount(dt);
    if (this.state !== 'play') return;
    this._cheats();
    if (this.state !== 'play') return;
    const ms = this.frameMs();
    this.acc += dt;
    let n = 0;
    while (this.acc >= ms && n < 6) {
      this.acc -= ms; n++; this.perf.steps++;
      this.sim.step(this.keys());
      this.drain();
      if (this.state !== 'play') { this.acc = 0; return; }
      // the ship's exit after a boss is not frame-paced in the original, so it zooms
      let extra = this.sim.phase === 'flyoff' ? ((this.cfg.timing || {}).outroFramesPerStep || 1) - 1 : 0;
      while (extra-- > 0 && this.sim.phase === 'flyoff') {
        this.sim.step(this.keys());
        this.drain();
        if (this.state !== 'play') { this.acc = 0; return; }
      }
    }
    if (n >= 6) this.acc = 0;            // tab was in the background; do not fast-forward
    this.input.endFrame();
  }
  keys() {
    const I = this.input;
    return { left: !!I.down('left'), right: !!I.down('right'), up: !!I.down('up'),
      down: !!I.down('down'), fire: !!I.down('fire'), bomb: !!I.down('bomb') };
  }

  // Turn simulation events into sound, craters, HUD and state changes.
  drain() {
    const s = this.sim; if (!s) return;
    let hud = false;
    for (const e of s.events) {
      switch (e.t) {
        case 'snd': this.audio.sfx('snd_' + e.id, e.ch); break;
        case 'beep': this.audio.beep(); break;
        case 'crater': this.stampCrater(e.x, e.v); break;
        case 'reload': this.buildStrip(); break;
        case 'hud': case 'yummy': case 'shipLost': hud = true; break;
        case 'levelDone':
          this.state = 'brief'; this.audio.stopMusic(); this.save(1);
          this.onState && this.onState('brief'); break;
        case 'over':
          this.state = 'over'; this.audio.stopMusic();
          try { localStorage.removeItem('foobar_save'); } catch (err) {}
          this.onState && this.onState('over'); break;
        case 'win':
          this.state = 'win'; this.audio.stopMusic();
          try { localStorage.removeItem('foobar_save'); } catch (err) {}
          this.onState && this.onState('win'); break;
      }
    }
    s.events.length = 0;
    // Only while playing: once a level is done the shell has already switched the panel to
    // the next level's briefing, and a late update would put the old boss back.
    if (this.state === 'play' && (hud || s.frame % 15 === 0)) this.hud();
  }

  // ---------------------------------------------------------------- background
  // The level map, bottom row first, with the boss arena pictures stacked above its end.
  buildStrip() {
    const L = this.L(), T = this.cfg.tile;
    const tiles = this.LEV[L.id];
    const bank = this.cfg.tileBanks[L.tileBank];
    const c = document.createElement('canvas');
    c.width = W; c.height = LEVEL_END + H;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    for (let r = 0; r < T.rows; r++) {
      const y = c.height - (r + 1) * T.size;
      for (let k = 0; k < T.cols; k++) {
        const img = this.a.get(bank[tiles[r * T.cols + k]]);
        if (img) x.drawImage(img, k * T.size, y, T.size, T.size);
      }
    }
    const arena = this.a.get(L.arena);
    if (arena) x.drawImage(arena, 0, 0, W, H);
    this.strip = c; this.stripCtx = x;
  }
  // fn2_1624 draws face 245 into the background for every bomb blast.
  stampCrater(x, v) {
    const img = this.a.get(245);
    if (img && this.stripCtx) this.stripCtx.drawImage(img, Math.round(x), Math.round(LEVEL_END + v));
  }

  // ---------------------------------------------------------------- HUD
  hud() {
    const s = this.sim; if (!s || !this.onHud) return;
    const ms = this.frameMs();
    this.onHud({ score: s.score, lives: s.lives, level: s.level, levelName: this.L().name,
      boss: this.L().boss.name, yummies: s.yummiesTaken,
      progress: Math.min(1, s.scroll / LEVEL_END),
      rapid: s.rapid, rapidT: s.rapid && s.rapidT > 0 ? s.rapidT * ms / 1000 : 0,
      clone: s.clone, clones: s.clones,
      shieldT: s.prot > 0 ? s.prot * ms / 1000 : 0,
      freezeT: s.freezeT > 0 && s.frozen ? s.freezeT * ms / 1000 : 0,
      god: !!s.god, phase: s.phase });
  }

  // ---------------------------------------------------------------- cheats
  _cheats() {
    const C = this.cfg.cheats;
    if (!C || !C.enabled || !this.input || typeof this.input.typedBuffer !== 'function') return;
    let buf = '';
    try { buf = this.input.typedBuffer() || ''; } catch (e) { return; }
    if (!buf) return;
    for (const code of Object.keys(C.codes)) {
      if (buf.endsWith(code)) { this.input.clearTyped(); this.applyCheat(C.codes[code]); return; }
    }
  }
  applyCheat(action) {
    switch (action) {
      case 'permashield':
        this.god = !this.god;
        if (this.sim) this.sim.god = this.god;
        this.flash(this.god ? 'PERMASHIELD ON' : 'PERMASHIELD OFF');
        this.hud();
        return this.god;
      case 'nextlevel':
        if (this.state !== 'play' || !this.sim) return false;
        this.flash('LEVEL SKIP');
        return this.sim.forceLevelComplete();
      case 'perf':
        this.perf.on = !this.perf.on; this.perf.t0 = 0; this.perf.frames = 0; this.perf.steps = 0;
        this.perf.worst = 0; this.perf.text = 'measuring...';
        return this.perf.on;
      case 'bossjump': {
        if (this.state !== 'play' || !this.sim) return false;
        const ok = this.sim.jumpToBoss();
        if (ok) { this.flash('TO THE BOSS'); this.drain(); this.hud(); }
        return ok;
      }
    }
    return false;
  }
  flash(text) { this.banner = { text, until: performance.now() + 1500 }; }
  _perfCount(dt) {
    const P = this.perf, now = performance.now();
    if (!P.t0) P.t0 = now;
    P.frames++; P.worst = Math.max(P.worst, dt);
    if (now - P.t0 >= 1000) {
      const sec = (now - P.t0) / 1000;
      P.text = `${Math.round(P.frames / sec)} fps  logic ${(P.steps / sec).toFixed(1)}/s  ` +
        `worst ${Math.round(P.worst)} ms  sprites ${this.sim ? this.sim.sprites.length : 0}`;
      P.t0 = now; P.frames = 0; P.steps = 0; P.worst = 0;
    }
  }

  diagnostics() {
    const s = this.sim;
    return { build: this.cfg.build, state: this.state, diff: this.diff,
      frameMs: this.frameMs(), sim: s ? s.snapshot() : null,
      tileBank: s ? this.L().tileBank : null,
      strip: this.strip ? this.strip.width + 'x' + this.strip.height : null,
      spritesLoaded: Object.keys(this.a.img || {}).length };
  }

  // ---------------------------------------------------------------- drawing
  render() {
    const c = this.ctx;
    if (this.state === 'title' || this.state === 'loading' || !this.sim) {
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H); return;
    }
    const s = this.sim;
    const ms = this.frameMs();
    const smooth = (this.cfg.render || {}).interpolate !== false && this.state === 'play';
    const a = smooth ? Math.max(0, Math.min(1, this.acc / ms)) : 1;
    const scroll = s.prevScroll + (s.scroll - s.prevScroll) * a;
    const sr = Math.round(scroll);
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    if (this.strip) {
      const srcY = LEVEL_END - sr;
      const y0 = Math.max(0, srcY), y1 = Math.min(this.strip.height, srcY + H);
      if (y1 > y0) c.drawImage(this.strip, 0, y0, W, y1 - y0, 0, y0 - srcY, W, y1 - y0);
    }
    for (const sp of s.sprites) {
      if (!sp.face || !sp.task) continue;
      const img = this.a.get(sp.face);
      if (!img) continue;
      const x = sp.px + (sp.x - sp.px) * a;
      const v = sp.pv + (sp.v - sp.pv) * a;
      c.drawImage(img, Math.round(x), Math.round(v) + sr);
    }
    if (this.perf.on && this.perf.text) {
      c.font = '9px "IBM Plex Mono",monospace'; c.textBaseline = 'top';
      c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(2, 2, c.measureText(this.perf.text).width + 6, 13);
      c.fillStyle = '#7CFC00'; c.fillText(this.perf.text, 5, 4);
    }
    if (this.banner && performance.now() < this.banner.until) {
      c.font = 'bold 13px "IBM Plex Mono",monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 3; c.strokeStyle = '#000'; c.strokeText(this.banner.text, W / 2, H / 2);
      c.fillStyle = '#FFD24A'; c.fillText(this.banner.text, W / 2, H / 2);
      c.textAlign = 'start';
    }
  }
}
