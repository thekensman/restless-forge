#!/usr/bin/env node
/* inject-font-preloads.mjs: tell the browser about a page's fonts in its HTML.
 *
 * Run by build.sh on dist/, before the cache-busting step. Nothing in the
 * source tree changes.
 *
 * WHY
 *
 * Since the fonts were self-hosted, a page finds them at the end of a chain:
 *
 *   page.html → /styles.css (or /tool-chrome.css) → @import /fonts.css → *.woff2
 *
 * Each arrow is a round trip, and the browser cannot start one until the
 * previous file has arrived and been parsed. The fonts were therefore the last
 * thing on the page to load, the page had already been painted in a fallback
 * face by then (font-display: swap), and the swap re-wrapped every paragraph.
 * Measured on the live site in November 2026, first visit: a layout shift of
 * 0.16 to 0.24 from the swap alone, on top of the header shift fixed in
 * site/shared.js. Good is under 0.1. With the font requests blocked the shift
 * disappeared, which is what pinned it on the fonts.
 *
 * A <link rel="preload"> in the HTML starts those downloads with the very
 * first batch of requests, in parallel with the stylesheet, so the fonts are
 * in hand before the first paint and nothing swaps. /fonts.css is preloaded
 * the same way; the @import that follows is then served from that response,
 * and the first paint stops waiting a round trip for it.
 *
 * WHICH FONTS
 *
 * Worked out from the page's own CSS, so a restyled or brand-new tool needs no
 * entry anywhere. For every rule that sets font-family (custom properties
 * resolved), take the first family and the rule's font-weight, and keep the
 * ones /fonts.css actually defines. The page's body face goes first. Only the
 * latin, upright files are preloaded: italics and latin-ext are used by a few
 * words at most and are not worth a high-priority request each. Capped at
 * MAX_FONTS files, because every preload competes with the stylesheet it is
 * meant to help.
 *
 * Restored game pages are skipped: they ship byte for byte (docs/games.md) and
 * bring their own fonts. check-links fails the build if a page that uses the
 * shared fonts comes out of here with no preload, so this step cannot quietly
 * stop running.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const MAX_FONTS = 4;

if (!existsSync(join(dist, "fonts.css"))) {
  console.error("inject-font-preloads: dist/fonts.css not found. Run this from build.sh, after site/ is copied.");
  process.exit(1);
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/* ── The faces /fonts.css defines: family → [{ weight, url }] (latin, upright) ── */
const faces = new Map();
for (const m of stripComments(readFileSync(join(dist, "fonts.css"), "utf8")).matchAll(/@font-face\s*\{([^}]*)\}/g)) {
  const decl = (name) => (m[1].match(new RegExp(`${name}\\s*:\\s*([^;]+)`)) || [])[1]?.trim();
  const family = (decl("font-family") || "").replace(/^['"]|['"]$/g, "");
  const url = (decl("src") || "").match(/url\(\s*['"]?([^'")\s]+)/)?.[1];
  // Google's latin subset is the one that starts at U+0000; latin-ext and the
  // rest carry glyphs most pages never draw.
  const latin = /^U\+0000-00FF/i.test(decl("unicode-range") || "");
  if (!family || !url || !latin || decl("font-style") !== "normal") continue;
  if (!faces.has(family)) faces.set(family, []);
  faces.get(family).push({ weight: Number(decl("font-weight")), url });
}
if (!faces.size) {
  console.error("inject-font-preloads: found no latin faces in dist/fonts.css; has its format changed?");
  process.exit(1);
}

/* The file for a family at a weight: an exact match, else the nearest weight
   the family has (a browser makes the same substitution). */
function fileFor(family, weight) {
  const list = faces.get(family);
  return list.reduce((best, f) => (Math.abs(f.weight - weight) < Math.abs(best.weight - weight) ? f : best)).url;
}

/* ── Which families and weights does this CSS ask for? ── */
const WEIGHT_WORDS = { normal: 400, bold: 700 };
function fontsUsed(css) {
  css = stripComments(css);
  const vars = new Map();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)) vars.set(m[1], m[2].trim());
  const resolve = (value, depth = 0) => (depth > 5 ? value : value.replace(
    /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g,
    (_, name, fallback) => resolve(vars.get(name) ?? fallback ?? "", depth + 1),
  ));
  const used = new Map(); // family → { weights:Set, rules, body }
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selector, body] = m;
    const fam = body.match(/(?:^|[;\s])font-family\s*:\s*([^;]+)/);
    if (!fam) continue;
    const family = resolve(fam[1]).split(",")[0].trim().replace(/^['"]|['"]$/g, "");
    if (!faces.has(family)) continue;
    const raw = resolve((body.match(/(?:^|[;\s])font-weight\s*:\s*([^;]+)/) || [, "400"])[1]).trim();
    const weight = WEIGHT_WORDS[raw] ?? (Number(raw) || 400);
    if (!used.has(family)) used.set(family, { weights: new Set(), rules: 0, body: false });
    const u = used.get(family);
    u.weights.add(weight);
    u.rules++;
    if (/(?:^|[,\s}])(?:html|body)\s*(?:,|$)/.test(selector.trim())) u.body = true;
  }
  return used;
}

function* walkHtml(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walkHtml(p);
    else if (e.name.endsWith(".html")) yield p;
  }
}

const cssCache = new Map();
function readCss(urlPath) {
  if (!cssCache.has(urlPath)) {
    const file = join(dist, decodeURIComponent(urlPath.split("?")[0]));
    cssCache.set(urlPath, existsSync(file) ? readFileSync(file, "utf8") : "");
  }
  return cssCache.get(urlPath);
}

let pages = 0;
let injected = 0;
const summary = new Map();
for (const file of walkHtml(dist)) {
  const rel = relative(dist, file).split("\\").join("/");
  if (/^games\/[^/]+\//.test(rel)) continue; // a restored game page ships unchanged
  pages++;
  let html = readFileSync(file, "utf8");
  if (/rel=["']preload["'][^>]*as=["']font["']/.test(html)) continue; // already done (re-run on the same dist)

  const sheets = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)]
    .map((m) => (m[0].match(/href=["']([^"']+)["']/) || [])[1])
    .filter((href) => href && href.startsWith("/") && !href.startsWith("//"));
  let css = sheets.map(readCss).join("\n");
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css += `\n${m[1]}`;

  const used = fontsUsed(css);
  // Body face first, then whichever family the most rules ask for.
  const families = [...used].sort(([, a], [, b]) => (b.body - a.body) || (b.rules - a.rules));
  const urls = [];
  for (const [family, u] of families) {
    for (const weight of [...u.weights].sort((a, b) => a - b)) {
      const url = fileFor(family, weight);
      if (!urls.includes(url)) urls.push(url);
    }
  }
  if (!urls.length) continue;

  const tags = urls.slice(0, MAX_FONTS)
    .map((url) => `<link rel="preload" href="${url}" as="font" type="font/woff2" crossorigin>`);
  // /fonts.css arrives through an @import in the page's stylesheet. Fetch it
  // alongside that stylesheet instead of after it. Written bare so build.sh
  // gives it the same ?v= hash as the @import; the two URLs must be identical
  // for the browser to reuse the response.
  const importsFonts = /@import\s+url\(\s*["']?\/fonts\.css/.test(css);
  const linksFonts = /<link\b[^>]*href=["']\/fonts\.css/.test(html);
  if (importsFonts && !linksFonts) tags.unshift('<link rel="preload" href="/fonts.css" as="style">');

  const firstSheet = html.match(/^([ \t]*)<link\b[^>]*rel=["']stylesheet["'][^>]*>/im);
  if (firstSheet) {
    const indent = firstSheet[1];
    html = html.replace(firstSheet[0], `${tags.map((t) => indent + t).join("\n")}\n${firstSheet[0]}`);
  } else {
    html = html.replace(/<\/head>/i, `${tags.map((t) => `  ${t}`).join("\n")}\n</head>`);
  }
  writeFileSync(file, html);
  injected++;
  const key = urls.slice(0, MAX_FONTS).map((u) => u.split("/").pop().replace(/\.[0-9a-f]{8}\.woff2$/, "")).join(", ");
  summary.set(key, (summary.get(key) || 0) + 1);
}

for (const [key, n] of [...summary].sort((a, b) => b[1] - a[1])) console.log(`  → ${String(n).padStart(3)} page(s): ${key}`);
console.log(`  → font preloads: ${injected} of ${pages} pages`);
