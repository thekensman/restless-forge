// test/harness.mjs - checks build 26 against what the original 68k code does.
//
//   node test/harness.mjs .
//
// Every expectation below comes from the disassembly (see REVERSE_ENGINEERING.md), not
// from the implementation, so a change that drifts away from the original fails here.
// Those checks run with the house rules switched off. The house rules (config.houseRules,
// deliberate departures Ken asked for) get their own section at the end.
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = path.resolve(process.argv[2] || '.');
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const cfg = JSON.parse(rd('data/config.json'));
const levels = JSON.parse(rd('data/levels.json'));
const badg = JSON.parse(rd('data/enemies.json'));
const manifest = JSON.parse(rd('data/manifest.json'));
const { Sim, Rng, SUB_TURNS, LEVEL_END, BOSS_AT, BOMB_GAP } = await import(pathToFileURL(path.join(ROOT, 'js/sim.js')).href);
const HS = await import(pathToFileURL(path.join(ROOT, 'js/scores.js')).href);

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n         got  ${g}\n         want ${w}`); }
};
const ok = (label, cond, note = '') => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${note}`); }
};
const section = t => console.log('\n' + t);

// The original rules: the same config with the house rules taken out.
const cfgOrig = JSON.parse(JSON.stringify(cfg)); delete cfgOrig.houseRules;
const mkWith = (conf, diff = 1, lvl = 0, carry = {}, seed = 7) => {
  const s = new Sim(conf, { badg }, { seed, frameMs: conf.timing.frameMs[String(diff)] });
  s.newGame(diff, lvl, carry);
  return s;
};
const mk = (...a) => mkWith(cfgOrig, ...a);
const mkHouse = (...a) => mkWith(cfg, ...a);
const run = (s, n, keys = {}) => { for (let i = 0; i < n; i++) { s.step(keys); s.events.length = 0; } };
const byName = (s, n) => s.sprites.filter(x => x.name === n);
const sy = (s, sp) => sp.v + s.scroll;
// Remove everything except the player, so a test sees only what it sets up.
const quiet = s => {
  s.sprites = s.sprites.filter(x => x.name === 'ship' || x.name === 'reticle' || x.name === 'clone');
  s.rocketSpawner = () => {}; s.waveSpawner = () => {}; s.yummySpawner = () => {};
};

// ---------------------------------------------------------------------------
section('Build and assets');
const html = rd('index.html');
eq('config build', cfg.build, '26');
ok('index.html BUILD constant is 26', /const BUILD='26'/.test(html));
ok('no stale ?v=25 stamps in index.html', !/v=25/.test(html));
for (const f of ['js/game.js', 'js/core.js']) ok(`no stale ?v=25 in ${f}`, !/v=25/.test(rd(f)));
ok('raw PICT_136 (old address) is not shipped', !fs.existsSync(path.join(ROOT, 'assets/ui/PICT_136.png')));
{
  const base = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  ok('canonical URL set and ends with a slash', !!base && base.endsWith('/'));
  for (const m of html.matchAll(/(?:og:url|og:image|twitter:image)" content="([^"]+)"/g))
    ok(`share URL ${m[1].replace(base, '…/')} sits under the canonical address`, m[1].startsWith(base));
  const png = fs.readFileSync(path.join(ROOT, 'assets/ui/share.png'));
  eq('share image is 1200 x 630', [png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
  ok('favicon present', fs.existsSync(path.join(ROOT, 'assets/ui/icon.png')));
}
ok('no font or script requests outside the site', !/fonts\.googleapis|fonts\.gstatic|<script[^>]+src="https?:/i.test(html));
for (const m of html.matchAll(/url\((assets\/fonts\/[^)?]+)/g)) ok(`font file ${m[1]}`, fs.existsSync(path.join(ROOT, m[1])));
// Images written into the markup (the memorial photo that RF's `npm run sync` copies in).
for (const m of html.matchAll(/<img[^>]+src="(assets\/[^"?]+)/g)) ok(`image ${m[1]}`, fs.existsSync(path.join(ROOT, m[1])));
for (const f of ['OFL-DMSerifDisplay.txt', 'OFL-IBMPlexMono.txt', 'OFL-Lora.txt']) ok(`font licence ${f}`, fs.existsSync(path.join(ROOT, 'assets/fonts', f)));
ok('no donation links on this page (restored games carry none)', !/ko-fi\.com|buymeacoffee|patreon\.com|paypal\.me|github\.com\/sponsors/i.test(html));
ok('PICT_136 is not preloaded', !manifest.ui.includes('PICT_136'));
for (const id of manifest.sprites) {
  if (!fs.existsSync(path.join(ROOT, `assets/sprites/cicn_${id}.png`))) { fail++; console.log('  FAIL missing sprite ' + id); }
}
ok(`all ${manifest.sprites.length} manifest sprites exist`, true);
for (const u of manifest.ui) ok(`ui asset ${u}`, fs.existsSync(path.join(ROOT, `assets/ui/${u}.png`)));
for (const sname of manifest.sounds) ok(`sound ${sname}`, fs.existsSync(path.join(ROOT, `assets/sounds/${sname}.wav`)));

section('Levels, banks, arenas, music (CODE 3 and the main loop)');
eq('tile banks by level', cfg.levels.map(l => l.tileBank), ['desert', 'industrial', 'blueplate', 'bunker']);
eq('arena art by level', cfg.levels.map(l => l.arena), ['arena_1', 'arena_2', 'arena_3', 'arena_4']);
eq('music snd by level', cfg.levels.map(l => l.music.snd), [135, 133, 136, 138]);
eq('music restart period (ticks)', cfg.levels.map(l => l.music.periodTicks), [510, 355, 340, 300]);
eq('title music', [cfg.sounds.title, cfg.sounds.titlePeriodTicks], [134, 280]);
eq('briefings', cfg.levels.map(l => l.briefing), ['PICT_173', 'PICT_174', 'PICT_175', 'PICT_176']);
eq('frame period by difficulty (ms)', [1, 2, 3].map(d => cfg.timing.frameMs[d]), [35, 30, 25]);
for (const id of ['128', '129', '130', '131']) {
  eq(`Levl ${id} is 10x200`, levels[id].length, 2000);
  eq(`BadG ${id} has 150 entries`, badg[id].length, 150);
  const ys = badg[id].filter(e => e.y > 1).map(e => e.y);
  ok(`BadG ${id} triggers strictly increase`, ys.every((y, i) => i === 0 || y > ys[i - 1]));
}

section('RNG (fn6_1562, fn2_19A8)');
const r = new Rng(1);
eq('ANSI rand() sequence', [r.rand(), r.rand(), r.rand()], [16838, 5758, 10113]);
const r2 = new Rng(99); const vals = new Set();
for (let i = 0; i < 4000; i++) vals.add(r2.R(1, 2));
eq('Random(1,2) gives 1 or 2', [...vals].sort(), [1, 2]);

section('Player (fn2_35CE, fn2_365E)');
{
  const s = mk(); quiet(s);
  eq('lives at start', s.lives, 5);
  const p = s.ship1;
  eq('ship starts at x 119, below the playfield', [p.x, sy(s, p)], [119, 349]);
  run(s, 40);
  ok('fly-in stops near y 181', Math.abs(sy(s, p) - 181) <= 2, `y=${sy(s, p)}`);
  const x0 = p.x; run(s, 5, { right: true });
  eq('4 px per frame sideways', p.x - x0, 20);
  eq('right bank face is 171', p.face, 171);
  run(s, 1, { left: true });
  eq('left bank face is 172', p.face, 172);
  const y0 = sy(s, p); run(s, 3);
  eq('ship holds its screen position while scrolling', sy(s, p), y0);
  run(s, 200, { left: true }); eq('left limit x 0', p.x, 0);
  run(s, 200, { right: true }); eq('right limit x 291', p.x, 291);
  // the ship task clamps to y 314 / 0, then the view scrolls one row, so it shows at 315 / 1
  run(s, 200, { down: true }); eq('bottom limit y 314 (shown at 315 after the scroll)', sy(s, p), 315);
  run(s, 200, { up: true }); eq('top limit y 0 (shown at 1 after the scroll)', sy(s, p), 1);
  const ret = s.ret1; run(s, 1);
  // the sight's task runs before the ship's, so while scrolling it trails by the 1 px scroll
  eq('bomb sight 120 px ahead at x+13 (119 shown while scrolling)', [ret.x - p.x, ret.v - p.v], [13, -119]);
  eq('bomb sight copies the ship from the frame before', [ret.x - p.px, ret.v - p.pv], [13, -120]);
}
{
  const s = mk(); quiet(s); run(s, 40);
  const shots = []; const t0 = s.frame;
  for (let i = 0; i < 60; i++) { s.step({ fire: true }); s.events.forEach(e => { if (e.t === 'snd' && e.id === 130) shots.push(s.frame - t0); }); s.events.length = 0; }
  eq('fires every 10 frames', shots.slice(1, 4).map((f, i) => f - shots[i]), [10, 10, 10]);
  const m = byName(s, 'missile')[0];
  const y0 = sy(s, m); run(s, 1);
  eq('missile climbs 15 px per frame on screen', y0 - sy(s, m), 15);
  s.fireCooldown = 5; s.rapid = true;
  const s2 = []; const t1 = s.frame;
  for (let i = 0; i < 30; i++) { s.step({ fire: true }); s.events.forEach(e => { if (e.t === 'snd' && e.id === 130) s2.push(s.frame - t1); }); s.events.length = 0; }
  eq('rapid fire every 5 frames', s2.slice(2, 4).map((f, i) => f - s2[i + 1]), [5, 5]);
}
{
  const s = mk(); quiet(s);
  const drops = []; const t0 = s.frame;
  for (let i = 0; i < 130; i++) { s.step({ bomb: true }); s.events.forEach(e => { if (e.t === 'snd' && e.id === 137) drops.push(s.frame - t0); }); s.events.length = 0; }
  eq('bombs: first one 30 frames after the ship appears, then one every 30 (gm9890)', drops, [30, 60, 90, 120]);
  eq('the cooldown constant is 30', BOMB_GAP, 30);
}
{
  const s = mk(); quiet(s); run(s, 40);
  let most = 0;
  for (let i = 0; i < 120; i++) { s.step({ bomb: true }); s.events.length = 0; most = Math.max(most, byName(s, 'bomb').length); }
  eq('holding the bomb key never has more than one bomb in the air', most, 1);
}

section('Bombs (fn2_3D3A, fn2_3E16, fn2_3F4C)');
{
  const s = mk(); quiet(s); run(s, 40);
  const p = s.ship1;
  s.step({ bomb: true }); s.events.length = 0;
  const b = byName(s, 'bomb')[0];
  eq('bomb targets the ground point 120 px above the ship', b.target, p.v - 120);
  // a ground unit sitting on the target point
  const sub = s.spawn('sub', b.x - 12, b.target - 8, u => { u.dir = 1; u.mapo = 99999; });
  sub.sv = 0; sub.sh = 0; sub.timer = 9999;
  let craters = 0;
  for (let i = 0; i < 44; i++) { s.step({}); craters += s.events.filter(e => e.t === 'crater').length; s.events.length = 0; }
  ok('bomb kills a ground unit where it lands', !sub.task);
  eq('ground unit scores 50 on Easy', s.score, 50);
  ok('a crater is stamped', craters >= 1);
}
{
  const s = mk(); quiet(s); run(s, 40);
  const p = s.ship1;
  // ground unit right in front of the ship: the bomb flies over it, unarmed
  const sub = s.spawn('sub', p.x + 1, p.v - 40, u => { u.dir = 1; u.mapo = 99999; });
  sub.sv = 0; sub.sh = 0; sub.timer = 9999;
  s.step({ bomb: true }); run(s, 40);
  ok('an unarmed bomb passes over ground units', !!sub.task);
}

section('Waves (fn3_234A, fn3_2728, fn3_2606, fn3_24E4)');
{
  const s = mk(1, 0, {}, 3); s.god = true;
  const names = {}; const seen = new Set();
  for (let i = 0; i < 6400; i++) {
    s.step({}); s.events.length = 0;
    for (const sp of s.sprites) if (!seen.has(sp.id)) { seen.add(sp.id); names[sp.name] = (names[sp.name] || 0) + 1; }
  }
  eq('all level 1 waves consumed by scroll 6400', s.waveIdx, badg['128'].filter(e => e.y > 1).length);
  eq('ground unit counter reaches 30', s.groundCount, 30);
  ok('level 1 ground units are submarines', names.sub > 0 && !names.tele && !names.jack && !names.drone);
  ok('level 1 air units appear', names.air > 50);
}
{
  const kinds = {};
  for (const [lv, want] of [[0, 'sub'], [1, 'tele'], [2, 'jack'], [3, 'drone']]) {
    const s = mk(1, lv); s.god = true; run(s, 2500);
    kinds[lv] = cfg.levels[lv].ground;
    eq(`level ${lv + 1} ground unit`, cfg.levels[lv].ground, want);
  }
  eq('air faces by level', cfg.levels.map(l => l.air.faces[0]), [133, 235, 203, 202]);
}
{
  // level 1 deletes submarines 3-7, 17, 19, 20, 25-27 and #1 on Easy
  const s = mk(1, 0); s.god = true; quiet(s); s.waveSpawner = Sim.prototype.waveSpawner;
  const alive = [];
  for (let i = 0; i < 6400; i++) {
    const before = s.groundCount;
    s.step({}); s.events.length = 0;
    if (s.groundCount > before) { const u = s.sprites.find(x => x.name === 'sub' && x.idx === s.groundCount); alive.push([s.groundCount, !!(u && u.task)]); }
  }
  eq('level 1 submarines that survive spawning',
    alive.filter(a => a[1]).map(a => a[0]), [2, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 21, 22, 23, 24, 28, 29, 30]);
}
{
  const s = mk(2, 0); s.god = true; quiet(s); s.waveSpawner = Sim.prototype.waveSpawner;
  run(s, 260);
  ok('on Medium the first submarine survives', s.sprites.some(x => x.name === 'sub' && x.idx === 1));
}
{
  // turn table: submarine 8 turns at map offset 1090
  const s = mk(); quiet(s);
  const u = s.spawn('sub', 100, -50 - s.scroll, x => { x.dir = 1; x.mapo = 1095; });
  u.idx = 8; u.timer = 9999;
  const xs = []; for (let i = 0; i < 12; i++) { s.step({}); s.events.length = 0; xs.push(u.x); }
  eq('submarine 8 reverses at offset 1090', xs, [101, 102, 103, 104, 105, 104, 103, 102, 101, 100, 99, 98]);
  eq('turn table keys', Object.keys(SUB_TURNS).length, 25);
  const y0 = sy(s, u); run(s, 1);
  eq('submarine moves 2 px per frame down the screen', sy(s, u) - y0, 2);
}

section('Air units (fn2_1BE8, fn2_1CC6)');
{
  const s = mk(1, 0); quiet(s);
  const a = s.spawn('air', 150, -100 - s.scroll);
  a.dir = 1;
  s.cfg.levels[0].dirChance = 1e9;
  const x0 = a.x, y0 = sy(s, a); run(s, 10);
  eq('level 1 air unit: 1 px/frame sideways, 2 px/frame down the screen', [x0 - a.x, sy(s, a) - y0], [10, 20]);
  s.cfg.levels[0].dirChance = 30;
  const shots = []; const t0 = s.frame;
  for (let i = 0; i < 90; i++) { s.step({}); s.events.forEach(e => { if (e.t === 'snd' && e.id === 129) shots.push(s.frame - t0); }); s.events.length = 0; }
  ok('air unit fires every 40 frames on Easy', shots.length >= 2 && shots[1] - shots[0] === 40, JSON.stringify(shots));
  const o = byName(s, 'orb')[0];
  ok('level 1 air shots fall straight down', o && o.sh === 0 && o.sv === 6);
}
{
  const s = mk(1, 3); quiet(s);
  const a = s.spawn('air', 150, -100 - s.scroll); a.dir = 2;
  s.cfg.levels[3].dirChance = 1e9;
  const x0 = a.x; run(s, 5);
  eq('level 4 air unit moves 4 px/frame sideways', a.x - x0, 20);
  s.cfg.levels[3].dirChance = 15;
  a.timer = 1; s.ship1.x = 10; run(s, 1);
  const o = byName(s, 'aimed')[0];
  ok('level 4 air shots are aimed', o && o.sh < 0);
}

section('Rockets (fn3_57D6, fn2_6436)');
{
  const s = mk(); quiet(s);
  const rk = s.spawn('rocketR', -61, 100 - s.scroll);
  const x0 = rk.x; run(s, 3);
  eq('rocket speed 4 px per frame', rk.x - x0, 12);
  eq('level 1 rocket faces', [cfg.levels[0].rocketFaces[0], cfg.levels[0].rocketFaces[1]], [[15000, 15008], [15001, 15009]]);
  const s2 = mk(1, 1); s2.god = true; let n = 0; const seen = new Set();
  for (let i = 0; i < 6000; i++) { s2.step({}); s2.events.length = 0; for (const sp of s2.sprites) if (sp.name.startsWith('rocket') && !seen.has(sp.id)) { seen.add(sp.id); n++; } }
  ok('about one rocket per 75 frames on level 2 (1 in 60, minus the seam rule)', n > 50 && n < 110, `n=${n}`);
}

section('Collisions');
{
  const s = mk(); quiet(s); run(s, 40);
  const p = s.ship1;
  const u = s.spawn('sub', p.x, p.v - 60, x => { x.dir = 1; x.mapo = 99999; }); u.sv = 0; u.sh = 0; u.timer = 9999;
  run(s, 12, { fire: true });
  ok('missiles pass over ground units', !!u.task);
  const a = s.spawn('air', p.x, p.v - 120); a.timer = 9999;
  run(s, 12, { fire: true });
  ok('a missile destroys an air unit', !a.task);
  eq('air unit scores 10 on Easy', s.score, 10);
}
{
  const s = mk(); quiet(s); run(s, 40);
  const p = s.ship1;
  const o = s.spawn('orb', p.x + 10, p.v + 10);
  run(s, 1);
  ok('an enemy shot kills the ship', s.dead);
  ok('the ship sprite is gone', !p.task);
}
{
  const s = mk(); quiet(s); run(s, 40);
  s.prot = 640; s.invuln = true;
  const p = s.ship1;
  s.spawn('orb', p.x + 10, p.v + 10);
  run(s, 1);
  ok('protection blocks a shot', !s.dead && !!p.task);
  const a = s.spawn('air', p.x, p.v); a.timer = 9999;
  run(s, 1);
  ok('shielded ramming destroys the air unit and scores', !a.task && s.score === 10);
}

section('Yummies (fn3_5932 and the pickup procs)');
{
  const s = mk(1, 0, {}, 11); s.god = true;
  const at = [];
  for (let i = 0; i < 6400; i++) {
    const sc = s.scroll; s.step({}); s.events.length = 0;
    if (s.sprites.some(x => x.name === 'yummy' && sy(s, x) === -50 + 0 && x.pv === x.v && false)) {}
    for (const y of s.sprites) if (y.name === 'yummy' && !y._seen) { y._seen = 1; at.push(sc); }
  }
  eq('yummies spawn at scroll 200 + 1280k', at, [200, 1480, 2760, 4040, 5320]);
}
{
  const s = mk(); quiet(s); run(s, 40);
  const p = s.ship1;
  const give = k => { const y = s.spawn('yummy', p.x, p.v, u => { u.ykind = k; }); run(s, 1); return y; };
  give('extraman'); eq('extra man adds a life', s.lives, 6);
  give('rapidfire'); eq('rapid fire sets a 5 frame cooldown', [s.rapid, s.fireCooldown], [true, 5]);
  give('protection'); eq('protection lasts 640 frames', s.prot, 639);
  give('freeze'); ok('freeze lasts 600 frames', s.frozen && s.freezeT === 599);
  const a = s.spawn('air', 10, -40 - s.scroll); a.timer = 9999; const ax = a.x; run(s, 3);
  ok('frozen air units hold still sideways', a.x === ax);
  s.freezeT = 1; run(s, 1);
  const victim = s.spawn('air', 200, -20 - s.scroll); victim.timer = 9999;
  give('smartbomb'); run(s, 1);
  ok('smart bomb destroys air units', !victim.task);
  give('clone');
  ok('clone appears 33 px to the left', s.clone && s.ship2 && s.ship2.x === p.x - 33 && s.ship2.v === p.v);
  give('clone');
  eq('the original never flies a second clone', s.clones, 1);
}
{
  const s = mk(); quiet(s); run(s, 40);
  s.prot = 120; s.invuln = true;
  const states = []; for (let i = 0; i < 40; i++) { run(s, 1); states.push(s.invuln ? 1 : 0); }
  ok('protection blinks off in its last 100 frames', states.includes(0) && states.includes(1));
}
{
  const s = mk(1, 0, { rapid: true }); quiet(s);
  eq('rapid fire carries into a new life or level', s.fireCooldown, 5);
  run(s, 2000);
  s.dead = true; s.step({}); run(s, 50);
  eq('rapid fire outlasts 2000 frames and a death', [s.rapid, s.fireCooldown, s.phase], [true, 5, 'play']);
}
{
  const s = mk(); quiet(s); run(s, 40);
  s.yummySpawner = Sim.prototype.yummySpawner; s.rapid = true;
  const seen = [];
  for (let k = 0; k < 7; k++) { s.scroll = 200; s.yummySpawner(); }
  for (const y of byName(s, 'yummy')) seen.push(y.ykind);
  ok('no rapid fire yummy while rapid fire is active', !seen.includes('rapidfire'));
  eq('each other kind at most once per life', new Set(seen.filter(k => k !== 'extraman')).size, seen.filter(k => k !== 'extraman').length);
}

section('Clone (fn2_6C9A, fn2_6D2A)');
{
  const s = mk(); quiet(s); run(s, 40);
  s.addClone();
  run(s, 5, { right: true });
  // the clone runs before the lead ship each frame, so it holds the lead's previous spot
  eq('clone flies in formation, one frame behind', s.ship2.x, s.ship1.px - 33);
  run(s, 1);
  eq('clone settles 33 px left of the lead', s.ship2.x, s.ship1.x - 33);
  s.spawn('orb', s.ship2.x + 10, s.ship2.v + 10);
  run(s, 1);
  ok('losing the clone does not cost a life', !s.dead && !s.clone && s.lives === 5);
}
{
  const s = mk(); quiet(s); run(s, 40);
  const c = s.addClone(); const old = s.ship1;
  run(s, 200, { left: true });
  eq('with a clone the lead stops at x 32, the clone at -1', [s.ship1.x, c.x], [32, -1]);
  s.spawn('orb', old.x + 10, old.v + 10); run(s, 1);
  ok('losing the lead with a clone costs no life', !s.dead && s.lives === 5 && !old.task && !!c.task);
  run(s, 3, { right: true });
  eq('the clone flies on as the lead', [s.ship1 === c, c.x], [true, 11]);
}

section('Boss and barricade machines (fn3_285A, fn2_3A4E, fn2_3AE8, fn2_6192)');
for (const [lv, hp, machines] of [[0, 5, 0], [1, 6, 1], [2, 7, 2], [3, 9, 3]]) {
  const s = mk(1, lv); quiet(s); s.god = true;
  s.scroll = BOSS_AT - 1; s.step({}); s.events.length = 0;
  const boss = byName(s, 'boss')[0];
  ok(`level ${lv + 1}: boss appears at scroll 6200`, !!boss);
  eq(`level ${lv + 1}: boss HP`, boss.hp, hp);
  eq(`level ${lv + 1}: barricade machines`, byName(s, 'machine').length, machines);
  run(s, LEVEL_END - s.scroll);
  eq(`level ${lv + 1}: boss sits at the top of the screen when the scroll stops`, [boss.x, sy(s, boss)], [127, 1]);
  eq(`level ${lv + 1}: boss phase`, s.phase, 'boss');
}
{
  const s = mk(1, 0); quiet(s); s.god = true;
  s.scroll = BOSS_AT - 1; run(s, 202);
  const boss = byName(s, 'boss')[0];
  const fired = []; const t0 = s.frame;
  for (let i = 0; i < 70; i++) { s.step({}); s.events.forEach(e => { if (e.t === 'snd' && e.id === 129) fired.push(s.frame - t0); }); s.events.length = 0; }
  const volleys = [...new Set(fired)];
  ok('boss fires every 30 frames', volleys.length >= 2 && volleys[1] - volleys[0] === 30, JSON.stringify(volleys));
  const orbs = byName(s, 'aimed');
  ok('two aimed orbs per volley', orbs.length >= 2);
  const sh = s.ship1; sh.x = boss.x + 20; sh.v = boss.v + 200;
  for (let i = 0; i < 4; i++) { boss.hp--; }
  run(s, 1);
  eq('boss shows its hurt face at HP 1 and critical below 2', boss.face, 217);
}
{
  // missiles: 1 damage; a machine stops them and has 10 HP
  const s = mk(1, 1); quiet(s); s.god = true;
  const spawn0 = s.spawn.bind(s);
  s.spawn = (n, ...a) => n === 'air' ? { task: null } : spawn0(n, ...a);   // no random air units
  s.scroll = BOSS_AT - 1; run(s, 210);
  const boss = byName(s, 'boss')[0], m = byName(s, 'machine')[0];
  const sh = s.ship1; sh.x = 127 + 20; sh.v = boss.v + 250;
  run(s, 400, { fire: true });
  ok('missiles break the machine before reaching the boss', !m.task && boss.hp < 6);
  run(s, 400, { fire: true });
  ok('killing the boss completes the level', s.complete || s.phase === 'complete' || s.phase === 'flyoff' || s.phase === 'levelDone');
  eq('machine destroyed by missiles scores nothing, boss scores 200', s.score, 200);
}

section('Death and checkpoints (fn3_39CA 3BDC, 3F52)');
for (const [at, cp] of [[600, 0], [1240, 1280], [2000, 1280], [3500, 3200], [5900, 5120]]) {
  const s = mk(); quiet(s); s.scroll = at; s.prevScroll = at;
  s.dead = true; s.step({}); s.events.length = 0;
  eq(`death at ${at}: life lost`, [s.phase, s.lives], ['dying', 4]);
  run(s, 50);
  eq(`death at ${at} restarts from ${cp} after 50 frames`, [s.phase, s.scroll], ['play', cp]);
}
{
  const s = mk(); quiet(s); s.lives = 1; s.dead = true; s.step({}); run(s, 50);
  eq('last life lost: game over', s.phase, 'over');
}
{
  const s = mk(); quiet(s); run(s, 40); s.dead = true; s.step({}); run(s, 50);
  eq('no shield after respawning: the fly-in is the only grace', [s.prot, s.invuln], [0, false]);
}

section('Scoring multiplier');
{
  const s = mk(3); quiet(s); run(s, 40);
  const p = s.ship1; const a = s.spawn('air', p.x, p.v - 120); a.timer = 9999;
  run(s, 12, { fire: true });
  eq('Hard triples the score', s.score, 30);
}

section('High scores (fn2_5CB8, fn2_5D9E, fn2_5ECE, fn2_5FFE)');
{
  const t0 = HS.blankTable();
  eq('ten slots of Nobody and 0', [t0.length, t0[0], t0[9]], [10, { name: 'Nobody', score: 0 }, { name: 'Nobody', score: 0 }]);
  eq('dialog text and default name', [HS.PROMPT, HS.DEFAULT_NAME], ['New high score! Please enter your name!', 'Your name here']);
  eq('footer text', HS.CONTINUE, 'Click mouse or hit any key to continue...');
  ok('a score of 0 does not beat an empty table', !HS.qualifies(t0, 0));
  ok('a score of 5 does', HS.qualifies(t0, 5));
  const a = HS.insertScore(t0, 410, 'Your name here');
  eq('first entry goes to rank 1', [a.rank, a.table[0]], [1, { name: 'Your name here', score: 410 }]);
  const b = HS.insertScore(a.table, 410, 'Second');
  eq('an equal score goes under the old one', [b.rank, b.table[0].name, b.table[1].name], [2, 'Your name here', 'Second']);
  const c = HS.insertScore(b.table, 900, 'Top');
  eq('a higher score goes on top', [c.rank, c.table.map(e => e.score).slice(0, 4)], [1, [900, 410, 410, 0]]);
  eq('Cancel stores nothing', HS.insertScore(c.table, 500, '').rank, 0);
  eq('names are cut to 15 characters', HS.insertScore(t0, 50, 'ABCDEFGHIJKLMNOPQRST').table[0].name, 'ABCDEFGHIJKLMNO');
  let full = HS.blankTable().map((e, i) => ({ name: 'P' + i, score: 1000 - i * 100 }));
  ok('a full table needs more than 10th place', !HS.qualifies(full, 100) && HS.qualifies(full, 101));
  const d = HS.insertScore(full, 450, 'Mid');
  eq('the old 10th place drops off', [d.rank, d.table.map(e => e.score)], [7, [1000, 900, 800, 700, 600, 500, 450, 400, 300, 200]]);
  ok('insertScore leaves the old table alone', full[6].score === 400);
  const mem = { v: {}, getItem(k) { return this.v[k] ?? null; }, setItem(k, x) { this.v[k] = String(x); } };
  const h = new HS.HighScores(mem);
  eq('submit returns the rank and keeps it for the red row', [h.submit(410, 'Ken'), h.lastRank], [1, 1]);
  eq('the table survives a reload', new HS.HighScores(mem).table[0], { name: 'Ken', score: 410 });
  h.submit(300, ''); eq('a cancelled entry keeps the old red row', h.lastRank, 1);
  h.erase(); eq('erase puts every slot back', new HS.HighScores(mem).table, HS.blankTable());
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const hb = new HS.HighScores(broken);
  eq('blocked storage still gives a working table', [hb.table.length, hb.submit(10, 'X')], [10, 1]);
  mem.v.foobar_highscores = '{"bad":1}';
  eq('a damaged save falls back to the empty table', new HS.HighScores(mem).table, HS.blankTable());
}
{
  ok('index.html shows the POW! icon (cicn 181) in the name dialog', /cicn_181\.png/.test(html));
  ok('POW! icon is shipped', fs.existsSync(path.join(ROOT, 'assets/sprites/cicn_181.png')));
  ok('the name field takes 15 characters', /id="hs-name"[^>]*maxlength="15"/.test(html));
}

section('House rules (config.houseRules, departures Ken asked for)');
{
  const H = cfg.houseRules;
  eq('timed rapid fire, two clones, respawn shield', [H.rapidFireFrames, H.maxClones, H.respawnShieldFrames], [640, 2, 180]);
  const s = mkHouse(); quiet(s); run(s, 40);
  const p = s.ship1;
  const give = (k, by = s.ship1) => { s.spawn('yummy', by.x, by.v, u => { u.ykind = k; }); run(s, 1); };
  give('rapidfire');
  eq('rapid fire starts a 640 frame timer', [s.rapid, s.fireCooldown, s.rapidT], [true, 5, 639]);
  run(s, 638);
  eq('one frame before it runs out', [s.rapid, s.rapidT], [true, 1]);
  run(s, 1);
  eq('then fire drops back to every 10 frames', [s.rapid, s.fireCooldown, s.rapidT], [false, 10, 0]);
  give('rapidfire'); s.dead = true; s.step({}); s.events.length = 0;
  eq('losing a life ends rapid fire', [s.rapid, s.fireCooldown], [false, 10]);
}
{
  const s = mkHouse(); quiet(s); run(s, 40);
  s.spawn('yummy', s.ship1.x, s.ship1.v, u => { u.ykind = 'rapidfire'; }); run(s, 1);
  s.scroll = LEVEL_END - 1; s.prevScroll = s.scroll; run(s, 2);
  const t = s.rapidT; run(s, 100);
  eq('the rapid fire timer waits during the boss fight, like protection', [s.phase, s.rapidT], ['boss', t]);
}
{
  const s = mkHouse(); quiet(s); run(s, 40);
  const lead = s.ship1;
  const give = k => { s.spawn('yummy', lead.x, lead.v, u => { u.ykind = k; }); run(s, 1); };
  give('clone'); give('clone');
  const L = s.wing.find(w => w.slot < 0), R = s.wing.find(w => w.slot > 0);
  eq('second clone flies 33 px to the right', [s.clones, L.x - lead.x, R.x - lead.x, R.v === lead.v], [2, -33, 33, true]);
  give('clone');
  eq('no third clone', s.clones, 2);
  run(s, 200, { right: true });
  eq('with a clone on the right the lead stops at x 258', [lead.x, R.x], [258, 291]);
  run(s, 200, { left: true });
  eq('and at x 32 on the left', [lead.x, L.x], [32, -1]);
  run(s, 60, { right: true });
  const shots = s.sprites.filter(x => x.name === 'reticle').length;
  eq('three ships, three bomb sights', shots, 3);
  const lx = lead.x;
  s.spawn('orb', lead.x + 10, lead.v + 10); run(s, 1);
  ok('losing the lead costs no life', !s.dead && s.lives === 5 && !lead.task);
  eq('the left clone takes over and the right one is 66 px out', [s.ship1 === L, R.x - L.x], [true, 66]);
  const gaps = []; for (let i = 0; i < 9; i++) { run(s, 1); gaps.push(R.x - L.x); }
  eq('the right clone slides back to 33 px at flying speed', gaps, [62, 58, 54, 50, 46, 42, 38, 34, 33]);
}
{
  const s = mkHouse(); quiet(s); run(s, 40);
  s.addClone(); s.addClone();
  const R = s.wing.find(w => w.slot > 0);
  s.spawn('orb', R.x + 10, R.v + 10); run(s, 1);
  eq('losing a clone keeps the others', [s.clones, s.dead, s.lives], [1, false, 5]);
  const n = s.addClone();
  eq('a new clone fills the empty side', n && n.slot, 1);
  const s2 = mkHouse(); quiet(s2); run(s2, 40); s2.yummySpawner = Sim.prototype.yummySpawner;
  s2.addClone();
  for (let k = 0; k < 40; k++) { s2.scroll = 200; s2.yummySpawner(); }
  const clonesOffered = byName(s2, 'yummy').filter(y => y.ykind === 'clone').length;
  ok('Foo++ keeps turning up in the same life while there is room for a second clone', clonesOffered >= 2, `n=${clonesOffered}`);
  s2.addClone(); s2.sprites = s2.sprites.filter(x => x.name !== 'yummy');
  for (let k = 0; k < 40; k++) { s2.scroll = 200; s2.yummySpawner(); }
  ok('and stops once both clones fly', !byName(s2, 'yummy').some(y => y.ykind === 'clone'));
}
{
  const s = mkHouse(); quiet(s); run(s, 40);
  s.addClone(); s.addClone();
  s.forceLevelComplete(); let guard = 0;
  while (s.phase !== 'levelDone' && guard++ < 2000) { s.step({}); s.events.length = 0; }
  s.beginNextLevel(); quiet(s);
  eq('both clones carry into the next level', [s.level, s.clones, s.wing.map(w => w.x - s.ship1.x).sort((a, b) => a - b)], [1, 2, [-33, 33]]);
  const c = mkHouse(1, 2, { clones: 2 });
  eq('a saved game brings both clones back', c.clones, 2);
  const old = mkHouse(1, 2, { clone: true });
  eq('a build 22 save with one clone still works', old.clones, 1);
}
{
  const s = mkHouse(); quiet(s); run(s, 40);
  s.dead = true; s.step({}); run(s, 50); quiet(s);
  eq('respawning starts 180 frames of shield', [s.phase, s.prot, s.invuln], ['play', 180, true]);
  run(s, 1);
  eq('the new ship shows the shield outline', s.ship1.face, 246);
  const p = s.ship1;
  run(s, 30);
  s.spawn('orb', p.x + 10, p.v + 10); run(s, 1);
  ok('a shot does not kill the respawned ship', !s.dead && !!p.task);
  let beep = false;
  for (let i = 0; i < 160; i++) { s.step({}); if (s.events.some(e => e.t === 'beep')) beep = true; s.events.length = 0; }
  eq('the shield runs out with protection\'s beep', [s.prot, s.invuln, beep], [0, false, true]);
}
{
  const s = mkHouse(); quiet(s); run(s, 40);
  s.addClone(); const lead = s.ship1;
  s.spawn('orb', lead.x + 10, lead.v + 10); s.spawn('orb', lead.x + 12, lead.v + 12); run(s, 1);
  ok('two shots on the lead in one frame lose one ship, not a life', !s.dead && s.lives === 5 && s.clones === 0);
}

{
  // fn2_4818 sets no face and the fan frame stays at 0 under a freeze, so a drone that
  // arrives frozen has nothing to draw until the freeze lifts.
  for (const [make, label, want] of [[mk, 'original', 0], [mkHouse, 'house rule', 10000]]) {
    const s = make(1, 3); quiet(s); s.frozen = true; s.freezeT = 50;
    const d = s.spawn('drone', 100, 50 - s.scroll); run(s, 20);
    eq(`${label}: a drone spawned in a freeze shows face ${want}`, d.face, want);
    run(s, 40);
    eq(`${label}: the drone's fan turns once the freeze ends`, [s.frozen, d.face >= 10000 && d.face <= 10003], [false, true]);
  }
  eq('house rule switch', cfg.houseRules.dronesVisibleInFreeze, true);
}

section('QA cheats');
{
  const reserved = new Set(cfg.cheats.reservedKeys);
  for (const code of Object.keys(cfg.cheats.codes))
    ok(`cheat ${code} uses no gameplay key`, ![...code].some(ch => reserved.has(ch)));
  eq('bbb jumps to the boss', cfg.cheats.codes.bbb, 'bossjump');
  for (const lv of [0, 1, 2, 3]) {
    const s = mkHouse(1, lv); s.god = true; run(s, 60); s.addClone();
    const y0 = sy(s, s.ship1);
    ok(`level ${lv + 1}: jump lands before the arena`, s.jumpToBoss() && s.scroll === BOSS_AT - 100);
    eq(`level ${lv + 1}: ships keep their place on screen`, [sy(s, s.ship1), s.sprites.filter(x => x.code === 666).length], [y0, 2]);
    run(s, 101);
    eq(`level ${lv + 1}: the boss and its machines arrive`, [byName(s, 'boss').length, byName(s, 'machine').length], [1, lv]);
  }
}
{
  ok('index.html switches the panel to the briefed level', /function beginLevel[\s\S]{0,120}hudLevel\(lvl\)/.test(html));
  ok('the boss meter scales a cover instead of animating height', /id="arrowcover"/.test(html) && !/style\.height=/.test(html));
  ok('HUD writes go through the change check', !/\$\('v-score'\)\.textContent=/.test(html));
}

section('Touch controls (TouchPad in js/core.js) and pausing in the background');
{
  const { TouchPad, Audio } = await import(pathToFileURL(path.join(ROOT, 'js/core.js')).href);
  if (typeof globalThis.addEventListener !== 'function') globalThis.addEventListener = () => {};
  // Stand-ins for the pad's elements: listeners, a fixed box, a style and a class list.
  const R = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const el = (box, w = 0) => { const L = {}, cls = new Set();
    return { L, style: {}, offsetWidth: w, getBoundingClientRect: () => box,
      addEventListener: (t, f) => { (L[t] = L[t] || []).push(f); },
      classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c),
        toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); } } }; };
  const stick = el(R(0, 400, 200, 140)), btns = el(R(200, 400, 200, 140));
  const pads = { stick, btns, base: el(R(0, 0, 0, 0), 110), knob: el(R(0, 0, 0, 0), 50),
    fire: el(R(220, 438, 64, 64)), bomb: el(R(310, 438, 64, 64)) };   // the gap: x 284 to 310
  const input = { t: { left: 0, right: 0, up: 0, down: 0, fire: 0, bomb: 0 } };
  let presses = 0;
  const pad = new TouchPad(input, pads, () => presses++);
  const ev = (z, type, id, x, y) => (z.L[type] || []).forEach(f => f({ pointerId: id, clientX: x, clientY: y,
    preventDefault() {}, currentTarget: { setPointerCapture() {} } }));
  const F = () => ['left', 'right', 'up', 'down', 'fire', 'bomb'].filter(k => input.t[k])
    .map(k => k[0].toUpperCase()).join('') || '-';
  const want = { 0: 'R', 22: 'R', 23: 'RD', 45: 'RD', 90: 'D', 135: 'LD', 180: 'L', 225: 'LU',
    270: 'U', 315: 'RU', 337: 'RU', 338: 'R' }, got = {};
  for (const a of Object.keys(want)) {
    ev(stick, 'pointerdown', 1, 100, 470);
    ev(stick, 'pointermove', 1, 100 + 25 * Math.cos(a * Math.PI / 180), 470 + 25 * Math.sin(a * Math.PI / 180));
    got[a] = F(); ev(stick, 'pointerup', 1, 0, 0);
  }
  eq('stick: eight directions, borders at 22.5 degrees either side of each axis', got, want);
  ev(stick, 'pointerdown', 1, 100, 470); ev(stick, 'pointermove', 1, 106, 472);
  eq('stick: a 6 px nudge is inside the dead zone', F(), '-');
  ev(stick, 'pointermove', 1, 190, 470); ev(stick, 'pointermove', 1, 150, 470);
  eq('stick: dragged past its rim it follows, so 40 px back turns the ship round', F(), 'L');
  ev(stick, 'pointerdown', 2, 60, 470);
  eq('stick: a second thumb on the stick takes over from the first', F(), '-');
  ev(stick, 'pointermove', 2, 60, 440);
  eq('stick: and steers', F(), 'U');
  ev(stick, 'pointerup', 2, 0, 0); ev(stick, 'lostpointercapture', 2, 0, 0); ev(stick, 'pointerup', 1, 0, 0);
  eq('stick: let go, centred, the knob back in the middle', [F(), pads.knob.style.transform, pads.base.classList.contains('on')], ['-', '', false]);
  ev(btns, 'pointerdown', 5, 252, 470); const p1 = [F(), presses, pads.fire.classList.contains('on')];
  ev(btns, 'pointermove', 5, 297, 470); const p2 = F();
  ev(btns, 'pointermove', 5, 342, 470); const p3 = F();
  ev(btns, 'pointermove', 5, 395, 470); const p4 = F();
  ev(btns, 'pointerup', 5, 0, 0);
  eq('buttons, one thumb: FIRE, the gap holds both, BOMB, past BOMB', [p1, p2, p3, p4], [['F', 1, true], 'FB', 'B', 'B']);
  ev(btns, 'pointerdown', 5, 205, 520);
  eq('buttons: anywhere left of BOMB fires, at any height in the zone', F(), 'F');
  ev(btns, 'pointerdown', 6, 342, 470); const q1 = F(); ev(btns, 'pointerup', 5, 0, 0); const q2 = F();
  ev(btns, 'pointerup', 6, 0, 0);
  eq('buttons, two fingers: both, then the one still down', [q1, q2, F(), presses], ['FB', 'B', '-', 3]);
  ev(stick, 'pointerdown', 1, 100, 470); ev(stick, 'pointermove', 1, 100, 440); ev(btns, 'pointerdown', 5, 252, 470);
  const both = F(); pad.reset();
  eq('steering and firing at once; reset lets go of everything', [both, F(), pads.fire.classList.contains('on')], ['UF', '-', false]);
  ev(stick, 'pointermove', 9, 120, 470);
  eq('a finger the pad never saw go down is ignored', F(), '-');

  const A = new Audio({ snd: {} }); A.suspend(); A.wake();       // before START: no context, no-ops
  let st = 'running'; const calls = [];
  A.ctx = { get state() { return st; }, suspend() { calls.push('suspend'); st = 'suspended'; return Promise.resolve(); },
    resume() { calls.push('resume'); st = 'running'; return Promise.resolve(); } };
  A.suspend(); A.suspend(); A.wake(); A.wake(); st = 'interrupted'; A.init();
  eq('sound: held once, back once, and an iOS "interrupted" context resumes on a tap', calls, ['suspend', 'resume', 'resume']);

  const core = rd('js/core.js');
  ok('the invisible touch zones are gone', !/id="touch"|t-left|t-fire/.test(html) && !/t-left|t-fire/.test(core));
  ok('pad markup: stick, knob, FIRE, BOMB', ['pad-stick', 'stick-base', 'stick-knob', 'pad-btns', 'pad-fire', 'pad-bomb']
    .every(id => html.includes(`id="${id}"`)));
  ok('TOUCH CONTROLS on the title screen and the pause screen',
    /id="ov-title"[\s\S]*id="b-touch"[\s\S]*id="ov-intro"/.test(html) && /id="ov-pause"[\s\S]{0,200}id="b-touch-p"/.test(html));
  ok('the pad takes no scrolling, zoom, selection or callout',
    /\.pad\{[^}]*touch-action:none[^}]*user-select:none[^}]*-webkit-touch-callout:none/.test(html));
  ok('the choice is remembered', /localStorage\.setItem\('foobar_touch'/.test(html));
  ok('hidden: a game in play pauses and the sound is held',
    /const away=\(\)=>\{ if\(game\.state==='play'\) game\.pause\(\);[^}]*audio\.suspend\(\); \}/.test(html) &&
    /'visibilitychange',\(\)=>\{ if\(document\.hidden\) away\(\); else audio\.wake\(\); \}/.test(html) &&
    /addEventListener\('pagehide',away\)/.test(html));
  ok('back on the title the panel resets to a new game', /b-win-home'\)\.onclick=\(\)=>\{[^}]*resetHud\(\)/.test(html)
    && /function resetHud\(\)\{[\s\S]{0,200}startLives[\s\S]{0,200}setMeter\(0\)/.test(html));
  ok('upright, the controls sit right under the playfield', !/minmax\(124px,1fr\)/.test(html) && /grid-template-rows:auto auto clamp\(124px/.test(html));
  ok('only a fresh key press clears a briefing (no auto-repeat)', /if\(e\.repeat\) return;[\s\S]{0,300}ov-brief/.test(html));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
