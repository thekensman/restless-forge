"""Minimal PICT v2 decoder: PackBitsRect (0x98/0x99) and DirectBitsRect (0x9A/0x9B) onto a frame-sized canvas."""
import struct
from PIL import Image

def unpackbits(data, pos, rowbytes, bytecount_size):
    if bytecount_size == 1:
        n = data[pos]; pos += 1
    else:
        n = struct.unpack('>H', data[pos:pos+2])[0]; pos += 2
    end = pos + n
    out = bytearray()
    while pos < end:
        c = data[pos]; pos += 1
        if c < 128:
            out += data[pos:pos + c + 1]; pos += c + 1
        elif c > 128:
            out += bytes([data[pos]]) * (257 - c); pos += 1
    return bytes(out[:rowbytes]), end

def unpackbits16(data, pos, bytecount_size):
    """PackBits on 16-bit words (packType 3)."""
    if bytecount_size == 1:
        n = data[pos]; pos += 1
    else:
        n = struct.unpack('>H', data[pos:pos+2])[0]; pos += 2
    end = pos + n
    out = bytearray()
    while pos < end:
        c = data[pos]; pos += 1
        if c < 128:
            out += data[pos:pos + 2 * (c + 1)]; pos += 2 * (c + 1)
        elif c > 128:
            out += data[pos:pos + 2] * (257 - c); pos += 2
    return bytes(out), end

def decode(d):
    top, left, bottom, right = struct.unpack('>hhhh', d[2:10])
    W, H = right - left, bottom - top
    canvas = Image.new('RGB', (W, H), (0, 0, 0))
    pos = 10
    ver = struct.unpack('>H', d[pos:pos+2])[0]
    assert ver == 0x0011, hex(ver)
    pos += 2
    while pos < len(d) - 1:
        if pos % 2: pos += 1
        op = struct.unpack('>H', d[pos:pos+2])[0]; pos += 2
        if op == 0x02FF:
            continue
        if op == 0x0C00:
            pos += 24; continue
        if op == 0x001E or op == 0x0000:
            continue
        if op == 0x0001:          # clip region
            n = struct.unpack('>H', d[pos:pos+2])[0]; pos += n; continue
        if op == 0x00A0:          # short comment
            pos += 2; continue
        if op == 0x00A1:
            pos += 2; n = struct.unpack('>H', d[pos:pos+2])[0]; pos += 2 + n; continue
        if op in (0x001A, 0x001B, 0x001F):  # RGB fg/bk/op color
            pos += 6; continue
        if op in (0x0003, 0x0004, 0x0005, 0x0008, 0x000D, 0x0015, 0x0016):
            pos += 2; continue
        if op == 0x0007:
            pos += 4; continue
        if op == 0x00FF:
            break
        if op in (0x0098, 0x0099, 0x009A, 0x009B):
            direct = op in (0x009A, 0x009B)
            if direct:
                pos += 4                      # baseAddr
            rowBytes = struct.unpack('>H', d[pos:pos+2])[0] & 0x3FFF; pos += 2
            btop, bleft, bbottom, bright = struct.unpack('>hhhh', d[pos:pos+8]); pos += 8
            pmVersion, packType, packSize, hRes, vRes, pixelType, pixelSize, cmpCount, cmpSize, planeBytes, pmTable, pmReserved = \
                struct.unpack('>hhIIIhhhhIII', d[pos:pos+36]); pos += 36
            pal = None
            if not direct:
                seed, flags, ctSize = struct.unpack('>IHH', d[pos:pos+8]); pos += 8
                pal = {}
                for i in range(ctSize + 1):
                    v, r, g, b = struct.unpack('>HHHH', d[pos:pos+8]); pos += 8
                    idx = i if (flags & 0x8000) else v
                    pal[idx] = (r >> 8, g >> 8, b >> 8)
            srcRect = struct.unpack('>hhhh', d[pos:pos+8]); pos += 8
            dstRect = struct.unpack('>hhhh', d[pos:pos+8]); pos += 8
            mode = struct.unpack('>H', d[pos:pos+2])[0]; pos += 2
            if op in (0x0099, 0x009B):
                n = struct.unpack('>H', d[pos:pos+2])[0]; pos += n
            bw, bh = bright - bleft, bbottom - btop
            img = Image.new('RGB', (bw, bh))
            px = img.load()
            bcs = 2 if rowBytes > 250 else 1
            for y in range(bh):
                if direct and pixelSize == 16:
                    if rowBytes < 8 or packType == 1:
                        row = d[pos:pos + rowBytes]; pos += rowBytes
                    else:
                        row, pos = unpackbits16(d, pos, bcs)
                    for x in range(bw):
                        w = struct.unpack('>H', row[2*x:2*x+2])[0]
                        px[x, y] = (((w >> 10) & 31) * 255 // 31, ((w >> 5) & 31) * 255 // 31, (w & 31) * 255 // 31)
                elif direct and pixelSize == 32:
                    if packType == 4:
                        row, pos = unpackbits(d, pos, rowBytes, bcs)
                        n = bw
                        comps = [row[i*n:(i+1)*n] for i in range(cmpCount)]
                        off = cmpCount - 3
                        for x in range(bw):
                            px[x, y] = (comps[off][x], comps[off+1][x], comps[off+2][x])
                    else:
                        row = d[pos:pos + rowBytes]; pos += rowBytes
                        for x in range(bw):
                            px[x, y] = (row[4*x+1], row[4*x+2], row[4*x+3])
                else:
                    if rowBytes < 8:
                        row = d[pos:pos + rowBytes]; pos += rowBytes
                    else:
                        row, pos = unpackbits(d, pos, rowBytes, bcs)
                    ppb = 8 // pixelSize
                    for x in range(bw):
                        byte = row[x // ppb]
                        sh = (ppb - 1 - (x % ppb)) * pixelSize
                        v = (byte >> sh) & ((1 << pixelSize) - 1)
                        px[x, y] = pal.get(v, (255, 0, 255))
            st, sl, sb, sr = srcRect
            dt, dl, db, dr = dstRect
            crop = img.crop((sl - bleft, st - btop, sr - bleft, sb - btop))
            if (dr - dl, db - dt) != crop.size:
                crop = crop.resize((dr - dl, db - dt))
            canvas.paste(crop, (dl - left, dt - top))
            continue
        raise ValueError(f'unhandled opcode {op:#06x} at {pos-2}')
    return canvas

if __name__ == '__main__':
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import rsrc
    R = rsrc.parse(open(sys.argv[1], 'rb').read())
    for pid in sys.argv[3:]:
        im = decode(R['PICT'][int(pid)][1])
        im.save(f'{sys.argv[2]}/PICT_{pid}.png')
        print(pid, im.size)
