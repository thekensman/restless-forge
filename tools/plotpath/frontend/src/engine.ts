// @ts-nocheck
/* PlotPath — engine.js: SVG path optimization (browser-only) */

/** Plotter device profiles */
export const DEVICES = {
  axidraw_v3:  { label: 'AxiDraw V3',    w: 152, h: 101, unit: 'mm' },
  axidraw_a3:  { label: 'AxiDraw V3/A3', w: 297, h: 218, unit: 'mm' },
  axidraw_se:  { label: 'AxiDraw SE/A3', w: 432, h: 297, unit: 'mm' },
  hp_7475a:    { label: 'HP 7475A',      w: 254, h: 184, unit: 'mm' },
  hp_7550a:    { label: 'HP 7550A',      w: 406, h: 277, unit: 'mm' },
  idraw_h_a3:  { label: 'iDraw H A3',    w: 420, h: 297, unit: 'mm' },
  custom:      { label: 'Custom',         w: 200, h: 200, unit: 'mm' },
};

/**
 * Parse SVG string and extract all path elements.
 * Uses DOMParser in the browser.
 * @param {string} svgString
 * @returns {Array<{d: string, stroke: string, points: [{x,y}]}>}
 */
export function parseSVG(svgString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const paths = [];

  doc.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse').forEach(el => {
    const pts = elementToPoints(el);
    if (pts.length >= 2) {
      paths.push({
        d: el.getAttribute('d') || '',
        stroke: el.getAttribute('stroke') || '#000',
        points: pts,
      });
    }
  });
  return paths;
}

function elementToPoints(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === 'line') return [{x:+el.getAttribute('x1'),y:+el.getAttribute('y1')},{x:+el.getAttribute('x2'),y:+el.getAttribute('y2')}];
  if (tag === 'rect') { const x=+el.getAttribute('x')||0,y=+el.getAttribute('y')||0,w=+el.getAttribute('width'),h=+el.getAttribute('height'); return [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h},{x,y}]; }
  if (tag === 'circle') { const cx=+el.getAttribute('cx'),cy=+el.getAttribute('cy'),r=+el.getAttribute('r'); return sampleCircle(cx,cy,r); }
  if (tag === 'path') return samplePath(el);
  if (tag === 'polyline' || tag === 'polygon') return parsePointsAttr(el.getAttribute('points'), tag === 'polygon');
  return [];
}

function sampleCircle(cx, cy, r, n=36) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = (i/n)*Math.PI*2; pts.push({x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)}); }
  return pts;
}

function samplePath(el) {
  try {
    const len = el.getTotalLength();
    const pts = [];
    const steps = Math.max(10, Math.round(len / 2));
    for (let i = 0; i <= steps; i++) {
      const p = el.getPointAtLength((i/steps)*len);
      pts.push({x:p.x, y:p.y});
    }
    return pts;
  } catch { return []; }
}

function parsePointsAttr(str, close) {
  if (!str) return [];
  const pts = str.trim().split(/[\s,]+/).reduce((acc, _, i, arr) => {
    if (i % 2 === 0 && i+1 < arr.length) acc.push({x:+arr[i],y:+arr[i+1]});
    return acc;
  }, []);
  if (close && pts.length > 0) pts.push({...pts[0]});
  return pts;
}

/** Distance between two points */
export function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

/**
 * Nearest-neighbour path sorting. Greedy.
 * @param {Array} paths - each with .points array
 * @returns {Array} sorted paths (new order, may flip direction)
 */
export function sortPathsNN(paths) {
  if (paths.length <= 1) return [...paths];
  const used = new Set();
  const sorted = [];
  let pos = {x: 0, y: 0};

  for (let i = 0; i < paths.length; i++) {
    let bestIdx = -1, bestDist = Infinity, flip = false;
    for (let j = 0; j < paths.length; j++) {
      if (used.has(j)) continue;
      const pts = paths[j].points;
      const dStart = dist(pos, pts[0]);
      const dEnd = dist(pos, pts[pts.length-1]);
      const d = Math.min(dStart, dEnd);
      if (d < bestDist) { bestDist = d; bestIdx = j; flip = dEnd < dStart; }
    }
    used.add(bestIdx);
    const path = {...paths[bestIdx]};
    if (flip) path.points = [...path.points].reverse();
    sorted.push(path);
    pos = path.points[path.points.length-1];
  }
  return sorted;
}

/** Group paths by stroke color */
export function groupByColor(paths) {
  const groups = {};
  paths.forEach(p => {
    const c = p.stroke || '#000';
    (groups[c] = groups[c] || []).push(p);
  });
  return groups;
}

/**
 * Calculate total travel distance (pen-up movements between paths).
 */
export function totalTravel(paths) {
  let travel = 0, pos = {x:0, y:0};
  for (const p of paths) {
    travel += dist(pos, p.points[0]);
    pos = p.points[p.points.length-1];
  }
  return Math.round(travel * 100) / 100;
}

/**
 * Fit paths to a device's paper size.
 * @param {Array} paths
 * @param {string} deviceKey
 * @param {number} padding - mm
 * @returns {Array} scaled paths
 */
export function fitToDevice(paths, deviceKey, padding = 5) {
  const dev = DEVICES[deviceKey] || DEVICES.custom;
  const allPts = paths.flatMap(p => p.points);
  if (allPts.length === 0) return paths;

  const minX = Math.min(...allPts.map(p=>p.x)), maxX = Math.max(...allPts.map(p=>p.x));
  const minY = Math.min(...allPts.map(p=>p.y)), maxY = Math.max(...allPts.map(p=>p.y));
  const srcW = maxX - minX || 1, srcH = maxY - minY || 1;
  const tgtW = dev.w - padding*2, tgtH = dev.h - padding*2;
  const scale = Math.min(tgtW / srcW, tgtH / srcH);
  const offX = padding + (tgtW - srcW * scale) / 2;
  const offY = padding + (tgtH - srcH * scale) / 2;

  return paths.map(p => ({
    ...p,
    points: p.points.map(pt => ({
      x: (pt.x - minX) * scale + offX,
      y: (pt.y - minY) * scale + offY,
    })),
  }));
}

/** Export as optimized SVG string */
export function toSVG(paths, width, height) {
  const pathStrs = paths.map(p => {
    const d = p.points.map((pt, i) => `${i===0?'M':'L'}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(' ');
    return `<path d="${d}" stroke="${p.stroke}" fill="none" stroke-width="0.5"/>`;
  }).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}mm" height="${height}mm">\n  ${pathStrs}\n</svg>`;
}

/** Export as HPGL string */
export function toHPGL(paths) {
  const lines = ['IN;SP1;'];
  for (const p of paths) {
    const pts = p.points;
    lines.push(`PU${Math.round(pts[0].x*40)},${Math.round(pts[0].y*40)};`);
    for (let i = 1; i < pts.length; i++) {
      lines.push(`PD${Math.round(pts[i].x*40)},${Math.round(pts[i].y*40)};`);
    }
  }
  lines.push('PU0,0;SP0;');
  return lines.join('\n');
}
