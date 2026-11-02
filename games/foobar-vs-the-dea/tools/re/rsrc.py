"""Shared helpers: pull the raw resource fork out of the AppleDouble file and parse it."""
import struct, sys

def resource_fork_from_appledouble(path):
    d = open(path, 'rb').read()
    assert struct.unpack('>I', d[0:4])[0] == 0x00051607, 'not AppleDouble'
    n = struct.unpack('>H', d[24:26])[0]
    off = 26
    for _ in range(n):
        eid, eoff, elen = struct.unpack('>III', d[off:off+12]); off += 12
        if eid == 2:
            return d[eoff:eoff+elen]
    raise ValueError('no resource fork entry')

def parse(rf):
    """Return {type: {id: (name, bytes)}}."""
    data_off, map_off = struct.unpack('>II', rf[0:8])
    rmap = rf[map_off:]
    tl_off, nl_off = struct.unpack('>HH', rmap[24:28])
    tl = rmap[tl_off:]
    ntypes = struct.unpack('>h', tl[0:2])[0] + 1
    out = {}
    off = 2
    for _ in range(ntypes):
        rtype = tl[off:off+4].decode('mac_roman')
        count = struct.unpack('>H', tl[off+4:off+6])[0] + 1
        ref = tl[struct.unpack('>H', tl[off+6:off+8])[0]:]
        for j in range(count):
            rid, noff = struct.unpack('>hH', ref[j*12:j*12+4])
            ao = struct.unpack('>I', ref[j*12+4:j*12+8])[0] & 0xFFFFFF
            a = data_off + ao
            ln = struct.unpack('>I', rf[a:a+4])[0]
            name = ''
            if noff != 0xFFFF:
                nd = rmap[nl_off+noff:]
                name = nd[1:1+nd[0]].decode('mac_roman')
            out.setdefault(rtype, {})[rid] = (name, rf[a+4:a+4+ln])
        off += 8
    return out

if __name__ == '__main__':
    rf = resource_fork_from_appledouble(sys.argv[1])
    open(sys.argv[2], 'wb').write(rf)
    print(len(rf), 'bytes')
