"""
Classic Mac 68k application loader and annotating disassembler.

Lays the CODE resources out as the Segment Loader would after every segment is
loaded: each segment at SEG_BASE(n), the A5 world at A5, and the jump table in its
*loaded* form (segment word + JMP abs.l target), so `jsr d16(a5)` resolves.

Then discovers functions by recursive descent from every jump table entry,
following branches, PC-relative calls and jump-table calls, and annotates:
  - A-line traps with Toolbox/OS names (from multiversal)
  - jump table calls with their target function
  - A5-relative globals, with the initial values THINK C copies in from DATA 0 and
    ZERO 0, so string literals can be shown by name
"""
import struct, sys, os, re
from collections import defaultdict
import capstone
from capstone import m68k as M

sys.path.insert(0, os.path.dirname(__file__))
import rsrc, traps as trapmod

A5 = 0x000A8000
def SEG_BASE(n): return 0x10000 * n


class App:
    def __init__(self, rfpath, defs_dir):
        self.R = rsrc.parse(open(rfpath, 'rb').read())
        self.code = {k: v[1] for k, v in self.R['CODE'].items()}
        self.traps = trapmod.load(defs_dir)
        c0 = self.code[0]
        self.above, self.below, self.jtsize, self.jtoff = struct.unpack('>IIII', c0[:16])
        self.jt = []                         # (index, seg, off, target)
        for i in range(self.jtsize // 8):
            off, mv, seg, trap = struct.unpack('>HHHH', c0[16 + i*8:24 + i*8])
            self.jt.append((i, seg, off, SEG_BASE(seg) + 4 + off))
        self.image = bytearray(0xB0000)
        for s, d in self.code.items():
            if s == 0:
                continue
            b = SEG_BASE(s)
            self.image[b:b + len(d)] = d
        for i, seg, off, tgt in self.jt:
            a = A5 + self.jtoff + i * 8
            self.image[a:a + 8] = struct.pack('>HHI', seg, 0x4EF9, tgt)
        self.globals = self._unpack_globals()
        self.md = capstone.Cs(capstone.CS_ARCH_M68K,
                              capstone.CS_MODE_M68K_020 | capstone.CS_MODE_BIG_ENDIAN)
        self.md.detail = True
        self.funcs = {}                      # addr -> dict
        self.insns = {}                      # addr -> (size, text, meta)
        self.names = {}                      # addr -> name
        self.jt_by_disp = {self.jtoff + i * 8 + 2: (i, tgt) for i, seg, off, tgt in self.jt}
        for i, seg, off, tgt in self.jt:
            self.names.setdefault(tgt, f'fn{seg}_{off:04X}')

    # ---------------------------------------------------------------- globals
    def _unpack_globals(self):
        """Rebuild the initial A5 globals the way THINK C's startup (fn1_0044) does.

        DATA 0 is copied a word at a time from CurStackBase up to A5. After every zero word
        the next ZERO 0 entry says how many more zero bytes follow.
        """
        img = bytearray(self.below)
        d = self.R.get('DATA', {}).get(0, (None, b''))[1]
        z = self.R.get('ZERO', {}).get(0, (None, b''))[1]
        zw = struct.unpack('>%dH' % (len(z) // 2), z)
        pos = i = zi = 0
        while pos < self.below and i + 1 < len(d):
            w = d[i:i + 2]
            img[pos:pos + 2] = w
            i += 2; pos += 2
            if w == b'\x00\x00' and zi < len(zw):
                pos += zw[zi]; zi += 1
        return img

    def string_at(self, disp):
        """The Pascal or C string literal stored at A5+disp, if there is one."""
        o = self.below + disp
        if not 0 <= o < len(self.globals):
            return None
        g = self.globals
        ok = lambda bs: len(bs) >= 3 and all(32 <= c < 127 or c in (0xA9, 0xD5) for c in bs)
        n = g[o]
        if ok(g[o + 1:o + 1 + n]):
            return g[o + 1:o + 1 + n].decode('mac_roman')
        e = g.find(0, o)
        if e > o and ok(g[o:e]):
            return g[o:e].decode('mac_roman')
        return None

    # ---------------------------------------------------------------- helpers
    def seg_of(self, addr):
        s = addr >> 16
        if 1 <= s <= 15 and s in self.code:
            b = SEG_BASE(s)
            if b + 4 <= addr < b + len(self.code[s]):
                return s
        return None

    def w16(self, a): return struct.unpack('>H', self.image[a:a+2])[0]

    def fname(self, a):
        if a in self.names:
            return self.names[a]
        s = self.seg_of(a)
        if s:
            return f'fn{s}_{a - SEG_BASE(s) - 4:04X}'
        return f'0x{a:X}'

    def gname(self, disp):
        return f'g{disp:+d}'.replace('+', 'p').replace('-', 'm')

    def decode(self, addr):
        """Return (size, mnemonic, opstr, insn_or_None, kind, target)."""
        w = self.w16(addr)
        if (w & 0xF000) == 0xA000:
            n, ent = trapmod.name_for(self.traps, w)
            return (2, 'TRAP', f'_{n or "trap"} ;${w:04X}', None, 'trap', w)
        try:
            ins = next(self.md.disasm(bytes(self.image[addr:addr + 12]), addr, 1))
        except StopIteration:
            return (2, 'DC.W', f'${w:04X}', None, 'bad', None)
        return (ins.size, ins.mnemonic, ins.op_str, ins, 'ok', None)

    def branch_target(self, ins):
        for op in ins.operands:
            if op.type == M.M68K_OP_BR_DISP:
                return ins.address + 2 + op.br_disp.disp
        return None

    def memref(self, op):
        """Classify a memory operand: ('a5', disp) | ('pc', addr) | ('abs', addr) | None."""
        if op.type != M.M68K_OP_MEM:
            return None
        m = op.mem
        if m.base_reg == M.M68K_REG_A5 and m.index_reg == 0 and op.address_mode in (
                M.M68K_AM_REGI_ADDR_DISP,):
            return ('a5', m.disp)
        if op.address_mode in (M.M68K_AM_PCI_DISP,):
            return ('pc', m.disp)
        if op.address_mode in (M.M68K_AM_ABSOLUTE_DATA_SHORT, M.M68K_AM_ABSOLUTE_DATA_LONG):
            return ('abs', op.imm if hasattr(op, 'imm') else None)
        return None

    # ---------------------------------------------------------------- analysis
    def analyse(self):
        work = [tgt for _, _, _, tgt in self.jt]
        seen_f = set()
        while True:
            while work:
                f = work.pop()
                if f in seen_f or self.seg_of(f) is None:
                    continue
                seen_f.add(f)
                self.funcs[f] = {'calls': set(), 'blocks': set(), 'end': f}
                self._walk(f, work)
            # sweep gaps for LINK A6 prologues not yet reached
            added = False
            covered = set(self.insns)
            for s, d in self.code.items():
                if s == 0:
                    continue
                b = SEG_BASE(s)
                a = b + 4
                while a < b + len(d) - 1:
                    if a not in covered and self.w16(a) == 0x4E56 and a not in seen_f:
                        work.append(a); added = True
                        self.names.setdefault(a, f'fn{s}_{a - b - 4:04X}')
                    a += 2
            if not added:
                break
        return self

    def _walk(self, entry, work):
        todo = [entry]
        f = self.funcs[entry]
        while todo:
            a = todo.pop()
            while True:
                if a in self.insns or self.seg_of(a) is None:
                    break
                size, mn, ops, ins, kind, tgt = self.decode(a)
                meta = {}
                self.insns[a] = (size, mn, ops, meta, entry)
                f['end'] = max(f['end'], a + size)
                if kind == 'bad':
                    break
                if kind == 'trap':
                    meta['trap'] = tgt
                    if tgt in (0xA9F4,):          # ExitToShell never returns
                        break
                    a += size
                    continue
                for op in ins.operands:
                    r = self.memref(op)
                    if r and r[0] == 'a5':
                        meta.setdefault('a5', []).append(r[1])
                if mn in ('rts', 'rtd', 'rte', 'rtr'):
                    break
                if mn in ('bsr', 'bsr.s', 'bsr.w', 'bsr.l'):
                    t = self.branch_target(ins)
                    if t is not None:
                        meta['call'] = t; f['calls'].add(t); work.append(t)
                    a += size
                    continue
                if mn.startswith('jsr') or mn.startswith('jmp'):
                    op = ins.operands[0]
                    r = self.memref(op)
                    t = None
                    if r and r[0] == 'a5' and r[1] in self.jt_by_disp:
                        t = self.jt_by_disp[r[1]][1]
                        meta['jt'] = self.jt_by_disp[r[1]][0]
                    elif r and r[0] == 'pc':
                        t = a + 2 + r[1]
                    elif op.address_mode in (M.M68K_AM_ABSOLUTE_DATA_LONG, M.M68K_AM_ABSOLUTE_DATA_SHORT):
                        t = op.imm
                    if mn.startswith('jsr'):
                        if t is not None:
                            meta['call'] = t; f['calls'].add(t); work.append(t)
                        a += size
                        continue
                    # jmp
                    if t is not None and self.seg_of(t) is not None:
                        if r and r[0] == 'a5':           # tail call through jump table
                            meta['call'] = t; f['calls'].add(t); work.append(t)
                        else:
                            todo.append(t)
                    break
                if mn in ('bra', 'bra.s', 'bra.w', 'bra.l'):
                    t = self.branch_target(ins)
                    if t is not None:
                        todo.append(t)
                    break
                if mn.startswith('b') and mn[1:3] in ('eq','ne','lt','le','gt','ge','cc','cs','hi','ls','pl','mi','vc','vs') \
                        or mn.startswith('db'):
                    t = self.branch_target(ins)
                    if t is not None:
                        todo.append(t)
                    a += size
                    continue
                a += size

    # ---------------------------------------------------------------- output
    def listing(self, faces=None, gnames=None):
        faces = faces or {}
        gnames = gnames or {}
        out = []
        for f in sorted(self.funcs):
            out.append('')
            out.append(f'; ================= {self.fname(f)}   (seg {self.seg_of(f)}, {f:#x})')
            a = f
            body = sorted(x for x in self.insns if self.insns[x][4] == f)
            for a in body:
                size, mn, ops, meta, _ = self.insns[a]
                note = []
                if 'jt' in meta:
                    note.append(f'-> {self.fname(meta["call"])}')
                elif 'call' in meta:
                    note.append(f'-> {self.fname(meta["call"])}')
                for d in meta.get('a5', []):
                    if d in self.jt_by_disp:
                        continue
                    lab = gnames.get(d) or (f'face[{faces[d]}]' if d in faces else None)
                    note.append(self.gname(d) + (f'={lab}' if lab else ''))
                # decimal immediates
                m = re.search(r'#\$([0-9a-f]+)', ops)
                if m and int(m.group(1), 16) > 9:
                    note.append(f'#{int(m.group(1), 16)}')
                txt = f'  {a - SEG_BASE(self.seg_of(a)) - 4:04X}  {mn:<9} {ops}'
                if note:
                    txt = f'{txt:<52} ; ' + '  '.join(note)
                out.append(txt)
        return '\n'.join(out)


if __name__ == '__main__':
    app = App(sys.argv[1], sys.argv[2]).analyse()
    print(len(app.funcs), 'functions,', len(app.insns), 'instructions')
