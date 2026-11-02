#!/usr/bin/env python3
"""Recover the tile banks from the 68k code.

The game does not map tile values to sprites arithmetically. CODE 3 fills 22
global handle slots from a different bank of cicn resources per level, using
repeated  move.w #id,-(a7) / jsr $41a(a5) / move.l (a7)+,-slot(a5)  sequences.
This scans every CODE resource for that pattern and groups the results.
"""
import struct, re, sys

rf = open(sys.argv[1] if len(sys.argv) > 1 else 'resource_fork.bin', 'rb').read()
data_off = struct.unpack('>I', rf[0:4])[0]
map_off  = struct.unpack('>I', rf[4:8])[0]
rmap     = rf[map_off:]
tlist    = rmap[struct.unpack('>H', rmap[24:26])[0]:]
ntypes   = struct.unpack('>h', tlist[0:2])[0] + 1

code, off = {}, 2
for _ in range(ntypes):
    rtype = tlist[off:off+4].decode('mac_roman', 'replace')
    count = struct.unpack('>H', tlist[off+4:off+6])[0] + 1
    rl = tlist[struct.unpack('>H', tlist[off+6:off+8])[0]:]
    for j in range(count):
        rid = struct.unpack('>h', rl[j*12:j*12+2])[0]
        ao  = struct.unpack('>I', rl[j*12+4:j*12+8])[0] & 0xFFFFFF
        a   = data_off + ao
        ln  = struct.unpack('>I', rf[a:a+4])[0]
        if rtype == 'CODE':
            code[rid] = rf[a+4:a+4+ln]
    off += 8

PAT = re.compile(rb'\x3f\x3c(..)\x4e\xad\x04\x1a\x2b\x5f(..)', re.S)
loads = []
for rid, d in sorted(code.items()):
    for m in PAT.finditer(d):
        loads.append((rid, m.start(),
                      struct.unpack('>H', m.group(1))[0],
                      struct.unpack('>h', m.group(2))[0]))

print(f'{len(loads)} GetCIcon load sites\n')
bank, banks = [], []
for L in loads:
    if bank and L[0] == bank[-1][0] and L[2] == bank[-1][2] + 1:
        bank.append(L)
    else:
        if len(bank) >= 3: banks.append(bank)
        bank = [L]
if len(bank) >= 3: banks.append(bank)

for b in banks:
    ids, slots = [x[2] for x in b], [x[3] for x in b]
    print(f'CODE {b[0][0]} @0x{b[0][1]:04X}: cicn {ids[0]}..{ids[-1]} '
          f'({len(ids)}) -> slots {slots[0]}..{slots[-1]}')
print('\nTile banks are the groups writing slots -1438..-1354.')
