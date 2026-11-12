/**
 * Restored games: the one place that knows which games exist and how they ship.
 *
 * games/games.json is the single source. Each entry names a folder under games/
 * that holds the game's FULL source (tests, tools and notes included) and lists
 * in `files` the runtime subset that ships. A game page is never wrapped in the
 * site layout: it ships byte for byte as it sits in its folder, because its CSS
 * resets the whole page, its input code owns the keyboard, and its boot script
 * expects its own element ids (docs/games.md).
 *
 * Used by:
 *   scripts/sync-static-html.mjs  the /games/ cards, sitemap, llms.txt, and the
 *                                 memorial block in each game page
 *   build.sh                      `node scripts/games.mjs copy <dist>`
 *   scripts/check-links.mjs       verifyGameCopies(): dist matches the source
 *   scripts/test-all.mjs          each game's own tests (`tests` in games.json)
 *
 * Memorials (games/memorials/<id>/) are shared by every game that names one,
 * so the Foobar sequels carry Tom Cruse's without a second copy to drift.
 */
import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const GAMES_DIR = join(ROOT, "games");
/* Folders under games/ that hold shared material, not a game. */
const SHARED_DIRS = new Set(["memorials"]);
const REQUIRED = ["slug", "title", "studio", "year", "desc", "image", "imageAlt", "files", "tests"];

/* Same rule as the site's other data: plain text here, escaped at the HTML boundary. */
export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (s) => esc(s).replace(/"/g, "&quot;");

export function loadGames() {
  const file = join(GAMES_DIR, "games.json");
  const games = JSON.parse(readFileSync(file, "utf8")).games;
  const slugs = new Set();
  for (const g of games) {
    const where = `games/games.json: ${g.slug || "(entry without slug)"}`;
    for (const k of REQUIRED) {
      if (g[k] === undefined || g[k] === "") throw new Error(`${where} has no ${k}`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(g.slug)) throw new Error(`${where}: slug must be lowercase words joined by hyphens`);
    if (slugs.has(g.slug)) throw new Error(`${where}: duplicate slug`);
    slugs.add(g.slug);
    const dir = join(GAMES_DIR, g.slug);
    if (!g.files.includes("index.html")) throw new Error(`${where}: files must include index.html`);
    for (const f of [...g.files, g.image, ...g.tests]) {
      if (!existsSync(join(dir, f))) throw new Error(`${where}: games/${g.slug}/${f} does not exist`);
    }
    if (!g.files.some((f) => g.image === f || g.image.startsWith(`${f}/`))) {
      throw new Error(`${where}: image ${g.image} is not inside a shipped path, so the /games/ card would 404`);
    }
    if (g.memorial) loadMemorial(g.memorial); // throws with a clear message if it is missing
  }
  // The reverse direction: a game folder nobody listed would build into
  // nothing and appear nowhere, which is exactly the forgotten-page failure
  // the sitemap rules exist to prevent.
  for (const e of readdirSync(GAMES_DIR, { withFileTypes: true })) {
    if (!e.isDirectory() || SHARED_DIRS.has(e.name)) continue;
    if (!slugs.has(e.name)) throw new Error(`games/${e.name}/ has no entry in games/games.json`);
  }
  return games;
}

function pngSize(file) {
  const b = readFileSync(file);
  if (b.toString("latin1", 1, 4) !== "PNG") throw new Error(`${relative(ROOT, file)} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

export function loadMemorial(id) {
  const dir = join(GAMES_DIR, "memorials", id);
  const file = join(dir, "memorial.json");
  if (!existsSync(file)) throw new Error(`memorial "${id}": games/memorials/${id}/memorial.json does not exist`);
  const m = JSON.parse(readFileSync(file, "utf8"));
  for (const k of ["photo", "photoAlt", "lines"]) {
    if (!m[k] || (Array.isArray(m[k]) && !m[k].length)) throw new Error(`memorial "${id}" has no ${k}`);
  }
  const photo = join(dir, m.photo);
  if (!/\.png$/i.test(m.photo) || !existsSync(photo)) throw new Error(`memorial "${id}": ${m.photo} is missing or not a .png`);
  return { id, ...m, photoFile: photo, ...pngSize(photo) };
}

/* Where sync copies a memorial's photo inside a game, relative to the game. */
export const memorialPhotoPath = (m) => `assets/memorial/${m.id}.png`;

/* The build number a game stamps on its asset URLs (?v=NN). Read from the
   page's own BUILD constant so the memorial photo is busted with the rest. */
export function gameBuild(slug) {
  const html = readFileSync(join(GAMES_DIR, slug, "index.html"), "utf8");
  return (html.match(/const BUILD\s*=\s*'([^']+)'/) || [])[1] || "";
}

/* The memorial block, written into a game page between generated:memorial
   markers. Inline styles on purpose: the block has to look right inside any
   game's own stylesheet without that game defining a single class for it, and
   the game's custom properties are used where they exist, with fallbacks.
   content-box on the photo because Foobar's reset makes everything border-box,
   which put the 2px border inside the width and scaled the photo off its
   native pixels. 30vw shrinks it on phones, where the title screen is tight. */
export function renderMemorial(m, build) {
  const v = build ? `?v=${build}` : "";
  return [
    `      <figure style="display:flex;align-items:center;justify-content:center;gap:12px;margin:16px auto 0;text-align:left">`,
    `        <img src="${memorialPhotoPath(m)}${v}" width="${m.width}" height="${m.height}" alt="${attr(m.photoAlt)}"`,
    `          style="flex:none;box-sizing:content-box;width:min(${m.width}px,30vw);height:auto;border:2px solid var(--gold-dim,#8B6914)">`,
    `        <figcaption style="font-family:'Lora',Georgia,serif;font-style:italic;font-size:.6rem;line-height:1.7;color:var(--dim,#9A917E);max-width:220px">`,
    `          ${m.lines.map(esc).join("<br>\n          ")}</figcaption>`,
    `      </figure>`,
  ].join("\n");
}

/* The cards on /games/. Plain text in, escaped here. */
export function renderGameCards(games) {
  const card = (g) => {
    const url = `/games/${g.slug}/`;
    const { width, height } = pngSize(join(GAMES_DIR, g.slug, g.image));
    return [
      `<article class="game-card">`,
      `<img class="game-card__image" src="${url}${g.image}" width="${width}" height="${height}" alt="${attr(g.imageAlt)}">`,
      `<div class="game-card__body">`,
      `<p class="game-card__meta">${esc(g.studio)} &middot; ${esc(g.year)}</p>`,
      `<h2 class="game-card__title">${esc(g.title)}</h2>`,
      `<p class="game-card__desc">${esc(g.desc)}</p>`,
      g.note ? `<p class="game-card__note">${esc(g.note)}</p>` : "",
      `<a class="game-card__link" href="${url}">Play</a>`,
      `</div>`,
      `</article>`,
    ].filter(Boolean).join("\n");
  };
  return `<div class="games-grid">\n${games.map(card).join("\n")}\n</div>`;
}

function* walkFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walkFiles(p);
    else yield p;
  }
}

/* The shipped files of a game, as paths relative to its folder. */
function shippedFiles(g) {
  const dir = join(GAMES_DIR, g.slug);
  const out = [];
  for (const f of g.files) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) for (const q of walkFiles(p)) out.push(relative(dir, q));
    else out.push(f);
  }
  return out.sort();
}

/* build.sh: copy each game's runtime files into dist/games/<slug>/ unchanged. */
export function copyGames(dist) {
  for (const g of loadGames()) {
    const to = join(dist, "games", g.slug);
    mkdirSync(to, { recursive: true });
    for (const f of g.files) cpSync(join(GAMES_DIR, g.slug, f), join(to, f), { recursive: true });
    console.log(`  → /games/${g.slug}/ (${shippedFiles(g).length} files)`);
  }
}

/* check-links: dist/games/<slug>/ must hold exactly the shipped files, byte for
   byte. The build runs sed over every HTML file in dist for cache-busting, and
   a game must come through that (and anything added later) untouched. */
export function verifyGameCopies(dist) {
  const problems = [];
  for (const g of loadGames()) {
    const src = join(GAMES_DIR, g.slug);
    const out = join(dist, "games", g.slug);
    if (!existsSync(out)) { problems.push(`dist/games/${g.slug}/ is missing; build.sh did not copy the game`); continue; }
    const want = shippedFiles(g);
    const got = [...walkFiles(out)].map((p) => relative(out, p)).sort();
    for (const f of got) if (!want.includes(f)) problems.push(`dist/games/${g.slug}/${f} is not one of the game's shipped files`);
    for (const f of want) {
      const o = join(out, f);
      if (!existsSync(o)) problems.push(`dist/games/${g.slug}/${f} is missing from the build`);
      else if (!readFileSync(o).equals(readFileSync(join(src, f)))) {
        problems.push(`dist/games/${g.slug}/${f} differs from games/${g.slug}/${f}; something in the build changed it`);
      }
    }
  }
  return problems;
}

/* CLI for build.sh. */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, dist] = process.argv.slice(2);
  if (cmd !== "copy" || !dist) {
    console.error("usage: node scripts/games.mjs copy <dist-dir>");
    process.exit(2);
  }
  copyGames(dist);
}
