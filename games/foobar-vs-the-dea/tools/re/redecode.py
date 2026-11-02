#!/usr/bin/env python3
"""
Re-decode every 'cicn' colour icon from the resource fork.

The original decoder indexed the colour table by POSITION. Mac colour tables are
sparse: each entry carries an explicit `value` field, and in these resources pure
black is always stored at value 255 while the table itself holds only ~20-40
entries. Indexing by position therefore threw away every black pixel, which is
why helicopter eyes, submarine shadows and rocket tails came out transparent.

This version keys the palette by `value`, exactly as QuickDraw does.
"""
import struct, os, json, sys
from PIL import Image

# usage: python3 -I redecode.py resource_fork.bin outdir
RF   = sys.argv[1] if len(sys.argv) > 1 else 'resource_fork.bin'
OUT  = sys.argv[2] if len(sys.argv) > 2 else 'sprites'
os.makedirs(OUT, exist_ok=True)

rf = open(RF, 'rb').read()
data_off = struct.unpack('>I', rf[0:4])[0]
map_off  = struct.unpack('>I', rf[4:8])[0]
rmap     = rf[map_off:]
tl_off   = struct.unpack('>H', rmap[24:26])[0]
tlist    = rmap[tl_off:]
ntypes   = struct.unpack('>h', tlist[0:2])[0] + 1

resources = {}
off = 2
for _ in range(ntypes):
    rtype = tlist[off:off+4].decode('mac_roman', 'replace')
    count = struct.unpack('>H', tlist[off+4:off+6])[0] + 1
    rl_off = struct.unpack('>H', tlist[off+6:off+8])[0]
    if rtype == 'cicn':
        rl = tlist[rl_off:]
        for j in range(count):
            rid = struct.unpack('>h', rl[j*12:j*12+2])[0]
            ao  = struct.unpack('>I', rl[j*12+4:j*12+8])[0] & 0xFFFFFF
            a   = data_off + ao
            ln  = struct.unpack('>I', rf[a:a+4])[0]
            resources[rid] = rf[a+4:a+4+ln]
    off += 8


def decode(d):
    # --- PixMap (50 bytes) ---
    row_bytes = struct.unpack('>H', d[4:6])[0] & 0x3FFF
    top, left, bot, right = struct.unpack('>hhhh', d[6:14])
    w, h = right - left, bot - top
    pixel_size = struct.unpack('>H', d[32:34])[0]
    o = 50

    # --- mask BitMap (14) ---
    mask_rb = struct.unpack('>H', d[o+4:o+6])[0] & 0x3FFF
    mt, ml, mb, mr = struct.unpack('>hhhh', d[o+6:o+14])
    mask_h = mb - mt
    o += 14

    # --- icon BitMap (14) ---
    bmap_rb = struct.unpack('>H', d[o+4:o+6])[0] & 0x3FFF
    bt, bl, bb, br = struct.unpack('>hhhh', d[o+6:o+14])
    bmap_h = bb - bt
    o += 14

    o += 4                                   # iconData handle
    mask = d[o:o + mask_rb * mask_h]; o += mask_rb * mask_h
    o += bmap_rb * bmap_h                    # 1-bit icon, unused here

    # --- colour table, keyed by VALUE (this is the fix) ---
    o += 4                                   # ctSeed
    o += 2                                   # ctFlags
    n = struct.unpack('>H', d[o:o+2])[0] + 1; o += 2
    palette = {}
    for _ in range(n):
        v = struct.unpack('>H', d[o:o+2])[0]
        r = struct.unpack('>H', d[o+2:o+4])[0] >> 8
        g = struct.unpack('>H', d[o+4:o+6])[0] >> 8
        b = struct.unpack('>H', d[o+6:o+8])[0] >> 8
        palette[v] = (r, g, b)
        o += 8

    pixels = d[o:]
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px = img.load()
    ppb = 8 // pixel_size
    dropped = 0

    for y in range(h):
        for x in range(w):
            bo = y * row_bytes + x // ppb
            if bo >= len(pixels):
                continue
            shift = (ppb - 1 - (x % ppb)) * pixel_size
            idx = (pixels[bo] >> shift) & ((1 << pixel_size) - 1)

            visible = True
            mb_ = y * mask_rb + x // 8
            if mb_ < len(mask):
                visible = (mask[mb_] >> (7 - (x % 8))) & 1

            if not visible:
                continue
            if idx in palette:
                px[x, y] = palette[idx] + (255,)
            else:
                dropped += 1
    return img, dropped


report = {}
for rid in sorted(resources):
    try:
        img, dropped = decode(resources[rid])
    except Exception as e:
        report[rid] = {'error': str(e)}
        continue
    img.save(f'{OUT}/cicn_{rid}.png')
    report[rid] = {'size': img.size, 'unmapped': dropped}

json.dump(report, open(f'{OUT}/decode_report.json', 'w'), indent=2)
print(f'decoded {len(resources)} cicn resources into {OUT}')
still = [k for k, v in report.items() if v.get('unmapped')]
print(f'sprites still containing unmapped indices: {len(still)}')
