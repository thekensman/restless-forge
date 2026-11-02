"""Print a function's annotated disassembly, or the callers of a function."""
import sys, os, json, re
sys.path.insert(0, os.path.dirname(__file__))
import mac68k, faces as F
from mac68k import SEG_BASE

_app = None
def app():
    global _app
    if _app is None:
        _app = mac68k.App(os.environ.get('FOOBAR_RF', 'resource_fork.bin'),
                          os.environ.get('MULTIVERSAL_DEFS', 'multiversal/defs')).analyse()
        fm, _ = F.face_map(_app)
        _app.faces = fm
        _app.gnames = {}
        gn = os.environ.get('FOOBAR_GNAMES', 'gnames.json')
        if os.path.exists(gn):
            _app.gnames = {int(k): v for k, v in json.load(open(gn)).items()}
    return _app

def addr_of(name):
    A = app()
    for a, n in A.names.items():
        if n == name: return a
    m = re.match(r'fn(\d+)_([0-9A-Fa-f]+)', name)
    if m:
        return SEG_BASE(int(m.group(1))) + 4 + int(m.group(2), 16)
    return int(name, 0)

def func(name, lo=None, hi=None):
    A = app()
    f = addr_of(name)
    body = sorted(x for x in A.insns if A.insns[x][4] == f)
    seg = A.seg_of(f)
    lines = [f'; ===== {A.fname(f)}  ({len(body)} insns)']
    for a in body:
        off = a - SEG_BASE(seg) - 4
        if lo is not None and off < lo: continue
        if hi is not None and off > hi: continue
        size, mn, ops, meta, _ = A.insns[a]
        note = []
        if 'call' in meta: note.append('-> ' + A.fname(meta['call']))
        if 'trap' in meta: pass
        for d in meta.get('a5', []):
            if d in A.jt_by_disp: continue
            lab = A.gnames.get(d) or (f'face{A.faces[d]}' if d in A.faces else None)
            if lab is None and mn.startswith(('pea', 'lea')):
                st = A.string_at(d)
                if st is not None:
                    lab = repr(st)
            note.append(A.gname(d) + ('=' + lab if lab else ''))
        # branch / pc targets as segment offsets
        def _rel(m):
            v = int(m.group(1), 16)
            sg = A.seg_of(v)
            if sg is not None and m.group(0).startswith('$') and mn.startswith(('b', 'db', 'jmp', 'jsr', 'pea', 'lea')) and '(a' not in ops:
                return f'L{v - SEG_BASE(sg) - 4:04X}' + ('' if sg == seg else f'@{sg}')
            return m.group(0)
        if mn.startswith(('b', 'db')):
            ops = re.sub(r'\$([0-9a-f]{5,})', _rel, ops)
        # a5-relative code pointers (pea/lea/move of a jump table entry)
        for m in re.finditer(r'\$([0-9a-f]+)\(a5\)', ops):
            d = int(m.group(1), 16)
            if (d - 34) % 8 == 0 and 0 <= (d - 34) // 8 < len(A.jt) and not ops.startswith('-'):
                i = (d - 34) // 8
                if 'call' not in meta:
                    note.append(f'&JT{i}={A.fname(A.jt[i][3])}')
        if 'trap' in meta and meta['trap'] in (0xA9EB, 0xA9EC):
            prev = [x for x in body if x < a][-1:]
            if prev:
                pm = re.search(r'#\$([0-9a-f]+), -\(a7\)', A.insns[prev[0]][2])
                if pm:
                    note.append(sane_name(meta['trap'], int(pm.group(1), 16)))
        for m in re.finditer(r'#\$([0-9a-f]+)', ops):
            v = int(m.group(1), 16)
            if v > 9: note.append(f'#{v}' + (f'/{v-65536}' if v > 0x7fff and v < 0x10000 else ''))
        t = f'  {off:04X}  {mn:<9} {ops}'
        if note: t = f'{t:<50}; ' + '  '.join(note)
        lines.append(t)
    return '\n'.join(lines)

SANE_OPS = {0x00:'ADD',0x02:'SUB',0x04:'MUL',0x06:'DIV',0x08:'CMP',0x0A:'CPX',0x0C:'REM',
            0x0E:'Z2X(convert to ext)',0x10:'X2Z(convert from ext)',0x12:'SQRT',0x14:'RINT',0x16:'TINT(trunc)',
            0x18:'SCALB',0x1A:'LOGB',0x1C:'CLASS',0x01:'SETENV',0x03:'GETENV',0x0D:'NEG',0x0F:'ABS',
            0x11:'CPYSGN',0x13:'NEXT',0x09:'DEC2BIN',0x0B:'BIN2DEC'}
SANE_FMT = {0x0000:'ext',0x0800:'dbl',0x1000:'sgl',0x2000:'int',0x2800:'long',0x3000:'comp'}
ELEMS = {0x00:'LNX',0x02:'LOG2X',0x04:'LN1X',0x06:'LOG21X',0x08:'EXPX',0x0A:'EXP2X',0x0C:'EXP1X',
         0x0E:'EXP21X',0x10:'XPWRI',0x12:'XPWRY',0x14:'COMPOUND',0x16:'ANNUITY',0x18:'SIN',0x1A:'COS',
         0x1C:'TAN',0x1E:'ATAN',0x20:'RANDOM'}
def sane_name(trap, op):
    if trap == 0xA9EC:
        return 'Elems.' + ELEMS.get(op & 0xFF, hex(op))
    return 'FP.' + SANE_OPS.get(op & 0xFF, hex(op & 0xFF)) + '.' + SANE_FMT.get(op & 0x3800, hex(op & 0x3800))

def callers(name):
    A = app()
    f = addr_of(name)
    out = []
    for a in sorted(A.insns):
        if A.insns[a][3].get('call') == f:
            out.append((a, A.insns[a][4]))
    return out

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'f':
        lo = int(sys.argv[3], 16) if len(sys.argv) > 3 else None
        hi = int(sys.argv[4], 16) if len(sys.argv) > 4 else None
        print(func(sys.argv[2], lo, hi))
    elif cmd == 'fc':     # compact: elide the score-redraw idiom
        lo = int(sys.argv[3], 16) if len(sys.argv) > 3 else None
        hi = int(sys.argv[4], 16) if len(sys.argv) > 4 else None
        out = []; skip = False
        for ln in func(sys.argv[2], lo, hi).split('\n'):
            if not skip and 'cmpi.w    #$a, -$1588(a5)' in ln:
                skip = True; out.append(ln[:8] + '  <<DrawScore>>'); continue
            if skip == 'tail':
                skip = False
                if '_ForeColor' in ln or 'pea.l     $21.w' in ln or 'pea.l     $cd.w' in ln:
                    continue
            elif skip:
                if '-> fn5_4EC4' in ln:
                    skip = 'tail'
                continue
            out.append(ln)
        # drop the ForeColor($21) that follows each elided block
        print('\n'.join(out))
    elif cmd == 'callers':
        A = app()
        for a, fn in callers(sys.argv[2]):
            print(f'  {A.fname(fn)} @ {a - SEG_BASE(A.seg_of(a)) - 4:04X}')

def jt_index(name):
    A = app()
    f = addr_of(name)
    for i, seg, off, tgt in A.jt:
        if tgt == f:
            return i
    return None

def refs(name):
    """Instructions that take the address of a function through the jump table (pea/lea/move)."""
    A = app()
    i = jt_index(name)
    if i is None:
        return []
    d = 34 + 8 * i
    out = []
    for a in sorted(A.insns):
        size, mn, ops, meta, fn = A.insns[a]
        if 'call' in meta:
            continue
        if re.search(r'(?<![-$\w])\$%x\(a5\)' % d, ops) and not mn.startswith(('jsr', 'jmp')):
            out.append((a, fn, mn, ops))
    return out

if __name__ == '__main__' and sys.argv[1] == 'refs':
    A = app()
    for nm in sys.argv[2:]:
        print(nm, 'JT', jt_index(nm))
        for a, fn, mn, ops in refs(nm):
            print(f'   {A.fname(fn)} @ {a - SEG_BASE(A.seg_of(a)) - 4:04X}  {mn} {ops}')

def gref(disps):
    """All instructions touching any of the given A5 displacements."""
    A = app()
    out = []
    for a in sorted(A.insns):
        size, mn, ops, meta, fn = A.insns[a]
        hit = [d for d in meta.get('a5', []) if d in disps]
        if hit:
            out.append((a, fn, mn, ops, hit))
    return out

if __name__ == '__main__' and sys.argv[1] == 'g':
    A = app()
    ds = [int(x) for x in sys.argv[2:]]
    for a, fn, mn, ops, hit in gref(set(ds)):
        print(f'  {A.fname(fn):10s} @ {a - SEG_BASE(A.seg_of(a)) - 4:04X}  {mn:<8} {ops}')
