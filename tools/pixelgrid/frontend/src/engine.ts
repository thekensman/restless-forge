// @ts-nocheck
/* PixelGrid — engine.js: Image → cross-stitch/bead pattern (browser-only) */

/** DMC thread color palette (subset of most popular colors) */
export const DMC_COLORS = [
  {id:'310',hex:'#000000',name:'Black'},{id:'blanc',hex:'#ffffff',name:'White'},
  {id:'321',hex:'#cc0000',name:'Red'},{id:'666',hex:'#e60000',name:'Bright Red'},
  {id:'815',hex:'#7a0000',name:'Dark Red'},{id:'310',hex:'#333333',name:'Dark Grey'},
  {id:'318',hex:'#808080',name:'Grey'},{id:'415',hex:'#b3b3b3',name:'Light Grey'},
  {id:'820',hex:'#0033cc',name:'Royal Blue'},{id:'796',hex:'#000080',name:'Navy'},
  {id:'3843',hex:'#3399ff',name:'Light Blue'},{id:'700',hex:'#006600',name:'Green'},
  {id:'906',hex:'#00cc00',name:'Bright Green'},{id:'3346',hex:'#336633',name:'Forest Green'},
  {id:'725',hex:'#ffcc00',name:'Yellow'},{id:'740',hex:'#ff9900',name:'Orange'},
  {id:'3607',hex:'#cc0066',name:'Pink'},{id:'553',hex:'#6600cc',name:'Purple'},
  {id:'898',hex:'#663300',name:'Brown'},{id:'842',hex:'#cc9966',name:'Tan'},
];

/** Perler bead color palette */
export const PERLER_COLORS = [
  {id:'P01',hex:'#ffffff',name:'White'},{id:'P02',hex:'#fffacd',name:'Cream'},
  {id:'P03',hex:'#ffff00',name:'Yellow'},{id:'P04',hex:'#ff8c00',name:'Orange'},
  {id:'P05',hex:'#ff0000',name:'Red'},{id:'P06',hex:'#ff69b4',name:'Hot Pink'},
  {id:'P07',hex:'#800080',name:'Purple'},{id:'P08',hex:'#0000ff',name:'Blue'},
  {id:'P09',hex:'#00bfff',name:'Light Blue'},{id:'P10',hex:'#008000',name:'Green'},
  {id:'P11',hex:'#90ee90',name:'Light Green'},{id:'P12',hex:'#8b4513',name:'Brown'},
  {id:'P13',hex:'#d2b48c',name:'Tan'},{id:'P14',hex:'#808080',name:'Grey'},
  {id:'P15',hex:'#000000',name:'Black'},{id:'P16',hex:'#ffc0cb',name:'Pink'},
];

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return {r,g,b};
}

function colorDistance(a, b) {
  return Math.sqrt((a.r-b.r)**2 + (a.g-b.g)**2 + (a.b-b.b)**2);
}

/** Find nearest color from a palette */
export function nearestColor(rgb, palette) {
  let best = palette[0], bestDist = Infinity;
  for (const c of palette) {
    const d = colorDistance(rgb, hexToRgb(c.hex));
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

/**
 * Convert an image to a grid pattern.
 * @param {HTMLCanvasElement} canvas - source image
 * @param {number} gridW - grid width in cells
 * @param {string} paletteType - 'dmc' or 'perler'
 * @param {number} maxColors - max colors to use
 * @returns {{ grid: string[][], palette: Object[], counts: Object, gridW, gridH }}
 */
export function generatePattern(canvas, gridW, paletteType, maxColors) {
  const ctx = canvas.getContext('2d');
  const aspect = canvas.height / canvas.width;
  const gridH = Math.round(gridW * aspect);
  const cellW = canvas.width / gridW;
  const cellH = canvas.height / gridH;

  const basePalette = paletteType === 'dmc' ? DMC_COLORS : PERLER_COLORS;
  const grid = [];
  const colorCounts = {};

  for (let gy = 0; gy < gridH; gy++) {
    const row = [];
    for (let gx = 0; gx < gridW; gx++) {
      const px = Math.floor(gx * cellW + cellW/2);
      const py = Math.floor(gy * cellH + cellH/2);
      const [r,g,b] = ctx.getImageData(px, py, 1, 1).data;
      const match = nearestColor({r,g,b}, basePalette);
      row.push(match.id);
      colorCounts[match.id] = (colorCounts[match.id] || 0) + 1;
    }
    grid.push(row);
  }

  // Limit colors: keep top N by frequency
  if (maxColors && Object.keys(colorCounts).length > maxColors) {
    const sorted = Object.entries(colorCounts).sort((a,b) => b[1]-a[1]);
    const keep = new Set(sorted.slice(0, maxColors).map(e => e[0]));
    const keptPalette = basePalette.filter(c => keep.has(c.id));

    // Remap non-kept colors to nearest kept color
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        if (!keep.has(grid[gy][gx])) {
          const original = basePalette.find(c => c.id === grid[gy][gx]);
          const nearest = nearestColor(hexToRgb(original?.hex || '#000'), keptPalette);
          grid[gy][gx] = nearest.id;
        }
      }
    }
  }

  // Build used palette
  const usedIds = new Set(grid.flat());
  const palette = basePalette.filter(c => usedIds.has(c.id));

  // Recount
  const finalCounts = {};
  grid.flat().forEach(id => finalCounts[id] = (finalCounts[id]||0) + 1);

  return { grid, palette, counts: finalCounts, gridW, gridH };
}

/** Generate a printable SVG of the pattern */
export function patternToSVG(pattern, cellSize = 12) {
  const { grid, palette, gridW, gridH } = pattern;
  const w = gridW * cellSize, h = gridH * cellSize;
  const colorMap = {};
  palette.forEach(c => colorMap[c.id] = c.hex);

  let rects = '';
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const fill = colorMap[grid[y][x]] || '#000';
      rects += `<rect x="${x*cellSize}" y="${y*cellSize}" width="${cellSize}" height="${cellSize}" fill="${fill}" stroke="#333" stroke-width="0.3"/>`;
    }
  }
  // Grid lines
  let lines = '';
  for (let x = 0; x <= gridW; x++) lines += `<line x1="${x*cellSize}" y1="0" x2="${x*cellSize}" y2="${h}" stroke="#555" stroke-width="${x%10===0?0.5:0.2}"/>`;
  for (let y = 0; y <= gridH; y++) lines += `<line x1="0" y1="${y*cellSize}" x2="${w}" y2="${y*cellSize}" stroke="#555" stroke-width="${y%10===0?0.5:0.2}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${rects}${lines}</svg>`;
}
