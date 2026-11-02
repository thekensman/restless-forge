"""Catalogue SAT sprite procs: which functions install which task/hit procs, kinds, codes, faces."""
import sys, re, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import show
from mac68k import SEG_BASE
A = show.app()
from collections import defaultdict

def body(f):
    return [a for a in sorted(A.insns) if A.insns[a][4] == f]

cat = {}
for f in A.funcs:
    b = body(f)
    info = defaultdict(list)
    lastlea = None
    for a in b:
        size, mn, ops, meta, fn = A.insns[a]
        m = re.match(r'\$([0-9a-f]+)\(a5\), a0', ops)
        if mn.startswith('lea') and m:
            d = int(m.group(1), 16)
            if (d - 34) % 8 == 0:
                lastlea = (d - 34) // 8
        m = re.match(r'a0, \$(1a|1e|22)\(a4\)', ops)
        if mn.startswith('move') and m and lastlea is not None:
            key = {'1a': 'task', '1e': 'hit', '22': 'destruct'}[m.group(1)]
            info[key].append(A.fname(A.jt[lastlea][3]))
        m = re.match(r'#\$([0-9a-f]+), \(a4\)$', ops)
        if mn.startswith('move.w') and m:
            v = int(m.group(1), 16); v = v - 65536 if v > 32767 else v
            info['kind'].append(v)
        m = re.match(r'#\$([0-9a-f]+), \$60\(a4\)', ops)
        if mn.startswith('move') and m:
            info['code'].append(int(m.group(1), 16))
        if ops.endswith('$16(a4)'):
            for d in meta.get('a5', []):
                if d in A.faces:
                    info['face'].append(A.faces[d])
    if info:
        cat[f] = info

for f in sorted(cat, key=lambda x: x):
    i = cat[f]
    if 'task' in i or 'hit' in i or 'kind' in i or 'code' in i:
        print(f'{A.fname(f):10s}', ' '.join(f'{k}={v}' for k, v in i.items()))
