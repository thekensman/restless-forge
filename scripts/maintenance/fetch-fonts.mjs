#!/usr/bin/env node
/* fetch-fonts.mjs: self-host the web fonts every page uses. Maintenance only;
 * the build never runs it, and its output is committed.
 *
 *   node scripts/maintenance/fetch-fonts.mjs
 *   (behind an HTTPS proxy on Node 22+: NODE_USE_ENV_PROXY=1 node ...)
 *
 * Pages used to load their fonts from Google Fonts, which hands every visitor's
 * IP address to Google on every page view. This downloads the files Google
 * serves for the families below (the same woff2 files, unicode ranges and
 * font-display), keeps the latin and latin-ext subsets, and writes:
 *
 *   site/fonts/<family>/*.woff2   named with a content hash, so a changed file
 *                                 gets a new URL and the 1-year immutable cache
 *                                 nginx gives woff2 never serves a stale one
 *   site/fonts/<family>/OFL.txt   each family's SIL Open Font License, from its
 *                                 Fontsource npm package
 *   site/fonts.css                every @font-face rule, imported by
 *                                 site/styles.css and site/tool-chrome.css and
 *                                 linked by the few pages that load neither
 *
 * A browser downloads only the faces a page's CSS actually uses, so one shared
 * stylesheet costs a page nothing for the families it does not use.
 *
 * To add a family or weight: add it to FAMILIES, run this, commit the result.
 * check-links fails the build on any reference to fonts.googleapis.com or
 * fonts.gstatic.com, so a new page cannot quietly bring Google Fonts back.
 */
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "site", "fonts");
const CSS = join(ROOT, "site", "fonts.css");

// [Google Fonts css2 family spec, Fontsource package name for the licence]
const FAMILIES = [
  ["IBM+Plex+Mono:wght@300;400;500;600", "ibm-plex-mono"],
  ["Lora:ital,wght@0,400;0,500;0,600;0,700;1,400", "lora"],
  ["Playfair+Display:ital,wght@0,400;0,600;1,400", "playfair-display"],
  ["Inter:wght@300;400;500;600", "inter"],
  ["Orbitron:wght@400;600;700;900", "orbitron"],
  ["Share+Tech+Mono", "share-tech-mono"],
  ["Cormorant+Garamond:ital,wght@0,400;0,600;1,400", "cormorant-garamond"],
  ["Outfit:wght@300;400;500;600", "outfit"],
  ["DM+Serif+Display:ital@0;1", "dm-serif-display"],
  ["Source+Sans+3:wght@400;500;600;700", "source-sans-3"],
];
const SUBSETS = new Set(["latin", "latin-ext"]);
// Google picks the file format from the User-Agent; this one gets woff2.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function get(url, binary = false) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return binary ? Buffer.from(await r.arrayBuffer()) : r.text();
}

/* The LICENSE file out of an npm tarball (ustar: 512-byte headers). */
function fileFromTarball(tgz, wanted) {
  const tar = gunzipSync(tgz);
  for (let off = 0; off + 512 <= tar.length;) {
    const name = tar.toString("utf8", off, off + 100).replace(/\0.*$/s, "");
    if (!name) break;
    const size = parseInt(tar.toString("utf8", off + 124, off + 136).replace(/\0.*$/s, "").trim() || "0", 8);
    if (name === wanted) return tar.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${wanted} not in tarball`);
}

const tmp = `${OUT}.tmp`;
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const rules = [];
let files = 0, bytes = 0;

for (const [spec, pkg] of FAMILIES) {
  const css = await get(`https://fonts.googleapis.com/css2?family=${spec}&display=swap`);
  const faces = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g)]
    .map(([, subset, body]) => {
      const prop = (p) => (body.match(new RegExp(`${p}:\\s*([^;]+);`)) || [])[1]?.trim();
      return { subset, family: prop("font-family"), style: prop("font-style"), weight: prop("font-weight"),
        url: (prop("src").match(/url\(([^)]+)\)/) || [])[1], range: prop("unicode-range") };
    })
    .filter((f) => SUBSETS.has(f.subset));
  if (!faces.length) throw new Error(`${spec}: no latin faces in Google's response`);
  mkdirSync(join(tmp, pkg), { recursive: true });
  const local = new Map(); // Google URL → our path (variable fonts reuse one file across weights)
  for (const f of faces) {
    if (!local.has(f.url)) {
      const woff2 = await get(f.url, true);
      const weights = faces.filter((x) => x.url === f.url).map((x) => x.weight);
      const span = weights.length > 1 ? `${weights[0]}-${weights.at(-1)}` : weights[0];
      const hash = createHash("sha256").update(woff2).digest("hex").slice(0, 8);
      const name = `${pkg}-${f.subset}-${f.style}-${span}.${hash}.woff2`;
      writeFileSync(join(tmp, pkg, name), woff2);
      local.set(f.url, `/fonts/${pkg}/${name}`);
      files++; bytes += woff2.length;
    }
    rules.push(`/* ${f.family}, ${f.style} ${f.weight}, ${f.subset} */\n@font-face {\n` +
      `  font-family: ${f.family};\n  font-style: ${f.style};\n  font-weight: ${f.weight};\n` +
      `  font-display: swap;\n  src: url(${local.get(f.url)}) format('woff2');\n  unicode-range: ${f.range};\n}`);
  }
  const meta = JSON.parse(await get(`https://registry.npmjs.org/@fontsource/${pkg}/latest`));
  const licence = fileFromTarball(await get(meta.dist.tarball, true), "package/LICENSE");
  if (!/SIL OPEN FONT LICENSE/i.test(licence.toString())) throw new Error(`${pkg}: LICENSE is not the OFL`);
  writeFileSync(join(tmp, pkg, "OFL.txt"), licence);
  console.log(`  ${pkg}: ${faces.length} faces, ${local.size} files`);
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
renameSync(tmp, OUT);
writeFileSync(CSS, `/* fonts.css: GENERATED by scripts/maintenance/fetch-fonts.mjs. Do not edit; rerun it.
   Self-hosted copies of the Google Fonts files this site uses (latin and
   latin-ext), under the SIL Open Font License (site/fonts/<family>/OFL.txt). */
${rules.join("\n")}
`);
console.log(`fetch-fonts: ${files} files, ${(bytes / 1024).toFixed(0)} KB, ${rules.length} @font-face rules → site/fonts.css`);
