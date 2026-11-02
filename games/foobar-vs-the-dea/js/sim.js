// sim.js - the game rules of Foobar vs. the DEA, ported from the original 68k code.
//
// One step() is one frame of the original game. Nothing here touches the DOM, audio or
// images, so the Node tests drive it directly. Routine names in the comments (fn2_365E and
// so on) are the original functions; REVERSE_ENGINEERING.md explains each one.
//
// Coordinates. The original draws into a 640-row ring buffer. Here every sprite keeps an
// unwrapped world position (x, v) with x = h - 1 and screenY = v + scroll, so a sprite
// that does not move in buffer space scrolls down the screen with the ground, exactly as
// it did on the Mac. Sprites are positioned by their top-left corner, like SAT.

export const W = 320, H = 340, LEVEL_END = 6400, BOSS_AT = 6200;
export const CHECKPOINTS = [0, 1280, 3200, 5120];

// ANSI C rand() as linked into the game (fn6_1562) and its Random(lo, span) (fn2_19A8):
// trunc(lo + span * rand() / 32767). The second argument is a span, not an upper bound.
export class Rng {
  constructor(seed = 1) { this.s = seed >>> 0; }
  rand() { this.s = (Math.imul(this.s, 1103515245) + 12345) >>> 0; return (this.s >>> 16) & 0x7fff; }
  R(lo, span) { return Math.trunc(lo + span * this.rand() / 32767); }
}

// Level 1 submarine turn table from fn2_3042: sub number -> map offsets where it turns.
export const SUB_TURNS = {
  1: [160], 2: [160], 4: [160], 5: [290], 6: [920], 7: [920], 8: [1090], 9: [1090],
  10: [1320], 11: [1470, 1410], 13: [2435], 14: [2560, 2530], 16: [3340], 17: [3340],
  18: [3940], 19: [3940], 20: [4220], 22: [4280], 24: [4600], 25: [4670, 4600],
  26: [5520, 5490, 5460, 5430, 5400], 27: [5520, 5490, 5460, 5430, 5400],
  28: [5520, 5490, 5460, 5550, 5600], 29: [5520, 5490, 5460, 5550, 5600], 30: [5710],
};

// Hit text animations picked at random by fn2_141A (ZAP, POW, BOOM, WHAM, SPLAT).
export const HIT_TEXT = [
  [243, 236, 237, 238, 239, 240, 241, 242],
  [174, 175, 176, 177, 178, 179, 180, 181],
  [500, 501, 502, 503, 504, 505, 506, 507],
  [16007, 16006, 16005, 16004, 16003, 16002, 16001, 16000],
  [17007, 17006, 17005, 17004, 17003, 17002, 17001, 17000],
];

// Frames between bombs. The ship routines copy gm9890 into each ship's bomb timer. The game
// never writes gm9890; it starts at 30 in the DATA resource that THINK C copies into the
// globals at launch (fn1_0044). Build 22 read it as zero and let a bomb drop every frame.
export const BOMB_GAP = 30;

// Sound resources and the SAT channel each one plays on.
export const SND = { shot: 130, foeShot: 129, boom: 132, bombDrop: 137 };

const SHIP = 666, AIR = 20, GROUND = 30, BOSS = 40, MACHINE = 41, BOMB = 100, YUMMY = 297, ROCKET = 303;

let SERIAL = 0;
function sprite() {
  return { id: ++SERIAL, kind: 0, x: 0, v: 0, px: 0, pv: 0, hot: [0, 0, 0, 0], face: 0, layer: 0,
    task: null, hit: null, name: '', code: 0, hp: 0, mode: 0, timer: 0, dir: 0, mapo: 0,
    walk: 0, sh: 0, sv: 0, flag: 0, idx: 0, target: 0, armed: 0, exploded: 0, life: 0, ship: null };
}

export class Sim {
  constructor(cfg, data, opts = {}) {
    this.cfg = cfg;
    // House rules: deliberate departures from the original, set in config.json. Left out,
    // every one falls back to what the original does.
    this.H = Object.assign({ rapidFireFrames: 0, maxClones: 1, respawnShieldFrames: 0,
      dronesVisibleInFreeze: false }, cfg.houseRules || {});
    this.badg = data.badg;                      // {levelId: [{t,x,y,p} x 150]}
    this.rng = new Rng(opts.seed ?? 1);
    this.frameMs = opts.frameMs || 35;          // only used for the bomb sight flash
    this.events = [];
    this.sprites = [];
    this.phase = 'idle';
    this.god = false;
    this.frame = 0;
  }

  // ------------------------------------------------------------------ game flow
  newGame(diff = 1, levelIndex = 0, carry = {}) {
    this.diff = Math.max(1, Math.min(3, diff | 0));
    this.score = carry.score || 0;
    this.lives = carry.lives ?? 5;              // fn3_39CA 3A0A
    this.rapid = !!carry.rapid;
    const RF = this.H.rapidFireFrames;          // house rule: 0 means rapid fire never runs out
    this.rapidT = this.rapid && RF > 0 ? Math.min(RF, carry.rapidT || RF) : 0;
    this.fireCooldown = this.rapid ? 5 : 10;    // gm9892
    // gm5564 in the original is a single clone flag. Here the formation is a list of wing
    // ships, so the house rule can fly two.
    this.clones = Math.min(this.H.maxClones, carry.clones ?? (carry.clone ? 1 : 0));
    this.wing = [];
    this.prot = 0; this.invuln = false;         // gm6652, gm9888
    this.freezeT = 0; this.frozen = false;      // gm6664, gm6670
    this.smartT = 0; this.smart = false;        // gm6668, gm6666
    this.yummiesTaken = carry.yummiesTaken || 0;
    this.level = levelIndex;
    this.scroll = 0;
    this.startLife();
  }

  // The next level after a completed one. Called by the shell once the briefing closes.
  beginNextLevel() {
    this.level++;
    this.scroll = 0;
    this.startLife();
  }

  L() { return this.cfg.levels[this.level]; }
  get levelNo() { return this.level + 1; }
  fireTimerReset() { return (4 - this.diff) * 15 - 5; }   // 40, 25, 10

  // Per-life setup, the code at L3BDC (and its copies for levels 2 to 4).
  startLife() {
    this.frozen = false;
    this.yflags = {};
    this.aimAt1 = true;                        // gm5574
    this.dead = false; this.complete = false;  // gm5440, gm5439
    this.bossPhase = false; this.smart = false;
    const s = this.scroll;
    let cp = 0, count = 0;
    if (s >= 5120) { count = 25; cp = 5120; }
    if (s < 1280) { count = 0; cp = 0; }
    if (s >= 3200 && s < 5120) { count = 14; cp = 3200; }
    if (s >= 1280 && s < 3200) { count = 9; cp = 1280; }
    this.checkpoint = cp; this.groundCount = count;
    this.loadLevel(cp);
    this.phase = 'play'; this.pf = 0;
  }

  // fn3_29D0 and friends: clear every sprite, rewind to the checkpoint, place the ship.
  loadLevel(cp) {
    this.sprites = [];
    this.scroll = cp; this.prevScroll = cp;
    const B = this.badg[this.L().id];
    this.waveIdx = B.findIndex(e => e.y >= cp);
    if (this.waveIdx < 0) this.waveIdx = B.length;
    this.flyIn = true;                          // gm5607
    this.ship1 = this.spawn('ship', 119, 349 - cp, s => { s.idx = 1; s.slot = 0; s.off = 0; });
    this.ret1 = this.spawn('reticle', this.ship1.x + 13, this.ship1.v - 120, s => { s.ship = this.ship1; });
    this.ship1.ret = this.ret1;
    const n = this.clones;
    this.wing = []; this.clones = 0;
    for (let i = 0; i < n; i++) this.addClone();
    this.events.push({ t: 'reload' });
  }

  get clone() { return this.clones > 0; }
  get ship2() { return this.wing.find(w => w.slot < 0) || this.wing[0] || null; }

  // Foo++ (fn2_4C74, fn2_6C9A): a wing ship 33 px from the lead with its own sight, fire and
  // bombs. The original's one clone sits on the left. The house rule's second goes right.
  addClone() {
    if (this.clones >= this.H.maxClones || !this.ship1) return null;
    const a = this.ship1, slot = this.wing.some(w => w.slot < 0) ? 1 : -1;
    const s = this.spawn('clone', a.x + 33 * slot, a.v, u => { u.idx = slot < 0 ? 2 : 3; u.slot = slot; u.off = 33 * slot; });
    s.ret = this.spawn('reticle', s.x + 13, s.v - 120, r => { r.ship = s; });
    this.wing.push(s);
    this.clones = this.wing.length;
    return s;
  }

  // ------------------------------------------------------------------ the frame
  step(keys) {
    this.keys = keys || {};
    this.frame++;
    for (const s of this.sprites) { s.px = s.x; s.pv = s.v; }
    this.prevScroll = this.scroll;
    switch (this.phase) {
      case 'play': this.framePlay(); break;
      case 'boss': this.frameBoss(); break;
      case 'complete':
        this.runSAT();
        if (++this.pf >= 100) { this.phase = 'flyoff'; this.pf = 0; }
        break;
      case 'flyoff': {                           // fn3_39CA 3F32
        this.runSAT();
        const a = this.ship1;
        a.v -= 5;
        if (a.v + this.scroll <= 1 || ++this.pf > 200) this.afterOutro();
        break;
      }
      case 'dying':
        this.runSAT();
        if (++this.pf >= 50) this.afterDeath();
        break;
    }
  }

  // The scrolling part of a level, fn3_39CA 3D54.
  framePlay() {
    this.yummySpawner();
    this.waveSpawner();
    if (this.level === 0 && this.scroll < 3200) this.rocketSpawner(2); else this.rocketSpawner(1);
    this.runSAT();
    this.arenaTriggers();
    this.countdowns();
    if (this.dead) return this.leaveLoop();
    if (this.scroll >= LEVEL_END) {
      if (this.complete) return this.leaveLoop();
      this.bossPhase = true;                    // gm5568
      this.phase = 'boss'; this.pf = 0;
    }
  }

  // The boss fight loop, fn3_39CA 3E76.
  frameBoss() {
    if (this.rng.R(1, 50) === 1)
      this.spawn('air', this.rng.R(50, 270) - 1, -21 - LEVEL_END);
    this.runSAT();
    if (this.dead || this.complete) this.leaveLoop();
  }

  leaveLoop() {
    if (this.complete) { this.phase = 'complete'; this.pf = 0; return; }
    this.enterDying();
  }
  enterDying() {
    this.lives--;                              // fn3_39CA 3F58
    if (this.H.rapidFireFrames > 0 && this.rapid) this.endRapid();          // house rule
    this.phase = 'dying'; this.pf = 0;
    this.events.push({ t: 'hud' });
  }
  afterOutro() {
    if (this.dead) { this.enterDying(); this.pf = 0; this.phase = 'dying'; this.outroDone = true; return; }
    this.finish();
  }
  afterDeath() {
    if (this.outroDone) { this.outroDone = false; return this.finish(); }
    if (this.lives > 0 && !this.complete) {
      this.startLife();
      const n = this.H.respawnShieldFrames;                                // house rule
      if (n > 0) { this.prot = Math.max(this.prot, n); this.invuln = true; }
      return;
    }
    this.finish();
  }
  finish() {
    this.sprites = [];
    if (this.lives <= 0) { this.phase = 'over'; this.events.push({ t: 'over' }); return; }
    if (this.complete) {
      this.complete = false;
      if (this.level >= this.cfg.levels.length - 1) { this.phase = 'win'; this.events.push({ t: 'win' }); }
      else { this.phase = 'levelDone'; this.events.push({ t: 'levelDone' }); }
    }
  }

  // Protection, freeze and smart bomb timers, only while the level scrolls (fn3_39CA 3DB6).
  countdowns() {
    if (this.prot > 0) {
      if (this.prot < 100) this.invuln = (this.prot % 20) <= 10;
      this.prot--;
      if (this.prot === 0) { this.invuln = false; this.events.push({ t: 'beep' }); }
    }
    if (this.freezeT > 0 && --this.freezeT === 0) this.frozen = false;
    if (this.smartT > 0 && --this.smartT === 0) this.smart = false;
    if (this.rapidT > 0 && --this.rapidT === 0) this.endRapid();          // house rule
  }
  endRapid() { this.rapid = false; this.rapidT = 0; this.fireCooldown = 10; }

  // SAT's RunSAT: tasks in list order, sort by layer, collisions, scroll, disposal.
  runSAT() {
    const snap = this.sprites.slice();
    for (const s of snap) if (s.task) s.task(s);
    this.sprites.sort((a, b) => a.layer - b.layer);
    this.collide();
    if (this.scroll < LEVEL_END) this.scroll++;   // fn3_0668, 1 px per frame
    this.sprites = this.sprites.filter(s => s.task);
  }

  // fn5_435A: every friend (kind > 0) against every enemy (kind < 0), forward then back.
  collide() {
    // SAT walks next/prev pointers, so sprites created by hit procs (always kind 0 debris)
    // never disturb the scan. A snapshot gives the same result here.
    const L = this.sprites.slice();
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.kind <= 0) continue;
      for (let j = i + 1; j < L.length; j++) this.pair(a, L[j]);
      for (let j = i - 1; j >= 0; j--) this.pair(a, L[j]);
    }
  }
  pair(a, b) {
    if (b.kind >= 0) return;
    const ax0 = a.x + a.hot[0], ay0 = a.v + a.hot[1], ax1 = a.x + a.hot[2], ay1 = a.v + a.hot[3];
    const bx0 = b.x + b.hot[0], by0 = b.v + b.hot[1], bx1 = b.x + b.hot[2], by1 = b.v + b.hot[3];
    if (!(ax0 < bx1 && bx0 < ax1 && ay0 < by1 && by0 < ay1)) return;
    a.kind = 10; b.kind = -10;
    if (a.hit) a.hit(a, b);
    if (b.hit) b.hit(b, a);
  }

  // ------------------------------------------------------------------ helpers
  sy(s) { return s.v + this.scroll; }          // screen y
  kill(s) { if (s) s.task = null; }
  snd(id, ch) { this.events.push({ t: 'snd', id, ch }); }
  addScore(n) { this.score += n * this.diff; this.events.push({ t: 'hud' }); }
  spawn(name, x, v, init) {
    const s = sprite();
    s.name = name; s.x = x; s.v = v; s.px = x; s.pv = v;
    if (init) init(s);
    const setup = this['setup_' + name];
    if (setup) setup.call(this, s);
    this.sprites.unshift(s);                    // SAT inserts new sprites at the head
    return s;
  }
  belowScreen(s) { return this.sy(s) > H - 1; }
  aboveScreen(s) { return this.sy(s) < 0; }
  // The original aims at the lead, or at the clone once the lead is gone (gm5574). The lead
  // here is always the surviving ship, so that is simply the lead.
  target() { return this.ship1; }

  // Aimed shot velocity (fn2_081A / fn2_041C / fn2_001E): 6 px per frame from the shooter's
  // top-left toward the ship's top-left, each axis truncated toward zero.
  aim(s, fromX, fromV) {
    const t = this.target();
    const dx = t.x - fromX, dy = t.v - fromV;
    const dist = Math.fround(Math.sqrt(dx * dx + dy * dy));
    if (!dist) { s.sh = 0; s.sv = 6; return; }
    s.sh = Math.trunc(dx / dist * 6);
    s.sv = Math.trunc(dy / dist * 6);
  }

  // A ship was hit by something that kills it (fn2_0DCE, fn2_2142, fn2_65CA).
  // Losing a ship while another flies costs no life. When the lead goes, the original lets
  // the clone fly on by itself; here the survivor becomes the lead, so the formation, the
  // fly-off and the enemies' aim all follow it. A second hit on a ship already lost in the
  // same frame is ignored (the original would count it again and take a life).
  killShip(ship) {
    if (this.god || ship.lost) return;
    ship.lost = true;
    this.kill(ship); this.kill(ship.ret);
    this.events.push({ t: 'shipLost', idx: ship.idx });
    if (ship === this.ship1) {
      if (!this.wing.length) { this.dead = true; return; }
      const heir = this.wing.find(w => w.slot < 0) || this.wing[0];
      this.wing = this.wing.filter(w => w !== heir);
      heir.idx = 1; heir.slot = 0; heir.off = 0;
      this.ship1 = heir; this.ret1 = heir.ret;
      for (const w of this.wing) { w.off = w.x - heir.x; w.slot = w.off < 0 ? -1 : 1; }
    } else this.wing = this.wing.filter(w => w !== ship);
    this.clones = this.wing.length;
  }

  // Three bits of debris and a hit text around a destroyed sprite.
  debrisAt(s) {
    const R = this.rng;
    this.spawn('debris', s.x - R.R(1, 30), s.v - R.R(1, 30));
    this.spawn('debris', s.x + R.R(1, 30), s.v - R.R(1, 30));
    this.spawn('debris', s.x + R.R(1, 30), s.v + R.R(1, 30));
    this.spawn('hittext', s.x - 16, s.v - 16);
  }

  // fn5_4EFE: what a sprite does to itself on the frame a smart bomb is active.
  smartEffect(s) {
    if (s.code === AIR) { this.kill(s); this.addScore(10); }
    if (s.code !== GROUND && s.flag !== 10000) this.debrisAt(s);
    if (s.code === ROCKET) {
      this.addScore(5); this.kill(s);
      if (s.flag !== 10000) this.debrisAt(s);
    }
    if (s.code === GROUND) {
      this.spawn('crater', s.x - 32, s.v - 32);
      if (s.flag === 10000) { if (s.mode > 4 && s.mode < 30) s.mode = 2000; }
      else this.kill(s);
      this.addScore(50);
    }
  }

  // ------------------------------------------------------------------ spawners
  // fn3_5932: one yummy at scroll 200 + 1280k.
  yummySpawner() {
    if ((this.scroll - 200) % 1280 !== 0) return;
    const R = this.rng, F = this.yflags;
    for (let guard = 0; guard < 1000; guard++) {
      const d = R.R(1, 9);
      let kind = null, flag = null;
      if (d === 1 && !F.e1) { kind = 'extraman'; flag = 'e1'; }
      else if ((d === 2 || d === 3) && !this.rapid) { kind = 'rapidfire'; flag = 'rf'; }
      else if (d === 4 && this.clones < this.H.maxClones && (this.H.maxClones > 1 || !F.cl)) { kind = 'clone'; flag = 'cl'; }
      else if (d === 5 && !F.pr) { kind = 'protection'; flag = 'pr'; }
      else if (d === 6 && !F.fr) { kind = 'freeze'; flag = 'fr'; }
      else if (d === 7 && !F.sb) { kind = 'smartbomb'; flag = 'sb'; }
      else if (d === 8 && !F.e8) { kind = 'extraman'; flag = 'e8'; }
      else if (d === 9 && !F.e9) { kind = 'extraman'; flag = 'e9'; }
      if (!kind) continue;
      F[flag] = true;
      this.spawn('yummy', R.R(50, 250) - 1, -50 - this.scroll, s => { s.ykind = kind; });
      return;
    }
  }

  // fn3_234A (L1), fn3_2728 (L2), fn3_2606 (L3), fn3_24E4 (L4).
  waveSpawner() {
    const B = this.badg[this.L().id];
    const e = B[this.waveIdx];
    if (!e || e.y !== this.scroll || e.t === 10000) return;
    const lv = this.levelNo;
    if (e.t === 1) {
      const kind = this.L().ground;
      const y = lv === 1 ? -50 : -40;
      const s = this.spawn(kind, e.x - 1, y - this.scroll, u => { u.dir = e.p; u.mapo = this.scroll; });
      this.groundCount++;
      s.idx = this.groundCount;
      const n = this.groundCount;
      if (lv === 1) {
        if (this.diff === 1 && n === 1) this.kill(s);
        if (n > 2 && n < 8) this.kill(s);
        else if (n > 16 && n < 21 && n !== 18) this.kill(s);
        else if (n > 24 && n < 28) this.kill(s);
      }
      if (lv === 2 && n === 2) this.kill(s);
    }
    if (e.t === 2) {
      const h = this.rng.R(1, 100) + e.x - 50;
      this.spawn('air', h - 1, -100 - this.scroll);
    }
    this.waveIdx++;
  }

  // fn3_57D6 / fn3_5882: random rockets from the sides.
  rocketSpawner(mult) {
    const R = this.rng;
    const n = [0, 60, 50, 40][this.diff] * mult;
    if (R.R(1, n) !== 1 || this.frozen) return;
    const d5 = R.R(30, 310);
    if (((this.scroll - d5 + 448) % 640) < 128) return;   // ring buffer seam
    const v = d5 - 40 - this.scroll;
    if (R.R(1, 2) === 1) this.spawn('rocketR', -61, v);
    else this.spawn('rocketL', 351, v);
  }

  // fn3_285A: boss and barricade machines appear with the top of the arena.
  arenaTriggers() {
    if (this.scroll !== BOSS_AT) return;
    this.spawn('boss', 127, 1 - LEVEL_END);
    for (const mx of this.L().machines || []) this.spawn('machine', mx, 29 - LEVEL_END);
  }

  // ------------------------------------------------------------------ the player
  // fn2_35CE / fn2_6C9A
  setup_ship(s) {
    s.kind = 5; s.layer = 20; s.hot = [3, 3, 33, 33]; s.code = SHIP; s.face = 170;
    s.timer = 10; s.bombCd = BOMB_GAP;               // fn2_35CE 3650
    s.task = this.task_ship; s.hit = null;
  }
  setup_clone(s) { this.setup_ship(s); s.task = this.task_ship; }

  // fn2_365E (ship) and fn2_6D2A (clone).
  task_ship = (s) => {
    const K = this.keys, inv = this.invuln || this.god;
    s.bombCd--;
    if (this.scroll < LEVEL_END) s.v -= 1;
    s.face = inv ? 246 : 170;
    if (K.left) { s.x -= 4; s.face = inv ? 248 : 172; }
    if (K.right) { s.x += 4; s.face = inv ? 247 : 171; }
    if (K.up) s.v -= 4;
    if (K.down) s.v += 4;
    s.timer--;
    const lead = s === this.ship1;
    // The lead stops short of the edges so its wing ships stay on screen: x 32 and up with a
    // clone on the left, as in the original, and 291 minus the offset with one on the right.
    let minX = 0, maxX = 291;
    if (lead) for (const w of this.wing) {
      if (w.off < 0) minX = Math.max(minX, -w.off - 1);
      if (w.off > 0) maxX = Math.min(maxX, 291 - w.off);
    }
    if (s.x > maxX) s.x = maxX;
    if (s.x < minX) s.x = minX;
    if (lead && this.flyIn && s.v < 159 - this.checkpoint) this.flyIn = false;
    if (lead && this.flyIn) s.v -= 6;
    else {
      if (this.sy(s) > 314) s.v = 314 - this.scroll;
      if (this.sy(s) < 0) s.v = -this.scroll;
    }
    if (!lead && this.ship1) {                       // fn2_6D2A 6F6A: held in formation
      // A wing left 66 px out when the lead between was lost slides in at flying speed.
      const want = 33 * s.slot;
      if (s.off !== want) s.off += Math.max(-4, Math.min(4, want - s.off));
      s.x = this.ship1.x + s.off; s.v = this.ship1.v;
    }
    if (K.fire && s.timer < 1) {
      this.spawn('missile', s.x + 9, s.v);
      this.snd(SND.shot, 1);
      s.timer = this.fireCooldown;
    }
    if (K.bomb && s.bombCd < 1) {
      this.spawn('sightFlash', s.x + 13, s.v - 120);
      s.bombCd = BOMB_GAP;                             // fn2_365E 3948
      this.spawn('bomb', s.x + 13, s.v, b => { b.ship = s; });
      this.snd(SND.bombDrop, 4);
    }
  };

  setup_reticle(s) { s.layer = 15; s.face = 182; s.task = this.task_reticle; }
  task_reticle = (s) => {                              // fn2_3C88 / fn2_3CC8
    if (!s.ship) return;
    s.x = s.ship.x + 13; s.v = s.ship.v - 120;
  };
  setup_sightFlash(s) {                                // fn2_3C22: 50 ticks
    s.layer = 15; s.face = 182; s.task = this.task_sightFlash;
    s.life = Math.max(1, Math.round(50 * (1000 / 60) / this.frameMs));
  }
  task_sightFlash = (s) => { if (--s.life <= 0) this.kill(s); };

  // fn2_2778, fn2_27BA, fn2_281A
  setup_missile(s) {
    s.kind = 5; s.layer = 6; s.face = 400; s.hot = [4, 0, 12, 16];
    s.task = this.task_missile; s.hit = this.hit_missile;
  }
  task_missile = (s) => { s.v -= 16; if (this.aboveScreen(s)) this.kill(s); };
  hit_missile = (me, him) => {
    if (him.code === AIR) { this.kill(me); this.kill(him); this.addScore(10); }
    if (him.code === ROCKET) this.addScore(5);
    if (him.code === BOSS) {
      him.hp--; this.kill(me);
      if (him.hp < 1) { this.kill(him); this.addScore(200); this.complete = true; }
    }
    if (him.code === MACHINE) {
      him.hp--; this.kill(me);
      if (him.hp < 1) this.kill(him);
    }
    if (him.code === YUMMY) this.kill(him);
    if (him.code === GROUND || him.flag === 10000) return;
    this.debrisAt(him);
  };

  // fn2_3D3A / fn2_3DA8, fn2_3E16, fn2_3F4C
  setup_bomb(s) {
    s.kind = 5; s.layer = 15; s.face = 1999; s.hot = [0, 0, 8, 16];
    s.task = this.task_bomb; s.hit = this.hit_bomb;
    s.armed = 0; s.exploded = 0; s.code = BOMB;
    s.target = (s.ship ? s.ship.v : s.v) - 120;
  }
  task_bomb = (s) => {
    s.v -= 5;
    if (this.aboveScreen(s)) this.kill(s);
    if (s.armed === 1) {
      if (!s.exploded) {
        this.snd(SND.boom, 3);
        this.spawn('crater', s.x - 32, s.v - 48);
        s.exploded = 1;
      }
      this.kill(s);
    }
    if (s.v > s.target - 4 && s.v < s.target + 4) s.armed = 1;
  };
  hit_bomb = (me, him) => {
    this.snd(SND.boom, 3);
    if (me.armed !== 1) return;
    if (!me.exploded) { this.spawn('crater', me.x - 32, me.v - 32); me.exploded = 1; }
    if (him.code === MACHINE) {
      him.hp--;
      if (him.hp < 1) { this.kill(him); this.addScore(100); }
    }
    if (him.code === BOSS) {
      him.hp--;
      if (him.hp < 1) { this.kill(him); this.addScore(200); this.complete = true; }
    }
    if (him.code === GROUND) {
      if (him.flag === 10000) { if (him.mode > 4 && him.mode < 30) him.mode = 2000; }
      else this.kill(him);
      this.kill(me);
      this.addScore(50);
    }
  };

  // ------------------------------------------------------------------ decoration
  setup_hittext(s) {                                   // fn2_141A
    this.snd(SND.boom, 3);
    s.layer = 12; s.mode = 1;
    const d = this.rng.R(1, 5);
    s.seq = HIT_TEXT[d - 1] || null;
    s.task = s.seq ? this.task_hittext : null;
  }
  task_hittext = (s) => {
    if (s.mode <= 8) s.face = s.seq[s.mode - 1];
    if (++s.mode === 15) this.kill(s);
  };
  setup_debris(s) { s.layer = 8; s.mode = 1; s.task = this.task_debris; }   // fn2_151A
  task_debris = (s) => {                               // fn2_15CA
    if (s.mode <= 4) s.face = 224 + s.mode;
    if (++s.mode === 5) this.kill(s);
  };
  setup_crater(s) { s.layer = 12; s.mode = 1; s.task = this.task_crater; }  // fn2_159E
  task_crater = (s) => {                               // fn2_1624
    if (s.mode === 1) this.events.push({ t: 'crater', x: s.x + 16, v: s.v + 32 });
    const F = { 1: 229, 4: 230, 7: 231, 10: 232, 14: 233, 19: 234, 25: 244 };
    if (F[s.mode]) s.face = F[s.mode];
    if (++s.mode === 30) this.kill(s);
  };

  // ------------------------------------------------------------------ enemy shots
  setup_orb(s) {                                       // fn2_10C8: straight down
    s.kind = -5; s.layer = 11; s.face = 401; s.hot = [0, 0, 8, 8];
    s.task = this.task_orb; s.hit = this.hit_shot; s.sh = 0; s.sv = 6;
  }
  setup_aimed(s) {                                     // fn2_001E / fn2_041C / fn2_081A
    this.setup_orb(s);
    this.aim(s, s.fromX, s.fromV);
  }
  task_orb = (s) => {                                  // fn2_0C50
    if (this.smart) { this.smartEffect(s); this.kill(s); }
    if (!this.frozen) { s.v += s.sv; s.x += s.sh; }
    if (s.x < -1 || s.x > W - 1) this.kill(s);
    if (this.aboveScreen(s) || this.belowScreen(s)) this.kill(s);
  };
  setup_flame(s) {                                     // fn2_0C10
    s.kind = -5; s.layer = 11; s.face = 215; s.hot = [0, 0, 8, 8];
    s.task = this.task_flame; s.hit = this.hit_shot;
  }
  task_flame = (s) => {                                // fn2_0D60: the smart bomb does not kill it
    if (this.smart) this.smartEffect(s);
    if (!this.frozen) s.v += 10;
    if (this.belowScreen(s)) this.kill(s);
  };
  hit_shot = (me, him) => {                            // fn2_0DCE
    if (!this.invuln && him.code === SHIP) this.killShip(him);
    if (him.code === BOMB) return;
    this.kill(me);
    this.spawn('hittext', me.x - 16, me.v - 16);
  };
  fireStraight(x, v) { this.spawn('orb', x, v); }
  fireAimed(x, v, fromX, fromV) { this.spawn('aimed', x, v, s => { s.fromX = fromX; s.fromV = fromV; }); }

  // ------------------------------------------------------------------ air units
  setup_air(s) {                                       // fn2_1BE8
    const A = this.L().air;
    s.hot = A.hot.slice(); s.sh = 0; s.sv = -2;
    s.timer = this.fireTimerReset(); s.face = A.faces[0];
    s.task = this.task_air; s.layer = 13; s.kind = -5; s.mode = 0; s.code = AIR;
    s.dir = this.rng.R(1, 2) === 1 ? 1 : 2;
    s.hit = this.hit_air;
  }
  task_air = (s) => {                                  // fn2_1CC6
    const lv = this.levelNo, A = this.L().air;
    if (this.smart) this.smartEffect(s);
    s.timer--;
    if (this.rng.R(1, this.L().dirChance) === 1) s.dir++;
    if (s.dir === 3) s.dir = 1;
    if (!this.frozen) s.v += this.bossPhase ? 4 : 1;
    if (s.x < -1) s.x = -1;
    if (s.x > 289) s.x = 289;
    if (!this.frozen) s.x += s.dir === 1 ? -lv : lv;
    s.face = A.faces[s.mode]; if (++s.mode === 6) s.mode = 0;
    if (this.belowScreen(s)) this.kill(s);
    if (!this.frozen && s.timer < 1) {
      if (!(this.bossPhase && this.sy(s) > 149)) {
        if (lv < 3) this.fireStraight(s.x + 12, s.v);
        else this.fireAimed(s.x + 12, s.v, s.x, s.v);
      }
      this.snd(SND.foeShot, 1);
      s.timer = this.fireTimerReset();
    }
  };
  hit_air = (me, him) => {                             // fn2_2142
    if (!this.invuln && him.code === SHIP) this.killShip(him);
    if (him.code !== SHIP) return;
    this.kill(me); this.addScore(10);
    if (me.flag !== 10000) this.debrisAt(me);
  };

  // ------------------------------------------------------------------ rockets
  setup_rocketR(s) { this.setupRocket(s, 0); s.task = this.task_rocketR; }
  setup_rocketL(s) { this.setupRocket(s, 1); s.task = this.task_rocketL; }
  setupRocket(s, side) {                               // fn2_6332 / fn2_63B4
    const F = this.L().rocketFaces[side];
    s.faces = F; s.face = F[0];
    s.code = ROCKET; s.kind = -5; s.layer = 6; s.hot = [0, 10, 32, 22]; s.mode = 1;
    s.hit = this.hit_rocket;
  }
  rocketAnim(s) {
    if (++s.mode === 5) s.mode = 1;
    if (s.mode === 1) s.face = s.faces[0];
    else if (s.mode === 3) s.face = s.faces[1];
  }
  task_rocketR = (s) => {                              // fn2_6436
    if (this.smart) this.smartEffect(s);
    if (!this.frozen) s.x += 4;
    if (s.x > W - 1) this.kill(s);
    this.rocketAnim(s);
  };
  task_rocketL = (s) => {                              // fn2_6500
    if (this.smart) this.smartEffect(s);
    if (!this.frozen) s.x -= 4;
    if (s.x < -33) this.kill(s);
    this.rocketAnim(s);
  };
  hit_rocket = (me, him) => {                          // fn2_65CA
    if (!this.invuln && him.code === SHIP) this.killShip(him);
    if (him.code === SHIP) this.addScore(5);
    if (him.code === BOMB) return;
    this.kill(me);
    this.spawn('hittext', me.x - 16, me.v - 16);
  };

  // ------------------------------------------------------------------ ground units
  // Level 1 submarine, fn2_2FC2 / fn2_3042
  setup_sub(s) {
    s.sh = 1; s.sv = 1; s.mode = 0; s.task = this.task_sub; s.layer = 2; s.kind = -5;
    s.hot = [0, 0, 32, 32]; s.timer = this.fireTimerReset(); s.code = GROUND;
    s.face = s.dir === 1 ? 600 : 601;
  }
  task_sub = (s) => {
    if (this.smart) this.smartEffect(s);
    s.timer--;
    const a = s.dir === 1 ? [604, 600, 605, 600] : s.dir === 2 ? [602, 601, 603, 601] : null;
    if (a) {
      if (s.mode === 20) s.face = a[0];
      else if (s.mode === 30) s.face = a[1];
      else if (s.mode === 40) s.face = a[2];
      else if (s.mode === 49) s.face = a[3];
    }
    if (++s.mode === 50) s.mode = 0;
    const turns = SUB_TURNS[s.idx];
    if (turns && turns.includes(s.mapo)) { s.dir++; s.face = 204; }
    if (s.dir === 3) s.dir = 1;
    if (!this.frozen) {
      if (s.dir === 1) s.x += s.sh;
      else if (s.dir === 2) s.x -= s.sh;
      s.v += s.sv;
      s.mapo -= s.sv;
    }
    if (s.x > W + 40 || s.x < -41) this.kill(s);
    if (this.belowScreen(s)) this.kill(s);
    if (!this.frozen && s.timer < 1) {
      this.fireStraight(s.x + 12, s.v);
      this.snd(SND.foeShot, 1);
      s.timer = this.fireTimerReset();
    }
  };

  // Level 2 walking TV, fn2_45E4 / fn2_4652
  setup_tele(s) {
    s.face = 192; s.mode = 1; s.task = this.task_tele; s.layer = 2; s.kind = -5;
    s.hot = [15, 16, 51, 40]; s.timer = this.fireTimerReset(); s.walk = 0; s.code = GROUND;
  }
  task_tele = (s) => {
    if (this.smart) this.smartEffect(s);
    s.timer--;
    if (!this.frozen) s.walk++;
    if (s.walk < 150) {
      if (!this.frozen) s.v += 1;
      const F = { 0: 192, 3: 193, 6: 194, 9: 195, 12: 194, 15: 193 };
      if (F[s.mode] !== undefined) s.face = F[s.mode];
      if (++s.mode === 18) s.mode = 0;
    } else {
      const F = { 19: 222, 22: 223, 25: 224 };
      if (F[s.mode] !== undefined) s.face = F[s.mode];
      if (++s.mode === 28) s.mode = 19;
    }
    if (this.belowScreen(s)) this.kill(s);
    if (!this.frozen && s.timer < 1) {
      s.timer = s.walk < 140 ? this.fireTimerReset() : 5;
      this.fireAimed(s.x + 24, s.v + 16, s.x, s.v);
      this.snd(SND.foeShot, 1);
    }
  };

  // Level 3 jack-in-the-box, fn2_4364 / fn2_43CE
  setup_jack(s) {
    s.mode = this.frozen ? 5 : 0; s.flag = 10000; s.task = this.task_jack; s.layer = 1;
    s.kind = -8; s.hot = [32, 0, 64, 32]; s.timer = 0; s.face = 187; s.code = GROUND;
  }
  task_jack = (s) => {
    if (this.smart) { s.mode = 2000; this.smartEffect(s); }
    if (!this.frozen && s.mode !== 2000) {
      const F = { 1: 183, 2: 184, 3: 185, 4: 186, 5: 187, 30: 186, 31: 185, 32: 184, 33: 183 };
      if (F[s.mode] !== undefined) s.face = F[s.mode];
    }
    if (s.mode !== 2000) {
      if (!this.frozen) s.mode++;
      if (s.mode === 80) s.mode = 0;
    } else s.face = 188;
    if (this.belowScreen(s)) this.kill(s);
    if (!this.frozen && s.mode === 5) {
      if (this.diff < 3) this.fireStraight(s.x + 48, s.v + 16);
      else this.fireAimed(s.x + 48, s.v + 16, s.x, s.v);
      this.snd(SND.foeShot, 1);
    }
  };

  // Level 4 fan drone, fn2_4818 / fn2_4872
  setup_drone(s) {
    s.mode = 0; s.task = this.task_drone; s.layer = 2; s.kind = -5; s.hot = [0, 0, 40, 32];
    // fn2_4818 sets no face; the task picks one from the fan's frame, which a freeze holds at 0.
    s.timer = this.fireTimerReset(); s.code = GROUND; s.face = this.H.dronesVisibleInFreeze ? 10000 : 0;
  }
  task_drone = (s) => {
    if (this.smart) this.smartEffect(s);
    s.timer--;
    if (s.mode >= 1 && s.mode <= 4) s.face = 9999 + s.mode;
    if (!this.frozen) s.mode++;
    if (s.mode > 4) s.mode = 1;
    if (this.belowScreen(s)) this.kill(s);
    if (!this.frozen && s.timer < 1) {
      this.fireAimed(s.x + 12, s.v, s.x, s.v);
      this.snd(SND.foeShot, 1);
      s.timer = this.fireTimerReset();
    }
  };

  // ------------------------------------------------------------------ boss and machines
  setup_boss(s) {                                      // fn2_3A4E
    const B = this.L().boss;
    s.face = B.faces[0]; s.hp = B.hp; s.mode = 1; s.layer = 2;
    s.task = this.task_boss; s.code = BOSS; s.hot = [0, 0, 64, 20]; s.kind = -6; s.timer = 30;
  }
  task_boss = (s) => {                                 // fn2_3AE8
    s.timer--;
    if (s.timer < 1) {
      for (const dx of [20, 40]) this.fireAimed(s.x + dx, s.v + 55, s.x + dx, s.v + 55);
      this.snd(SND.foeShot, 1);
      s.timer = 30;
    }
    const F = this.L().boss.faces;
    if (s.hp < 2) s.face = F[2];
    else if (s.hp < 4) s.face = F[1];
  };
  setup_machine(s) {                                   // fn2_6192
    s.hp = 10; s.face = 205; s.mode = 1; s.layer = 10; s.task = this.task_machine;
    s.code = MACHINE; s.hot = [0, 0, 64, 64]; s.kind = -6; s.timer = 30;
  }
  task_machine = (s) => {                              // fn2_61E2
    s.timer--;
    if (!this.frozen && s.timer < 1) {
      this.spawn('flame', s.x + 5, s.v + 5);
      this.spawn('flame', s.x + 59, s.v + 5);
      this.snd(SND.foeShot, 1);
      s.timer = 30;
    }
  };

  // ------------------------------------------------------------------ yummies
  setup_yummy(s) {                                     // fn2_49EA and friends
    const Y = this.cfg.yummies[s.ykind];
    s.kind = -2; s.layer = 6; s.face = Y.sprite; s.hot = [0, 0, 28, 28];
    s.task = this.task_yummy; s.hit = this.hit_yummy; s.mode = 0; s.code = YUMMY;
  }
  task_yummy = (s) => {                                // fn2_4BA6
    s.v += 1;
    if (this.belowScreen(s)) this.kill(s);
  };
  hit_yummy = (me, him) => {
    if (him.code !== SHIP) return;
    this.kill(me);
    this.yummiesTaken++;
    switch (me.ykind) {
      case 'extraman': this.lives++; break;                                    // fn2_4BEC
      case 'rapidfire':                                                        // fn2_4C42
        this.fireCooldown = 5; this.rapid = true; this.rapidT = this.H.rapidFireFrames; break;
      case 'clone': this.addClone(); break;                                    // fn2_4C74
      case 'protection':                                                       // fn2_4CDE
        this.prot = 640; this.invuln = true; this.events.push({ t: 'beep' }); break;
      case 'freeze':                                                           // fn2_4D10
        this.events.push({ t: 'beep' }); this.freezeT = 600; this.frozen = true; break;
      case 'smartbomb':                                                        // fn2_4D42
        this.smartT = 2; this.smart = true; break;
    }
    this.events.push({ t: 'yummy', kind: me.ykind });
    this.events.push({ t: 'hud' });
  };

  // ------------------------------------------------------------------ cheats and tools
  forceLevelComplete() {
    if (this.phase !== 'play' && this.phase !== 'boss') return false;
    this.complete = true;
    this.sprites.forEach(s => { if (s.code === BOSS || s.code === MACHINE) this.kill(s); });
    this.phase = 'complete'; this.pf = 0;
    return true;
  }
  // QA shortcut (the bbb cheat): skip to 100 frames before the arena trigger. Enemies and
  // shots go, the ships keep their place on screen, and the waves pick up from there.
  jumpToBoss(at = BOSS_AT - 100) {
    if (this.phase !== 'play' || this.scroll >= at) return false;
    const keep = new Set([this.ship1, this.ret1]);
    for (const w of this.wing) { keep.add(w); keep.add(w.ret); }
    this.sprites = this.sprites.filter(x => keep.has(x));
    const d = at - this.scroll;
    for (const x of this.sprites) { x.v -= d; x.pv = x.v; x.px = x.x; }
    this.scroll = at; this.prevScroll = at; this.flyIn = false;
    const B = this.badg[this.L().id];
    this.waveIdx = B.findIndex(e => e.y >= at);
    if (this.waveIdx < 0) this.waveIdx = B.length;
    return true;
  }
  snapshot() {
    const c = {};
    for (const s of this.sprites) c[s.name] = (c[s.name] || 0) + 1;
    return { phase: this.phase, level: this.levelNo, scroll: this.scroll, score: this.score,
      lives: this.lives, diff: this.diff, rapid: this.rapid, rapidT: this.rapidT, clones: this.clones,
      prot: this.prot, freeze: this.freezeT, waveIdx: this.waveIdx, groundCount: this.groundCount,
      checkpoint: this.checkpoint, sprites: c };
  }
}
