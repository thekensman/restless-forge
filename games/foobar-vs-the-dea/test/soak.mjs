// test/soak.mjs - random play over every level, with and without the house rules.
//
//   node test/soak.mjs .
//
// 48 games of pseudo-random flying, firing and bombing, with clone, rapid fire and protection
// yummies handed out and some levels skipped, so formations, deaths, promotions, level
// changes and endings all get exercised. Every frame it checks that the formation, the
// reticles, the clone count and the fire rate still agree with each other.
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
const B = path.resolve(process.argv[2] || '.');
const { Sim } = await import(pathToFileURL(path.join(B, 'js/sim.js')).href);
const cfg = JSON.parse(fs.readFileSync(path.join(B, 'data/config.json')));
const badg = JSON.parse(fs.readFileSync(path.join(B, 'data/enemies.json')));
const orig = JSON.parse(JSON.stringify(cfg)); delete orig.houseRules;
let problems = 0, games = 0, frames = 0;
const note = (m) => { if (problems++ < 15) console.log('  PROBLEM', m); };
for (const [name, conf] of [['house', cfg], ['original', orig]]) {
  const stats = { deaths: 0, maxClones: 0, wins: 0, overs: 0, levels: 0, promotions: 0 };
  for (let g = 0; g < 24; g++) {
    games++;
    const diff = 1 + (g % 3);
    const s = new Sim(conf, { badg }, { seed: 1000 + g, frameMs: 35 });
    s.newGame(diff, g % 4, {});
    let keys = {}, t = 0;
    for (let f = 0; f < 40000; f++) {
      if (f % 7 === 0) {
        const r = (g * 7919 + f * 104729) % 97;
        keys = { left: r % 5 === 0, right: r % 5 === 1, up: r % 7 === 0, down: r % 7 === 1, fire: r % 3 !== 0, bomb: r % 4 === 0 };
      }
      if (s.phase === 'play' && f % 600 === 300) {
        const p = s.ship1;
        const ks = [['clone', 'clone'], ['rapidfire'], ['clone'], ['protection', 'clone']][(f / 600 | 0) % 4];
        if (p && p.task) for (const k of ks) s.spawn('yummy', p.x, p.v, u => { u.ykind = k; });
      }
      if (g % 2 === 1 && s.phase === 'play' && s.scroll === 150) s.forceLevelComplete();
      const lead = s.ship1;
      try { s.step(keys); } catch (e) { note(`${name} g${g} f${f}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); break; }
      frames++;
      for (const e of s.events) {
        if (e.t === 'over') stats.overs++;
        if (e.t === 'win') stats.wins++;
        if (e.t === 'levelDone') stats.levels++;
      }
      s.events.length = 0;
      if (s.ship1 !== lead && lead && !lead.task && s.ship1.task && s.phase !== 'dying') stats.promotions++;
      if (s.phase === 'levelDone') { s.beginNextLevel(); continue; }
      if (s.phase === 'over' || s.phase === 'win') break;
      // invariants
      if (s.clones !== s.wing.length) note(`${name} g${g} f${f}: clones ${s.clones} != wing ${s.wing.length}`);
      if (s.clones > s.H.maxClones) note(`${name} g${g} f${f}: too many clones ${s.clones}`);
      stats.maxClones = Math.max(stats.maxClones, s.clones);
      if (s.phase === 'play' || s.phase === 'boss') {
        if (!s.dead && !(s.ship1 && s.ship1.task)) note(`${name} g${g} f${f}: no living lead while alive`);
        for (const w of s.wing) {
          if (!w.task) note(`${name} g${g} f${f}: dead ship in the wing`);
          w._off = (w.x < -1 || w.x > 291) ? (w._off || 0) + 1 : 0;
          if (w._off > 2) note(`${name} g${g} f${f}: wing off screen x=${w.x} for ${w._off} frames`);
        }
        const L = s.ship1;
        if (L && L.task) { L._off = (L.x < 0 || L.x > 291) ? (L._off || 0) + 1 : 0;
          if (L._off > 2) note(`${name} g${g} f${f}: lead x=${L.x} for ${L._off} frames`); }
        const ships = s.sprites.filter(x => x.code === 666 && x.task).length;
        const rets = s.sprites.filter(x => x.name === 'reticle' && x.task).length;
        if (!s.dead && ships !== 1 + s.clones) note(`${name} g${g} f${f}: ships ${ships} vs 1+${s.clones}`);
        if (!s.dead && rets !== ships) note(`${name} g${g} f${f}: reticles ${rets} vs ships ${ships}`);
        if (s.rapid && s.H.rapidFireFrames > 0 && !(s.rapidT > 0)) note(`${name} g${g} f${f}: rapid with no timer`);
        if (!s.rapid && s.fireCooldown !== 10) note(`${name} g${g} f${f}: cooldown ${s.fireCooldown} without rapid`);
      }
      if (s.phase === 'dying' && s.pf === 0) stats.deaths++;
    }
  }
  console.log(name, JSON.stringify(stats));
}
console.log(`${games} games, ${frames} frames, ${problems} problems`);
process.exit(problems ? 1 : 0);
