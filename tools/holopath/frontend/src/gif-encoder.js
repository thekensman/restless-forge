/**
 * HoloGen — GIF89a encoder (client-side).
 *
 * Encodes ImageData frames into an animated GIF with:
 *   - Median-cut colour quantisation (256 colours)
 *   - LZW compression (variable code size)
 *   - NETSCAPE2.0 looping extension
 *   - Per-frame delays and disposal methods
 *
 * No external dependencies. All processing in-browser.
 */
function buildBox(pixels) {
    let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
    for (const p of pixels) {
        if (p[0] < rMin)
            rMin = p[0];
        if (p[0] > rMax)
            rMax = p[0];
        if (p[1] < gMin)
            gMin = p[1];
        if (p[1] > gMax)
            gMax = p[1];
        if (p[2] < bMin)
            bMin = p[2];
        if (p[2] > bMax)
            bMax = p[2];
    }
    return { pixels, rMin, rMax, gMin, gMax, bMin, bMax };
}
function splitBox(box) {
    const rRange = box.rMax - box.rMin;
    const gRange = box.gMax - box.gMin;
    const bRange = box.bMax - box.bMin;
    let channel;
    if (rRange >= gRange && rRange >= bRange)
        channel = 0;
    else if (gRange >= rRange && gRange >= bRange)
        channel = 1;
    else
        channel = 2;
    box.pixels.sort((a, b) => a[channel] - b[channel]);
    const mid = box.pixels.length >> 1;
    return [
        buildBox(box.pixels.slice(0, mid)),
        buildBox(box.pixels.slice(mid)),
    ];
}
function medianCutPalette(imageData, maxColors = 256) {
    // Sample pixels (skip transparent, downsample if huge)
    const data = imageData.data;
    const totalPx = imageData.width * imageData.height;
    const step = totalPx > 100000 ? Math.ceil(totalPx / 50000) : 1;
    const pixels = [];
    for (let i = 0; i < totalPx; i += step) {
        const off = i * 4;
        if (data[off + 3] > 128) {
            pixels.push(new Uint8Array([data[off], data[off + 1], data[off + 2]]));
        }
    }
    if (pixels.length === 0) {
        // All transparent — return simple palette
        const pal = [];
        for (let i = 0; i < maxColors; i++)
            pal.push(new Uint8Array([0, 0, 0]));
        return pal;
    }
    // Median cut
    let boxes = [buildBox(pixels)];
    while (boxes.length < maxColors) {
        // Find largest box (by pixel count)
        let bestIdx = 0;
        let bestLen = 0;
        for (let i = 0; i < boxes.length; i++) {
            if (boxes[i].pixels.length > bestLen) {
                bestLen = boxes[i].pixels.length;
                bestIdx = i;
            }
        }
        if (bestLen <= 1)
            break;
        const [a, b] = splitBox(boxes[bestIdx]);
        boxes.splice(bestIdx, 1, a, b);
    }
    // Average each box to get palette colour
    const palette = [];
    for (const box of boxes) {
        let rSum = 0, gSum = 0, bSum = 0;
        for (const p of box.pixels) {
            rSum += p[0];
            gSum += p[1];
            bSum += p[2];
        }
        const n = box.pixels.length || 1;
        palette.push(new Uint8Array([
            Math.round(rSum / n),
            Math.round(gSum / n),
            Math.round(bSum / n),
        ]));
    }
    // Pad to maxColors
    while (palette.length < maxColors) {
        palette.push(new Uint8Array([0, 0, 0]));
    }
    return palette.slice(0, maxColors);
}
// ─── Colour matching ────────────────────────────────
function buildPaletteLookup(palette) {
    // Simple nearest-colour lookup
    return (r, g, b) => {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < palette.length; i++) {
            const dr = r - palette[i][0];
            const dg = g - palette[i][1];
            const db = b - palette[i][2];
            const d = dr * dr + dg * dg + db * db;
            if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
                if (d === 0)
                    break;
            }
        }
        return bestIdx;
    };
}
function quantiseFrame(imageData, _palette, findNearest) {
    const data = imageData.data;
    const n = imageData.width * imageData.height;
    const indexed = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        const off = i * 4;
        indexed[i] = findNearest(data[off], data[off + 1], data[off + 2]);
    }
    return indexed;
}
// ─── LZW compression ───────────────────────────────
function lzwEncode(indexed, minCodeSize) {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    const output = [];
    let codeSize = minCodeSize + 1;
    let nextCode = eoiCode + 1;
    // Dictionary: maps string key -> code
    const dict = new Map();
    function resetDict() {
        dict.clear();
        for (let i = 0; i < clearCode; i++) {
            dict.set(String(i), i);
        }
        codeSize = minCodeSize + 1;
        nextCode = eoiCode + 1;
    }
    // Bit-packing state
    let bitBuf = 0;
    let bitPos = 0;
    function writeBits(code, size) {
        bitBuf |= code << bitPos;
        bitPos += size;
        while (bitPos >= 8) {
            output.push(bitBuf & 0xFF);
            bitBuf >>= 8;
            bitPos -= 8;
        }
    }
    resetDict();
    writeBits(clearCode, codeSize);
    if (indexed.length === 0) {
        writeBits(eoiCode, codeSize);
        if (bitPos > 0)
            output.push(bitBuf & 0xFF);
        return new Uint8Array(output);
    }
    let current = String(indexed[0]);
    for (let i = 1; i < indexed.length; i++) {
        const next = current + "," + indexed[i];
        if (dict.has(next)) {
            current = next;
        }
        else {
            writeBits(dict.get(current), codeSize);
            if (nextCode < 4096) {
                dict.set(next, nextCode++);
                if (nextCode > (1 << codeSize) && codeSize < 12) {
                    codeSize++;
                }
            }
            else {
                // Dictionary full, emit clear code and reset
                writeBits(clearCode, codeSize);
                resetDict();
            }
            current = String(indexed[i]);
        }
    }
    writeBits(dict.get(current), codeSize);
    writeBits(eoiCode, codeSize);
    if (bitPos > 0)
        output.push(bitBuf & 0xFF);
    return new Uint8Array(output);
}
// ─── GIF binary writer ─────────────────────────────
function writeBytes(parts) {
    let total = 0;
    for (const p of parts) {
        total += typeof p === "number" ? 1 : p.length;
    }
    const result = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
        if (typeof p === "number") {
            result[off++] = p;
        }
        else {
            result.set(p, off);
            off += p.length;
        }
    }
    return result;
}
function writeLE16(n) {
    return new Uint8Array([n & 0xFF, (n >> 8) & 0xFF]);
}
function writeSubBlocks(data) {
    const blocks = [];
    let off = 0;
    while (off < data.length) {
        const size = Math.min(255, data.length - off);
        blocks.push(size);
        for (let i = 0; i < size; i++) {
            blocks.push(data[off + i]);
        }
        off += size;
    }
    blocks.push(0); // terminator
    return new Uint8Array(blocks);
}
// ─── Public API ─────────────────────────────────────
/**
 * Encode frames into an animated GIF.
 *
 * @param frames - Array of ImageData frames with delays
 * @param options - Encoding options (loop count)
 * @param onProgress - Progress callback (0.0 – 1.0)
 * @returns GIF file as Uint8Array (can be converted to Blob)
 */
export function encodeGif(frames, options = {}, onProgress) {
    if (frames.length === 0)
        throw new Error("No frames to encode");
    const width = frames[0].data.width;
    const height = frames[0].data.height;
    const loop = options.loop ?? 0;
    // Build global palette by sampling pixels across ALL frames
    const combinedSample = new ImageData(width, height);
    const combinedData = combinedSample.data;
    // Blend: take pixels from each frame in round-robin stripes
    const totalPx = width * height;
    for (let i = 0; i < totalPx; i++) {
        // Pick which frame to sample this pixel from
        const frameIdx = i % frames.length;
        const src = frames[frameIdx].data.data;
        const off = i * 4;
        combinedData[off] = src[off];
        combinedData[off + 1] = src[off + 1];
        combinedData[off + 2] = src[off + 2];
        combinedData[off + 3] = src[off + 3];
    }
    const palette = medianCutPalette(combinedSample, 256);
    const findNearest = buildPaletteLookup(palette);
    // ─── Header ───
    const header = new TextEncoder().encode("GIF89a");
    // ─── Logical Screen Descriptor ───
    // packed: global colour table flag (1), colour resolution (7=3bits), sort (0), table size (7=256)
    const packed = 0x80 | (7 << 4) | 7; // GCT flag + 256 entries
    const lsd = writeBytes([
        ...writeLE16(width),
        ...writeLE16(height),
        packed,
        0, // bg colour index
        0, // pixel aspect ratio
    ]);
    // ─── Global Colour Table ───
    const gct = new Uint8Array(256 * 3);
    for (let i = 0; i < 256; i++) {
        gct[i * 3] = palette[i][0];
        gct[i * 3 + 1] = palette[i][1];
        gct[i * 3 + 2] = palette[i][2];
    }
    // ─── NETSCAPE2.0 Application Extension (loop) ───
    const netscape = writeBytes([
        0x21, 0xFF, // extension + app
        11, // block size
        ...new TextEncoder().encode("NETSCAPE2.0"),
        3, // sub-block size
        1, // sub-block ID
        ...writeLE16(loop),
        0, // terminator
    ]);
    // ─── Encode each frame ───
    const frameParts = [];
    const minCodeSize = 8; // for 256 colour palette
    for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        const delayCs = Math.max(2, Math.round(f.delay / 10)); // centiseconds
        // Graphics Control Extension
        const gce = writeBytes([
            0x21, 0xF9, // extension + GCE
            4, // block size
            0x00, // packed: disposal=0, no transparency
            ...writeLE16(delayCs),
            0, // transparent colour index (unused)
            0, // terminator
        ]);
        // Image Descriptor
        const imgDesc = writeBytes([
            0x2C,
            ...writeLE16(0), // left
            ...writeLE16(0), // top
            ...writeLE16(f.data.width),
            ...writeLE16(f.data.height),
            0x00, // packed: no local colour table
        ]);
        // Quantise and compress
        const indexed = quantiseFrame(f.data, palette, findNearest);
        const compressed = lzwEncode(indexed, minCodeSize);
        const imageData = writeBytes([
            minCodeSize,
            ...writeSubBlocks(compressed),
        ]);
        frameParts.push(gce, imgDesc, imageData);
        if (onProgress) {
            onProgress((i + 1) / frames.length);
        }
    }
    // ─── Trailer ───
    const trailer = new Uint8Array([0x3B]);
    // ─── Concatenate everything ───
    const allParts = [header, lsd, gct, netscape, ...frameParts, trailer];
    let totalSize = 0;
    for (const p of allParts)
        totalSize += p.length;
    const result = new Uint8Array(totalSize);
    let offset = 0;
    for (const p of allParts) {
        result.set(p, offset);
        offset += p.length;
    }
    return result;
}
