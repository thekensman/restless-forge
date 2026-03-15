/**
 * HoloPath — GIF89a decoder (client-side).
 *
 * Parses animated GIF binary into individual RGBA frames,
 * handling disposal methods, transparency, and local colour tables.
 * Matches browser rendering behaviour.
 *
 * No external dependencies.
 */

// ─── Types ──────────────────────────────────────────

export interface DecodedGifFrame {
  imageData: ImageData;
  delay: number; // ms
}

export interface DecodedGif {
  width: number;
  height: number;
  frames: DecodedGifFrame[];
}

// ─── Binary reader ──────────────────────────────────

class ByteReader {
  pos = 0;
  constructor(private data: Uint8Array) {}

  readByte(): number {
    return this.data[this.pos++];
  }

  readLE16(): number {
    const lo = this.data[this.pos++];
    const hi = this.data[this.pos++];
    return lo | (hi << 8);
  }

  readBytes(n: number): Uint8Array {
    const slice = this.data.slice(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  }

  readSubBlocks(): Uint8Array {
    const parts: Uint8Array[] = [];
    let size: number;
    while ((size = this.readByte()) > 0) {
      parts.push(this.readBytes(size));
    }
    let total = 0;
    for (const p of parts) total += p.length;
    const result = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { result.set(p, off); off += p.length; }
    return result;
  }

  skipSubBlocks(): void {
    let size: number;
    while ((size = this.readByte()) > 0) {
      this.pos += size;
    }
  }

  hasMore(): boolean {
    return this.pos < this.data.length;
  }
}

// ─── LZW decompression ─────────────────────────────

function lzwDecode(compressed: Uint8Array, minCodeSize: number, pixelCount: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const output = new Uint8Array(pixelCount);
  let outIdx = 0;

  // Dictionary
  let dictSize = 0;
  const dict: Uint8Array[] = [];

  function resetDict() {
    dict.length = 0;
    for (let i = 0; i < clearCode; i++) {
      dict.push(new Uint8Array([i]));
    }
    dict.push(new Uint8Array(0)); // clear code placeholder
    dict.push(new Uint8Array(0)); // eoi placeholder
    dictSize = eoiCode + 1;
  }

  // Bit reader
  let bitBuf = 0;
  let bitPos = 0;
  let byteIdx = 0;

  function readBits(n: number): number {
    while (bitPos < n) {
      if (byteIdx >= compressed.length) return -1;
      bitBuf |= compressed[byteIdx++] << bitPos;
      bitPos += 8;
    }
    const code = bitBuf & ((1 << n) - 1);
    bitBuf >>= n;
    bitPos -= n;
    return code;
  }

  let codeSize = minCodeSize + 1;
  resetDict();

  // First code must be clear code
  let code = readBits(codeSize);
  if (code === clearCode) {
    resetDict();
    codeSize = minCodeSize + 1;
  }

  code = readBits(codeSize);
  if (code === eoiCode || code === -1) return output.slice(0, outIdx);
  if (code < dict.length) {
    const entry = dict[code];
    for (let i = 0; i < entry.length && outIdx < pixelCount; i++) {
      output[outIdx++] = entry[i];
    }
  }
  let prevCode = code;

  while (outIdx < pixelCount) {
    code = readBits(codeSize);
    if (code === -1 || code === eoiCode) break;

    if (code === clearCode) {
      resetDict();
      codeSize = minCodeSize + 1;
      code = readBits(codeSize);
      if (code === eoiCode || code === -1) break;
      if (code < dict.length) {
        const entry = dict[code];
        for (let i = 0; i < entry.length && outIdx < pixelCount; i++) {
          output[outIdx++] = entry[i];
        }
      }
      prevCode = code;
      continue;
    }

    let entry: Uint8Array;
    if (code < dict.length) {
      entry = dict[code];
    } else if (code === dictSize) {
      // Special case: code not yet in dictionary
      const prev = dict[prevCode];
      entry = new Uint8Array(prev.length + 1);
      entry.set(prev);
      entry[prev.length] = prev[0];
    } else {
      // Invalid code
      break;
    }

    for (let i = 0; i < entry.length && outIdx < pixelCount; i++) {
      output[outIdx++] = entry[i];
    }

    // Add to dictionary
    if (dictSize < 4096) {
      const prev = dict[prevCode];
      const newEntry = new Uint8Array(prev.length + 1);
      newEntry.set(prev);
      newEntry[prev.length] = entry[0];
      dict.push(newEntry);
      dictSize++;

      // Early change: compatible with most external GIF encoders
      if (dictSize >= (1 << codeSize) && codeSize < 12) {
        codeSize++;
      }
    }

    prevCode = code;
  }

  return output.slice(0, outIdx);
}

// ─── Public API ─────────────────────────────────────

/**
 * Decode an animated GIF from raw bytes.
 *
 * Handles disposal methods properly by compositing onto
 * a persistent canvas, matching browser rendering behaviour.
 */
export function decodeGif(raw: Uint8Array): DecodedGif {
  const r = new ByteReader(raw);

  // ─── Header ───
  const sig = new TextDecoder().decode(r.readBytes(6));
  if (sig !== "GIF87a" && sig !== "GIF89a") {
    throw new Error("Not a GIF file");
  }

  // ─── Logical Screen Descriptor ───
  const width = r.readLE16();
  const height = r.readLE16();
  const packed = r.readByte();
  r.readByte(); // bg index
  r.readByte(); // aspect ratio

  const hasGCT = (packed & 0x80) !== 0;
  const gctSize = hasGCT ? 1 << ((packed & 7) + 1) : 0;

  // ─── Global Colour Table ───
  const gct: Uint8Array = hasGCT ? r.readBytes(gctSize * 3) : new Uint8Array(0);

  // ─── Parse frames ───
  const frames: DecodedGifFrame[] = [];

  // Canvas for compositing (handles disposal methods)
  const canvasData = new Uint8ClampedArray(width * height * 4);
  let savedCanvas: Uint8ClampedArray | null = null;

  let gceDelay = 100;
  let gceDisposal = 0;
  let gceTransparent = -1;

  while (r.hasMore()) {
    const introducer = r.readByte();

    if (introducer === 0x3B) break; // Trailer

    if (introducer === 0x21) {
      // Extension
      const label = r.readByte();

      if (label === 0xF9) {
        // Graphics Control Extension
        r.readByte(); // block size (always 4)
        const gcePacked = r.readByte();
        gceDisposal = (gcePacked >> 2) & 7;
        const hasTransparency = (gcePacked & 1) !== 0;
        gceDelay = Math.max(r.readLE16() * 10, 20); // convert centiseconds to ms
        const transIdx = r.readByte();
        gceTransparent = hasTransparency ? transIdx : -1;
        r.readByte(); // terminator
      } else {
        // Skip other extensions
        r.skipSubBlocks();
      }
      continue;
    }

    if (introducer === 0x2C) {
      // Image Descriptor
      const imgLeft = r.readLE16();
      const imgTop = r.readLE16();
      const imgWidth = r.readLE16();
      const imgHeight = r.readLE16();
      const imgPacked = r.readByte();

      const hasLCT = (imgPacked & 0x80) !== 0;
      const interlaced = (imgPacked & 0x40) !== 0;
      const lctSize = hasLCT ? 1 << ((imgPacked & 7) + 1) : 0;

      const lct = hasLCT ? r.readBytes(lctSize * 3) : null;
      const colorTable = lct || gct;

      // Save canvas before compositing (for disposal 3)
      if (gceDisposal === 3) {
        savedCanvas = new Uint8ClampedArray(canvasData);
      }

      // ─── LZW decode ───
      const minCodeSize = r.readByte();
      const compressedData = r.readSubBlocks();
      const pixelCount = imgWidth * imgHeight;
      const indexed = lzwDecode(compressedData, minCodeSize, pixelCount);

      // ─── Deinterlace if needed ───
      let deinterlaced = indexed;
      if (interlaced) {
        deinterlaced = new Uint8Array(pixelCount);
        const passes = [
          { start: 0, step: 8 },
          { start: 4, step: 8 },
          { start: 2, step: 4 },
          { start: 1, step: 2 },
        ];
        let srcRow = 0;
        for (const pass of passes) {
          for (let y = pass.start; y < imgHeight; y += pass.step) {
            const srcOff = srcRow * imgWidth;
            const dstOff = y * imgWidth;
            deinterlaced.set(indexed.slice(srcOff, srcOff + imgWidth), dstOff);
            srcRow++;
          }
        }
      }

      // ─── Composite onto canvas ───
      for (let y = 0; y < imgHeight; y++) {
        for (let x = 0; x < imgWidth; x++) {
          const srcIdx = y * imgWidth + x;
          const colorIdx = deinterlaced[srcIdx];
          if (colorIdx === gceTransparent) continue; // transparent pixel

          const cx = imgLeft + x;
          const cy = imgTop + y;
          if (cx >= width || cy >= height) continue;

          const dstOff = (cy * width + cx) * 4;
          const cOff = colorIdx * 3;
          canvasData[dstOff]     = colorTable[cOff];
          canvasData[dstOff + 1] = colorTable[cOff + 1];
          canvasData[dstOff + 2] = colorTable[cOff + 2];
          canvasData[dstOff + 3] = 255;
        }
      }

      // Snapshot the composited frame
      const frameData = new ImageData(
        new Uint8ClampedArray(canvasData),
        width,
        height,
      );
      frames.push({ imageData: frameData, delay: gceDelay });

      // ─── Handle disposal for NEXT frame ───
      if (gceDisposal === 2) {
        // Restore to background (clear the sub-image area)
        for (let y = 0; y < imgHeight; y++) {
          for (let x = 0; x < imgWidth; x++) {
            const cx = imgLeft + x;
            const cy = imgTop + y;
            if (cx < width && cy < height) {
              const off = (cy * width + cx) * 4;
              canvasData[off] = 0;
              canvasData[off + 1] = 0;
              canvasData[off + 2] = 0;
              canvasData[off + 3] = 0;
            }
          }
        }
      } else if (gceDisposal === 3 && savedCanvas) {
        // Restore previous
        canvasData.set(savedCanvas);
      }

      // Reset GCE for next frame
      gceDelay = 100;
      gceDisposal = 0;
      gceTransparent = -1;
      continue;
    }

    // Unknown block, try to skip
    if (introducer === 0x00) continue; // padding
    break;
  }

  return { width, height, frames };
}

/**
 * Check if raw bytes are an animated GIF (>1 frame).
 */
export function isAnimatedGif(raw: Uint8Array): boolean {
  try {
    const sig = new TextDecoder().decode(raw.slice(0, 6));
    if (sig !== "GIF87a" && sig !== "GIF89a") return false;
    // Quick check: count image descriptors (0x2C)
    let count = 0;
    for (let i = 6; i < raw.length - 1; i++) {
      if (raw[i] === 0x2C) {
        count++;
        if (count > 1) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
