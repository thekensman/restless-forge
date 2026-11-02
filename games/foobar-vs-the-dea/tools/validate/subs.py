"""Detect submarine periscopes in aligned frames and compare them with the positions the
ported level-1 code predicts at the same scroll value.

usage: python3 -I subs.py <build dir> <frames dir> <align.json> <out.json>

Needs node, numpy, Pillow and opencv-python. Prediction runs js/sim.js with rockets and
yummies switched off, so a freeze yummy in the footage shows up as unmatched periscopes
(frozen subs keep their place on the ground while the predicted ones walk on).
"""
import json, subprocess, sys
import numpy as np
from PIL import Image
import cv2

build, frames_dir, align_path, out_path = sys.argv[1:5]
align = json.load(open(align_path))

js = """
import {Sim} from 'BUILD/js/sim.js';
import fs from 'fs';
const cfg = JSON.parse(fs.readFileSync('BUILD/data/config.json'));
const badg = JSON.parse(fs.readFileSync('BUILD/data/enemies.json'));
const s = new Sim(cfg, {badg}, {seed: 1}); s.newGame(DIFF, 0); s.god = true;
s.rocketSpawner = () => {}; s.yummySpawner = () => {};
const out = {};
while (s.scroll < 6000) { s.step({}); s.events.length = 0;
  out[s.scroll] = s.sprites.filter(x => x.name === 'sub').map(x => [x.idx, x.x, x.v + s.scroll, x.face]); }
console.log(JSON.stringify(out));
"""
pred = {}
for diff in (1, 2):
    src = js.replace('BUILD', build).replace('DIFF', str(diff))
    r = subprocess.run(['node', '--input-type=module', '-e', src], capture_output=True, text=True, check=True)
    pred[diff] = json.loads(r.stdout)

tmpl = {}
for fid in (600, 601, 602, 603, 604, 605, 204):
    a = np.array(Image.open(f'{build}/assets/sprites/cicn_{fid}.png').convert('RGBA')).astype(np.float32)
    rgb = a[..., :3]
    m = ((a[..., 3] > 128) & (rgb.mean(axis=2) > 100)).astype(np.float32)   # the light periscope, not its dithered shadow
    tmpl[fid] = (rgb, np.dstack([m] * 3))

def detect(img):
    hits = []
    for fid, (t, m) in tmpl.items():
        r = cv2.matchTemplate(img, t, cv2.TM_SQDIFF, mask=m) / max(1, m[..., 0].sum()) / 3
        ys, xs = np.where(r < 1600)   # RMS under 40 per channel on the light pixels
        hits += [(float(r[y, x]), int(x), int(y), fid) for y, x in zip(ys, xs)]
    hits.sort()
    keep = []
    for h in hits:
        if all(abs(h[1] - k[1]) > 12 or abs(h[2] - k[2]) > 12 for k in keep):
            keep.append(h)
    return keep

rows = []
for o in align:
    if not o['ok'] or o['s'] is None or o['s'] >= 6000:
        continue
    img = np.array(Image.open(f"{frames_dir}/f_{o['i'] + 1:04d}.png").convert('RGB')).astype(np.float32)
    det = detect(img)
    if not det:
        continue
    s = o['s']
    res = {'t': o['t'], 's': s, 'det': [(x, y, f) for _, x, y, f in det]}
    for diff in (1, 2):
        P = pred[diff].get(str(s), [])
        res[f'err{diff}'] = [None if not P else
                             round(min(((x - px) ** 2 + (y - py) ** 2) ** 0.5 for _, px, py, _ in P), 1)
                             for _, x, y, f in det]
        res[f'pred{diff}'] = P
    rows.append(res)

json.dump(rows, open(out_path, 'w'))
for diff, name in ((1, 'Easy'), (2, 'Medium')):
    e = [x for r in rows for x in r[f'err{diff}'] if x is not None]
    print(f'{name}: {len(rows)} frames with periscopes, {sum(len(r["det"]) for r in rows)} detections, '
          f'{sum(1 for x in e if x <= 6)} within 6 px, median error {np.median(e) if e else None}')
