"""Render a level's terrain as one 320 x 6400 strip, bottom row of the map at the bottom.

usage: python3 -I strip.py <build dir> <level 1-4> <out.png>

Same tiles and order as Game.buildStrip in js/game.js, without the boss arena on top.
Screen row y at scroll s shows strip row 6060 - s + y.
"""
import json, sys
from PIL import Image

build, level, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
cfg = json.load(open(f'{build}/data/config.json'))
lev = json.load(open(f'{build}/data/levels.json'))
L = cfg['levels'][level - 1]
T = cfg['tile']
bank = cfg['tileBanks'][L['tileBank']]
tiles = lev[str(L['id'])] if isinstance(lev, dict) else lev[level - 1]
H = T['rows'] * T['size']
im = Image.new('RGB', (T['cols'] * T['size'], H), 'black')
cache = {}
for r in range(T['rows']):
    y = H - (r + 1) * T['size']
    for k in range(T['cols']):
        sid = bank[tiles[r * T['cols'] + k]]
        if sid not in cache:
            cache[sid] = Image.open(f'{build}/assets/sprites/cicn_{sid}.png').convert('RGBA')
        im.paste(cache[sid], (k * T['size'], y), cache[sid])
im.save(out)
print(out, im.size)
