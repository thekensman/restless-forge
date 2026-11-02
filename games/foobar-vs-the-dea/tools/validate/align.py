"""Find the level-1 scroll position of every captured frame by matching terrain.

usage: python3 -I align.py <strip.png> <frames dir> <out.json> [t0 seconds] [frames per second]

Frames are 320 x 340 crops of the playfield. For the DVD capture (640 x 480) they were
cut with
    ffmpeg -ss 160 -i foobar-vs-the-dea_dvd.mp4 -vf "fps=4,crop=320:340:160:70" f_%04d.png
so t0 is 160 and the rate is 4. Make the strip with strip.py.
"""
import glob, json, sys
import numpy as np
from PIL import Image

strip_path, frames_dir, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
t0 = float(sys.argv[4]) if len(sys.argv) > 4 else 160.0
fps = float(sys.argv[5]) if len(sys.argv) > 5 else 4.0

sg = np.array(Image.open(strip_path).convert('RGB')).astype(np.float32).mean(axis=2)
SH = sg.shape[0]                       # 6400
LAST = SH - 340                        # highest scroll whose view is all terrain
frames = sorted(glob.glob(f'{frames_dir}/f_*.png'))

def scroll_of(g, guess=None):
    best = (1e9, None)
    rng = range(0, LAST + 1) if guess is None else range(max(0, guess - 30), min(LAST, guess + 60))
    win = g[20:320, 10:310]            # stay clear of the HUD-free edges and the ship
    for s in rng:
        top = SH - s - 340
        d = np.abs(win - sg[top + 20:top + 320, 10:310]).mean()
        if d < best[0]:
            best = (d, s)
    return best

out, guess = [], None
for i, f in enumerate(frames):
    g = np.array(Image.open(f).convert('RGB')).astype(np.float32).mean(axis=2)
    d, s = scroll_of(g, guess)
    if d > 40 and guess is not None:  # lost track (death, briefing): search everything
        d2, s2 = scroll_of(g, None)
        if d2 < d:
            d, s = d2, s2
    ok = d < 30
    out.append({'i': i, 't': t0 + i / fps, 'd': round(float(d), 2),
                's': int(s) if s is not None else None, 'ok': bool(ok)})
    guess = s if ok else None
json.dump(out, open(out_path, 'w'))
oks = [o for o in out if o['ok']]
print(len(out), 'frames,', len(oks), 'aligned')
if len(oks) > 1:
    a, b = oks[0], oks[-1]
    runs, cur = [], [oks[0]]
    for o in oks[1:]:
        if o['i'] == cur[-1]['i'] + 1 and 0 <= o['s'] - cur[-1]['s'] <= 12:
            cur.append(o)
        else:
            runs.append(cur); cur = [o]
    runs.append(cur)
    longest = max(runs, key=len)
    if len(longest) > 8:
        rate = (longest[-1]['s'] - longest[0]['s']) / (longest[-1]['t'] - longest[0]['t'])
        print(f'scroll rate over the longest unbroken run: {rate:.2f} px/s')
