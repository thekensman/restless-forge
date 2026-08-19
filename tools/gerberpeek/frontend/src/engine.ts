// @ts-nocheck
/* GerberPeek — engine.js: Gerber RS-274X parser & renderer (browser-only) */

export const LAYER_COLORS = {
  'F.Cu':    '#cc0000', 'B.Cu':    '#0000cc',
  'F.Mask':  '#800080', 'B.Mask':  '#008080',
  'F.Silk':  '#cccc00', 'B.Silk':  '#808000',
  'F.Paste': '#cc6600', 'B.Paste': '#006666',
  'Edge.Cuts':'#ffff00', 'Drill':  '#ffffff',
};

/** Detect layer type from filename */
export function detectLayer(filename) {
  const fn = filename.toLowerCase();
  if (fn.includes('f.cu') || fn.includes('-f_cu') || fn.includes('.gtl')) return 'F.Cu';
  if (fn.includes('b.cu') || fn.includes('-b_cu') || fn.includes('.gbl')) return 'B.Cu';
  if (fn.includes('f.mask') || fn.includes('.gts')) return 'F.Mask';
  if (fn.includes('b.mask') || fn.includes('.gbs')) return 'B.Mask';
  if (fn.includes('f.silk') || fn.includes('.gto')) return 'F.Silk';
  if (fn.includes('b.silk') || fn.includes('.gbo')) return 'B.Silk';
  if (fn.includes('edge') || fn.includes('.gm1')) return 'Edge.Cuts';
  if (fn.includes('drill') || fn.includes('.drl') || fn.includes('.xln')) return 'Drill';
  if (fn.includes('f.paste') || fn.includes('.gtp')) return 'F.Paste';
  if (fn.includes('b.paste') || fn.includes('.gbp')) return 'B.Paste';
  return null;
}

/**
 * Parse Gerber RS-274X content into draw commands.
 * Simplified parser handling D01/D02/D03, G01/G02/G03, apertures.
 */
export function parseGerber(content) {
  const commands = [];
  const apertures = {};
  let x = 0, y = 0, currentAp = null, polarity = 'dark';
  const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('G04'));

  for (const line of lines) {
    // Aperture definition: %ADD<code><shape>,<params>*%
    const apMatch = line.match(/%ADD(\d+)([CROA]),?([\d.X]*).*%/);
    if (apMatch) {
      const [, code, shape, params] = apMatch;
      apertures[code] = { shape, size: parseFloat(params) || 0 };
      continue;
    }
    // Polarity
    if (line.includes('%LPD%')) { polarity = 'dark'; continue; }
    if (line.includes('%LPC%')) { polarity = 'clear'; continue; }
    // Tool select: D<nn>
    const toolMatch = line.match(/^D(\d+)\*$/);
    if (toolMatch && parseInt(toolMatch[1]) >= 10) { currentAp = toolMatch[1]; continue; }
    // Coordinate + operation
    const coordMatch = line.match(/^(?:X(-?\d+))?(?:Y(-?\d+))?D(\d+)\*$/);
    if (coordMatch) {
      if (coordMatch[1]) x = parseInt(coordMatch[1]);
      if (coordMatch[2]) y = parseInt(coordMatch[2]);
      const op = parseInt(coordMatch[3]);
      const ap = apertures[currentAp] || { shape: 'C', size: 0.01 };
      if (op === 1) commands.push({ type: 'draw', x, y, ap, polarity });
      if (op === 2) commands.push({ type: 'move', x, y });
      if (op === 3) commands.push({ type: 'flash', x, y, ap, polarity });
    }
  }
  return { commands, apertures, bounds: calcBounds(commands) };
}

function calcBounds(commands) {
  if (commands.length === 0) return { minX:0, minY:0, maxX:100, maxY:100 };
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for (const c of commands) {
    minX = Math.min(minX, c.x); minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Render a parsed Gerber layer to canvas.
 */
export function renderLayer(ctx, parsed, color, scale, offsetX, offsetY) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  let px = 0, py = 0;

  for (const cmd of parsed.commands) {
    const sx = (cmd.x - parsed.bounds.minX) * scale + offsetX;
    const sy = (cmd.y - parsed.bounds.minY) * scale + offsetY;

    if (cmd.type === 'move') { px = sx; py = sy; continue; }
    if (cmd.type === 'draw') {
      const w = (cmd.ap?.size || 0.01) * scale * 1000;
      ctx.lineWidth = Math.max(0.5, w);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke();
      px = sx; py = sy;
    }
    if (cmd.type === 'flash') {
      const r = Math.max(1, (cmd.ap?.size || 0.01) * scale * 500);
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.fill();
      px = sx; py = sy;
    }
  }
}

/** Basic DRC checks */
export function runDRC(layers) {
  const issues = [];
  for (const [name, parsed] of Object.entries(layers)) {
    if (parsed.commands.length === 0) issues.push({ severity: 'warning', msg: `Layer ${name} is empty` });
    for (const ap of Object.values(parsed.apertures)) {
      if (ap.size > 0 && ap.size < 0.001) issues.push({ severity: 'warning', msg: `${name}: Very small aperture (${ap.size}mm) — may cause manufacturing issues` });
    }
  }
  if (!layers['Edge.Cuts']) issues.push({ severity: 'info', msg: 'No board outline layer detected' });
  return issues;
}
