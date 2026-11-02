#!/usr/bin/env node
// End-to-end boot test. Runs the real index.html boot script against a DOM shim
// with the real Input class, presses START, skips the intro, clears the briefing,
// then drives real keydown events through several hundred frames.
//
// This exists because build 19 shipped a black screen: a patch to core.js
// silently matched nothing, this.typed was never initialised, and typedBuffer()
// threw on every frame. Every unit test passed because they used a stub Input.
//
//   node test/boot_e2e.mjs .
import fs from 'fs'; import path from 'path'; import {pathToFileURL} from 'url';
const ROOT=path.resolve(process.argv[2]||process.cwd());
class CL{constructor(){this.s=new Set()}add(c){this.s.add(c)}remove(c){this.s.delete(c)}
 toggle(c,o){o?this.s.add(c):this.s.delete(c)}contains(c){return this.s.has(c)}}
const ctx=new Proxy({},{get:(t,k)=>k==='canvas'?{width:320,height:340}:(typeof k==='symbol'?undefined:(()=>{})),set:()=>true});
const els={}; const L={};
function El(id){return {id,style:{},dataset:{},classList:new CL(),textContent:'',innerHTML:'',
 offsetHeight:680,offsetWidth:640,naturalHeight:724,naturalWidth:320,complete:true,
 _s:'',set src(v){this._s=v;this.onload&&this.onload()},get src(){return this._s},
 addEventListener(){},appendChild(){},parentElement:null,getContext:()=>ctx,width:0,height:0};}
global.document={getElementById:id=>els[id]||(els[id]=El(id)),createElement:()=>El('c'),
 querySelectorAll:()=>[],body:{appendChild(){}},addEventListener(){}};
global.addEventListener=(e,f)=>{(L[e]=L[e]||[]).push(f)};
global.Image=class{set src(v){const p=path.join(ROOT,String(v).split('?')[0]);
 fs.existsSync(p)?this.onload&&this.onload():this.onerror&&this.onerror()}};
// a virtual clock: every animation frame is 1/60 s, so 1500 frames is 25 s of play
let clock=0; global.performance={now:()=>clock};
let n=0; global.requestAnimationFrame=f=>{if(n++<1500)setTimeout(()=>{clock+=1000/60;f(clock)},0);return n};
global.cancelAnimationFrame=()=>{};
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.AudioContext=class{createGain(){return{gain:{},connect(){}}}get destination(){return{}}get state(){return 'running'}
 resume(){}createBufferSource(){return{connect(){},start(){},stop(){}}}decodeAudioData(){return Promise.reject(new Error('x'))}
 // beep() (protection and freeze pickups) builds its tone with createBuffer. Without these, a
 // run where the ship happened to pick one up crashed the loop: a flaky failure, not a bug.
 get sampleRate(){return 44100}createBuffer(c,n){const d=new Float32Array(n);return{getChannelData:()=>d}}};
global.window={AudioContext:global.AudioContext};
global.fetch=u=>{const p=path.join(ROOT,String(u).split('?')[0]);
 if(!fs.existsSync(p))return Promise.reject(new Error('404'));
 const b=fs.readFileSync(p);
 return Promise.resolve({ok:true,json:()=>Promise.resolve(JSON.parse(b.toString())),arrayBuffer:()=>Promise.resolve(b.buffer)})};
let errs=[]; process.on('unhandledRejection',e=>errs.push('rejection: '+(e&&e.message)));
const html=fs.readFileSync(ROOT+'/index.html','utf8');
const src=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(/from '\.\/(js\/[^']+)'/g,(m,p1)=>`from '${ROOT}/${p1.split('?')[0]}'`);
const TMP=path.join(ROOT,'.e2e_boot.mjs');
fs.writeFileSync(TMP,src);
await import(pathToFileURL(TMP).href);
await new Promise(r=>setTimeout(r,400));
console.log('boot ok. title on:',els['ov-title'].classList.contains('on'));
// press START, skip intro, clear the briefing, then run frames
els['b-start'].onclick(); await new Promise(r=>setTimeout(r,60));
if(els['b-skip'].onclick) els['b-skip'].onclick();
await new Promise(r=>setTimeout(r,60));
if(els['b-brief-go'].onclick) els['b-brief-go'].onclick();
await new Promise(r=>setTimeout(r,60));
// fire real keydown events through the real Input, including movement + cheats
const kd=(L['keydown']||[]);
for(const key of ['w','a','s','d','w','a','s','d','q','q','q']){
  kd.forEach(f=>{try{f({key,preventDefault(){}})}catch(e){errs.push('keydown: '+e.message)}});
}
await new Promise(r=>setTimeout(r,2500));
const g=global.window.__foobar;
const d=g&&g.diagnostics();
console.log('after the run:',JSON.stringify(d&&d.sim));
if(!d||d.state!=='play'||!d.sim||d.sim.scroll<200) errs.push('game did not advance: '+JSON.stringify(d));
try{fs.unlinkSync(TMP);}catch(e){}
const bar=els['errbar']&&els['errbar'].textContent;
if(errs.length||bar){
  console.log('E2E FAILED');
  errs.forEach(e=>console.log('  '+e));
  if(bar) console.log('  errbar: '+bar);
  process.exit(1);
}
console.log('E2E PASSED: boot, start, intro skip, briefing, 1500 frames of play,');
console.log('            real Input driven with wasd + qqq, no errors.');
