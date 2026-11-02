"""List A5 globals that the code reads but never writes directly and whose starting value
(unpacked from DATA 0 and ZERO 0, the way THINK C does at launch) is not zero. Those are
constants a port must not take for zero. Build 23 found the bomb cooldown this way.

usage: python3 -I tools/re/globals.py     (reads resource_fork.bin like show.py)
"""
import sys, re, struct, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import show
from mac68k import SEG_BASE
A = show.app()
g, below = A.globals, A.below

def a5ops(ops):
    # split operands at top-level commas
    parts, depth, cur = [], 0, ''
    for ch in ops:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ',' and depth == 0:
            parts.append(cur.strip()); cur = ''
        else:
            cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts

reads, writes, addr = {}, {}, {}
for a, (sz, mn, ops, meta, fn) in sorted(A.insns.items()):
    for d in meta.get('a5', []):
        if d >= 0:
            continue
        where = (A.fname(fn), a - SEG_BASE(A.seg_of(a)) - 4, mn, ops)
        parts = a5ops(ops)
        pat = re.compile(r'-\$%x\(a5\)' % (-d))
        idx = [i for i, p in enumerate(parts) if pat.search(p)]
        base = mn.split('.')[0]
        if base in ('pea', 'lea'):
            addr.setdefault(d, []).append(where); continue
        is_dst = idx and idx[-1] == len(parts) - 1 and len(parts) >= 1
        if base in ('clr', 'st', 'sf', 'neg', 'not', 'tas') or (base.startswith('s') and len(parts) == 1 and base not in ('sub', 'subq', 'subi', 'swap')):
            writes.setdefault(d, []).append(where); continue
        if base in ('tst', 'cmp', 'cmpi', 'cmpa', 'btst', 'chk'):
            reads.setdefault(d, []).append(where); continue
        if is_dst and len(parts) == 2:
            writes.setdefault(d, []).append(where)
            if base in ('add', 'addq', 'addi', 'sub', 'subq', 'subi', 'or', 'ori', 'and', 'andi', 'eor', 'eori', 'asl', 'asr', 'lsl', 'lsr', 'bset', 'bclr', 'bchg'):
                reads.setdefault(d, []).append(where)
        else:
            reads.setdefault(d, []).append(where)

def init(d, size=2):
    o = below + d
    b = bytes(g[o:o + size])
    return struct.unpack('>h' if size == 2 else '>i', b)[0]

print('globals read but never written directly, and never address-taken, with a non-zero initial word:')
for d in sorted(reads):
    if d in writes or d in addr:
        continue
    w, l = init(d, 2), init(d, 4)
    if w or l:
        users = sorted({r[0] for r in reads[d]})
        print(f'  {d:6d} (-${-d:x})  word {w:6d}  long {l:11d}  read in {", ".join(users[:8])}')
print()
print('globals written somewhere but also with a non-zero initial word (initial value may matter):')
for d in sorted(set(reads) & set(writes)):
    w = init(d, 2)
    if w:
        users = sorted({r[0] for r in reads[d]})[:6]
        wr = sorted({x[0] for x in writes[d]})[:6]
        print(f'  {d:6d} (-${-d:x})  word {w:6d}  read {", ".join(users)}  written {", ".join(wr)}')
