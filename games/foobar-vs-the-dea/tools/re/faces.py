"""Find every GetFace(id) call and record which A5 global receives the handle."""
import sys, os, re, json
sys.path.insert(0, os.path.dirname(__file__))
import mac68k
from mac68k import SEG_BASE

def face_map(app, getface_jt=127):
    gf_target = app.jt[getface_jt][3]
    faces = {}                    # a5 disp -> cicn id
    sites = []
    for a in sorted(app.insns):
        size, mn, ops, meta, fn = app.insns[a]
        if meta.get('call') != gf_target:
            continue
        # look back a few instructions for move.w #imm,-(a7)
        back = [b for b in sorted(app.insns) if a - 14 <= b < a]
        cid = None
        for b in reversed(back):
            s2, mn2, ops2, _, _ = app.insns[b]
            m = re.match(r'#\$([0-9a-f]+), -\(a7\)', ops2)
            if mn2 == 'move.w' and m:
                cid = int(m.group(1), 16); break
        # look forward for move.l (a7)+, d(a5)
        nxt = a + size
        slot = None
        if nxt in app.insns:
            s3, mn3, ops3, meta3, _ = app.insns[nxt]
            if mn3 == 'move.l' and ops3.startswith('(a7)+') and meta3.get('a5'):
                slot = meta3['a5'][0]
        sites.append((a, fn, cid, slot))
        if cid is not None and slot is not None:
            faces[slot] = cid
    return faces, sites

if __name__ == '__main__':
    app = mac68k.App(sys.argv[1], sys.argv[2]).analyse()
    faces, sites = face_map(app)
    print(len(sites), 'GetFace call sites,', len(faces), 'resolved to a global')
    unresolved = [s for s in sites if s[2] is None or s[3] is None]
    print('unresolved:', len(unresolved))
    for a, fn, cid, slot in unresolved[:12]:
        print('   at', app.fname(fn), hex(a), 'id', cid, 'slot', slot)
    json.dump({str(k): v for k, v in faces.items()}, open(sys.argv[3], 'w'), indent=0)
