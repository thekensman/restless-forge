"""Decode uncompressed 8-bit 'snd ' resources (format 1 or 2) to WAV at the native rate."""
import struct, wave, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rsrc

def decode(d):
    fmt = struct.unpack('>H', d[0:2])[0]
    if fmt == 1:
        nmods = struct.unpack('>H', d[2:4])[0]; off = 4 + nmods * 6
    else:
        off = 4
    ncmd = struct.unpack('>H', d[off:off+2])[0]
    for i in range(ncmd):
        c, p1, p2 = struct.unpack('>HHI', d[off+2+i*8:off+10+i*8])
        if c in (0x8050, 0x8051):
            h = p2
            ptr, length, rate, ls, le, enc, base = struct.unpack('>IIIIIBB', d[h:h+22])
            if enc != 0:
                raise ValueError('compressed')
            return d[h+22:h+22+length], rate / 65536.0, (ls, le)
    raise ValueError('no buffer cmd')

if __name__ == '__main__':
    R = rsrc.parse(open(sys.argv[1], 'rb').read())
    out = sys.argv[2]
    for k, (n, d) in sorted(R['snd '].items()):
        try:
            pcm, rate, loop = decode(d)
        except ValueError as e:
            print(k, n, 'skip', e); continue
        fn = f'{out}/snd_{k}.wav'
        w = wave.open(fn, 'wb'); w.setnchannels(1); w.setsampwidth(1); w.setframerate(int(round(rate)))
        w.writeframes(pcm); w.close()
        print(k, repr(n), f'{len(pcm)} samples @ {rate:.1f} Hz = {len(pcm)/rate:.2f}s loop={loop}')
