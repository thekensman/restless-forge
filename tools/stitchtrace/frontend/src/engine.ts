// @ts-nocheck
/* StitchTrace — engine.js: Image → embroidery conversion (browser-only) */

/** Supported output formats */
export const FORMATS = {
  PES: { ext: '.pes', label: 'Brother PES', machines: 'Brother PE800, SE1900, PE535' },
  DST: { ext: '.dst', label: 'Tajima DST', machines: 'Tajima, Barudan, SWF, most commercial' },
  JEF: { ext: '.jef', label: 'Janome JEF', machines: 'Janome MC9850, MC500E, Elna 830' },
};

/** Stitch types with density defaults */
export const STITCH_TYPES = {
  running:  { label: 'Running stitch', density: 2.5, desc: 'Single line outline — fast, minimal thread' },
  satin:    { label: 'Satin stitch', density: 4.0, desc: 'Parallel fills for borders and lettering' },
  fill:     { label: 'Fill stitch', density: 7.0, desc: 'Solid area fills with row patterns' },
};

/** Thread color palette (simplified DMC → RGB mapping) */
export const THREAD_COLORS = [
  { id: 'black', hex: '#000000', name: 'Black' },
  { id: 'white', hex: '#ffffff', name: 'White' },
  { id: 'red', hex: '#cc0000', name: 'Red' },
  { id: 'blue', hex: '#0066cc', name: 'Blue' },
  { id: 'green', hex: '#006633', name: 'Green' },
  { id: 'gold', hex: '#cc9900', name: 'Gold' },
  { id: 'purple', hex: '#660099', name: 'Purple' },
  { id: 'pink', hex: '#e86a92', name: 'Pink' },
  { id: 'navy', hex: '#001a4d', name: 'Navy' },
  { id: 'brown', hex: '#663300', name: 'Brown' },
];

/**
 * Trace image to stitch paths using canvas edge detection.
 * @param {HTMLCanvasElement} canvas - source image drawn on canvas
 * @param {Object} opts - { threshold, minPathLength, simplifyTolerance }
 * @returns {Array<{points: [{x,y}], closed: boolean}>}
 */
export function traceImage(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const threshold = opts.threshold ?? 128;

  // Convert to greyscale binary
  const binary = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const grey = data[i*4]*0.299 + data[i*4+1]*0.587 + data[i*4+2]*0.114;
    binary[i] = grey < threshold ? 1 : 0;
  }

  // Simple contour tracing (Moore neighbourhood)
  const visited = new Uint8Array(w * h);
  const paths = [];

  for (let y = 1; y < h-1; y++) {
    for (let x = 1; x < w-1; x++) {
      const idx = y * w + x;
      if (binary[idx] === 1 && !visited[idx] && binary[idx-1] === 0) {
        const path = traceContour(binary, visited, w, h, x, y);
        if (path.length >= (opts.minPathLength ?? 5)) {
          const simplified = douglasPeucker(path, opts.simplifyTolerance ?? 1.5);
          paths.push({ points: simplified, closed: isClosedPath(simplified) });
        }
      }
    }
  }
  return paths;
}

function traceContour(binary, visited, w, h, startX, startY) {
  const dirs = [[-1,0],[-1,1],[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1]];
  const path = [{x: startX, y: startY}];
  visited[startY * w + startX] = 1;
  let cx = startX, cy = startY, dir = 0;

  for (let step = 0; step < w * h; step++) {
    let found = false;
    for (let d = 0; d < 8; d++) {
      const nd = (dir + d) % 8;
      const nx = cx + dirs[nd][0], ny = cy + dirs[nd][1];
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && binary[ny*w+nx] === 1) {
        if (nx === startX && ny === startY && path.length > 3) return path;
        if (!visited[ny*w+nx]) {
          visited[ny*w+nx] = 1;
          path.push({x: nx, y: ny});
          cx = nx; cy = ny;
          dir = (nd + 5) % 8;
          found = true;
          break;
        }
      }
    }
    if (!found) break;
  }
  return path;
}

function isClosedPath(pts) {
  if (pts.length < 3) return false;
  const dx = pts[0].x - pts[pts.length-1].x;
  const dy = pts[0].y - pts[pts.length-1].y;
  return Math.hypot(dx, dy) < 5;
}

/** Douglas-Peucker path simplification */
export function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;
  let maxDist = 0, maxIdx = 0;
  const first = points[0], last = points[points.length-1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointLineDistance(points[i], first, last);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIdx+1), tolerance);
    const right = douglasPeucker(points.slice(maxIdx), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function pointLineDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy*p.x - dx*p.y + b.x*a.y - b.y*a.x) / len;
}

/**
 * Generate stitches from traced paths.
 * @param {Array} paths - from traceImage()
 * @param {Object} opts - { stitchType, density, widthMm, heightMm }
 * @returns {{ stitches: [{x,y,jump}], bounds: {w,h}, count: number }}
 */
export function generateStitches(paths, opts = {}) {
  const type = opts.stitchType ?? 'running';
  const density = STITCH_TYPES[type]?.density ?? 2.5;
  const stitchLen = 10 / density; // mm between stitches
  const stitches = [];

  for (const path of paths) {
    if (path.points.length < 2) continue;
    // Jump to start
    const first = path.points[0];
    stitches.push({ x: first.x, y: first.y, jump: true });

    // Walk along path at stitch intervals
    let dist = 0;
    for (let i = 1; i < path.points.length; i++) {
      const prev = path.points[i-1], curr = path.points[i];
      const segLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const steps = Math.max(1, Math.round(segLen / stitchLen));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        stitches.push({
          x: prev.x + (curr.x - prev.x) * t,
          y: prev.y + (curr.y - prev.y) * t,
          jump: false,
        });
      }
    }
  }

  return {
    stitches,
    count: stitches.filter(s => !s.jump).length,
    bounds: { w: opts.widthMm ?? 100, h: opts.heightMm ?? 100 },
  };
}

/**
 * Encode stitches to PES binary format (simplified).
 * Returns an ArrayBuffer.
 */
export function encodePES(stitchData) {
  const { stitches, bounds } = stitchData;
  const buf = new ArrayBuffer(stitches.length * 4 + 512);
  const view = new DataView(buf);

  // PES header
  const header = '#PES0001';
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i));
  view.setUint32(8, 20, true); // PEC offset
  view.setUint16(12, Math.round(bounds.w * 10), true);
  view.setUint16(14, Math.round(bounds.h * 10), true);

  // Stitch data (simplified encoding)
  let offset = 20;
  let prevX = 0, prevY = 0;
  for (const s of stitches) {
    const dx = Math.round(s.x - prevX);
    const dy = Math.round(s.y - prevY);
    if (s.jump) {
      view.setUint8(offset++, 0x80 | ((dx >> 4) & 0x0f));
      view.setUint8(offset++, dx & 0xff);
      view.setUint8(offset++, 0x80 | ((dy >> 4) & 0x0f));
      view.setUint8(offset++, dy & 0xff);
    } else {
      view.setInt8(offset++, Math.max(-127, Math.min(127, dx)));
      view.setInt8(offset++, Math.max(-127, Math.min(127, dy)));
    }
    prevX = s.x; prevY = s.y;
  }
  return buf.slice(0, offset);
}

export function encodeDST(stitchData) {
  const { stitches } = stitchData;
  const header = new Uint8Array(512);
  const label = 'LA:StitchTrace\r';
  for (let i = 0; i < label.length; i++) header[i] = label.charCodeAt(i);
  header[511] = 0x1a; // end of header

  const body = [];
  let prevX = 0, prevY = 0;
  for (const s of stitches) {
    const dx = Math.round(s.x - prevX), dy = Math.round(s.y - prevY);
    body.push(
      Math.max(0, Math.min(255, dx + 128)),
      Math.max(0, Math.min(255, dy + 128)),
      s.jump ? 0x83 : 0x03
    );
    prevX = s.x; prevY = s.y;
  }
  body.push(0x00, 0x00, 0xf3); // end

  const result = new Uint8Array(header.length + body.length);
  result.set(header); result.set(new Uint8Array(body), header.length);
  return result.buffer;
}

export function encodeJEF(stitchData) {
  // JEF is similar structure — simplified encoding
  return encodeDST(stitchData); // Use DST as base for JEF
}

/** Trigger browser download of binary data */
export function downloadFile(buffer, filename) {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
