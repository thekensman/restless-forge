// @ts-nocheck
/* WaveCarve — engine.js: Audio → waveform art (browser-only via Web Audio API) */

/**
 * Decode audio file to waveform samples.
 * @param {ArrayBuffer} audioBuffer - raw file bytes
 * @returns {Promise<Float32Array>} normalised samples (-1 to 1)
 */
export async function decodeAudio(audioBuffer) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(audioBuffer);
  const channel = decoded.getChannelData(0); // mono or left channel
  ctx.close();
  return channel;
}

/**
 * Downsample waveform to target number of points.
 * Uses RMS (root mean square) for each window.
 */
export function downsample(samples, targetPoints) {
  const windowSize = Math.floor(samples.length / targetPoints);
  const result = new Float32Array(targetPoints);
  for (let i = 0; i < targetPoints; i++) {
    let sum = 0;
    const start = i * windowSize;
    const end = Math.min(start + windowSize, samples.length);
    for (let j = start; j < end; j++) sum += samples[j] * samples[j];
    result[i] = Math.sqrt(sum / (end - start));
  }
  return result;
}

/**
 * Smooth waveform with moving average.
 */
export function smooth(data, windowSize = 3) {
  const result = new Float32Array(data.length);
  const half = Math.floor(windowSize / 2);
  for (let i = 0; i < data.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i-half); j <= Math.min(data.length-1, i+half); j++) {
      sum += data[j]; count++;
    }
    result[i] = sum / count;
  }
  return result;
}

/**
 * Generate SVG waveform art.
 * @param {Float32Array} rmsData - downsampled RMS values
 * @param {Object} opts - { width, height, style, color, baseline }
 * @returns {string} SVG string
 */
export function toSVG(rmsData, opts = {}) {
  const w = opts.width || 800, h = opts.height || 200;
  const style = opts.style || 'bars'; // 'bars', 'line', 'mirror'
  const color = opts.color || '#7c6af0';
  const baseline = h / 2;

  if (style === 'bars') {
    const barW = w / rmsData.length;
    const bars = Array.from(rmsData).map((v, i) => {
      const barH = v * h * 0.9;
      return `<rect x="${i*barW}" y="${baseline - barH/2}" width="${Math.max(0.5, barW-0.5)}" height="${barH}" fill="${color}"/>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="none"/>${bars}</svg>`;
  }

  if (style === 'mirror') {
    const pts = Array.from(rmsData);
    const topPath = pts.map((v, i) => `${i===0?'M':'L'}${(i/(pts.length-1))*w},${baseline - v*baseline*0.9}`).join(' ');
    const botPath = pts.map((v, i) => `L${(i/(pts.length-1))*w},${baseline + v*baseline*0.9}`).join(' ');
    const revBot = pts.slice().reverse().map((v, i) => `L${((pts.length-1-i)/(pts.length-1))*w},${baseline + v*baseline*0.9}`).join(' ');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><path d="${topPath} ${revBot} Z" fill="${color}" opacity="0.7"/></svg>`;
  }

  // Line style
  const d = Array.from(rmsData).map((v, i) => `${i===0?'M':'L'}${(i/(rmsData.length-1))*w},${baseline - v*baseline*0.9}`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"/></svg>`;
}

/** Generate DXF string (AutoCAD format) */
export function toDXF(rmsData, width = 300, height = 80) {
  const baseline = height / 2;
  let dxf = '0\nSECTION\n2\nENTITIES\n';
  for (let i = 0; i < rmsData.length - 1; i++) {
    const x1 = (i / (rmsData.length-1)) * width;
    const x2 = ((i+1) / (rmsData.length-1)) * width;
    const y1 = baseline + rmsData[i] * baseline * 0.9;
    const y2 = baseline + rmsData[i+1] * baseline * 0.9;
    dxf += `0\nLINE\n8\nWAVEFORM\n10\n${x1}\n20\n${y1}\n30\n0\n11\n${x2}\n21\n${y2}\n31\n0\n`;
    // Mirror bottom
    const y1b = baseline - rmsData[i] * baseline * 0.9;
    const y2b = baseline - rmsData[i+1] * baseline * 0.9;
    dxf += `0\nLINE\n8\nWAVEFORM\n10\n${x1}\n20\n${y1b}\n30\n0\n11\n${x2}\n21\n${y2b}\n31\n0\n`;
  }
  dxf += '0\nENDSEC\n0\nEOF\n';
  return dxf;
}

/** Generate STL string (ASCII format) for 3D printing */
export function toSTL(rmsData, width = 150, height = 40, depth = 3) {
  const baseline = height / 2;
  let stl = 'solid waveform\n';
  for (let i = 0; i < rmsData.length - 1; i++) {
    const x1 = (i / (rmsData.length-1)) * width;
    const x2 = ((i+1) / (rmsData.length-1)) * width;
    const h1 = depth + rmsData[i] * depth * 3;
    const h2 = depth + rmsData[i+1] * depth * 3;
    // Top face triangle pair
    stl += `facet normal 0 0 1\n outer loop\n  vertex ${x1} 0 ${h1}\n  vertex ${x2} 0 ${h2}\n  vertex ${x2} ${height} ${h2}\n endloop\nendfacet\n`;
    stl += `facet normal 0 0 1\n outer loop\n  vertex ${x1} 0 ${h1}\n  vertex ${x2} ${height} ${h2}\n  vertex ${x1} ${height} ${h1}\n endloop\nendfacet\n`;
  }
  stl += 'endsolid waveform\n';
  return stl;
}

/** Trigger file download */
export function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
