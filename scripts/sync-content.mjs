#!/usr/bin/env node
/* sync-content.mjs — Markdown → generated HTML content blocks.
 *
 * Prose lives in Markdown, not in page shells. Convention: any `X.md`
 * sitting next to `X.html` (or `index.md` next to `index.html`) under
 * site/ or tools/<name>/frontend/src/ is that page's content source. The
 * rendered HTML is injected between markers inside the shell:
 *
 *   <!-- generated:content — do not edit; edit index.md and run `npm run sync-content` -->
 *   …
 *   <!-- /generated:content -->
 *
 * The shell owns everything else: chrome placeholders, ad slots,
 * breadcrumbs, favicons, the stylesheet and ad loader. Extras this script
 * also handles:
 *   - site/essays/<slug>.md with no sibling .html → the shell is created
 *     from scripts/templates/essay-shell.html (new essay = one Markdown
 *     file; `npm run sync-static` then adds it to sitemap.xml + llms.txt).
 *   - an essay's front-matter-derived head tags (title, description,
 *     canonical, og:*, JSON-LD Article) regenerate every run into a
 *     `generated:head` block. Non-essay pages hand-write their own head and
 *     are left alone. This is a marker block and not a one-time template
 *     substitution because the write-once version rotted silently — see
 *     essayHead() for the incident.
 *   - the essay cards in site/essays/index.html regenerate from all
 *     essay front-matter (generated:essay-cards block).
 *
 * Front-matter (--- key: value --- block): title, description, date
 * (YYYY-MM-DD), author. `date`/`author` render a byline under the first
 * heading; title/description/date drive shell creation and index cards.
 *
 * External links (http/https) automatically get target="_blank"
 * rel="noopener", so Markdown needs no inline HTML for them.
 *
 * NEVER hand-edit generated blocks (`npm run sync-content` regenerates;
 * CI fails on drift). Full guide: docs/authoring-content.md.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, basename } from "node:path";
import { marked } from "marked";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ── markdown setup: external links open in a new tab ── */
const renderer = new marked.Renderer();
const defaultLink = renderer.link.bind(renderer);
renderer.link = function (token) {
  const html = defaultLink(token);
  return /^https?:\/\//.test(token.href)
    ? html.replace("<a ", '<a target="_blank" rel="noopener" ')
    : html;
};
marked.setOptions({ renderer, gfm: true });

/* ── front-matter: a leading --- block of `key: value` lines ── */
function parseFrontMatter(src) {
  const meta = {};
  if (!src.startsWith("---\n")) return { meta, body: src };
  const end = src.indexOf("\n---", 4);
  if (end === -1) return { meta, body: src };
  for (const line of src.slice(4, end).split("\n")) {
    // The key stops at the first colon (`[\w-]*` cannot match a space), so a
    // title like "Self-Publishing: Dreaming with Eyes Open" keeps every later
    // colon in its value and needs no quoting.
    const m = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    // This is not YAML, and quoting a colon-bearing value is exactly what YAML
    // habits produce. Without this the quote characters became part of the
    // title and shipped to the browser tab, the search result, the share card,
    // the JSON-LD headline and the essay index card — none of which anyone
    // looks at while writing, so it went unnoticed. Only a matched pair is
    // stripped; a value containing an internal quote is left alone.
    if (value.length > 1 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
      value = value.slice(1, -1);
    }
    meta[m[1]] = value;
  }
  return { meta, body: src.slice(src.indexOf("\n", end + 1) + 1) };
}

function fmtDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/* ── `source:` — borrow the body from a standalone HTML page ──
 *
 * Some pieces exist twice on purpose: a bare, self-contained HTML page for
 * external communities (no chrome, nothing linking back, so a moderator does
 * not read it as a funnel) and a normal essay carrying the site chrome. The
 * text must not live in both files — that is a silent drift waiting to happen,
 * since nothing checks two files for agreeing.
 *
 * So the standalone page owns the prose, and the essay's front-matter points
 * at it with `source:`. Everything between its <main> tags becomes the essay
 * body; the hero, any sticky rail, the footer and scripts sit outside <main>
 * and are excluded for free, which is what we want — the essay has real site
 * navigation and needs none of them.
 *
 * The .md still exists and still carries front-matter, because three separate
 * systems key on "an essay is a .md in site/essays/": this script's content
 * injection, its essay-card generator, and sync-static-html's sitemap and
 * llms.txt lists. The last two fail SILENTLY if the file goes — the page keeps
 * working and just stops being listed anywhere.
 *
 * Any Markdown left in the body is appended after the borrowed content. That
 * is how the essay carries closing links (contact, Amazon) which must never
 * appear in the copy posted externally. */
function extractMain(sourcePath, mdRel) {
  if (!existsSync(sourcePath)) {
    throw new Error(
      `${mdRel}: source: points at ${sourcePath}, which does not exist`,
    );
  }
  const src = readFileSync(sourcePath, "utf8");
  const opens = (src.match(/<main[\s>]/g) || []).length;
  if (opens !== 1) {
    throw new Error(
      `${mdRel}: source ${basename(sourcePath)} has ${opens} <main> elements — ` +
      `exactly one is required, since it marks the body to borrow`,
    );
  }
  const m = src.match(/<main[^>]*>([\s\S]*?)<\/main>/);
  if (!m || !m[1].trim()) {
    throw new Error(
      `${mdRel}: source ${basename(sourcePath)} has an empty or unclosed <main>`,
    );
  }
  return m[1].trim();
}

/* Render a content .md file to the HTML that goes between the markers. */
function renderContent(mdPath) {
  const { meta, body } = parseFrontMatter(readFileSync(mdPath, "utf8"));
  let html;
  if (meta.source) {
    // The h1 is synthesised from front-matter rather than lifted out of the
    // source's hero, so the heading, <title>, canonical and JSON-LD cannot
    // drift apart. The byline logic below keys on </h1> and works unchanged.
    const borrowed = extractMain(join(dirname(mdPath), meta.source), relative(root, mdPath));
    const tail = body.trim() ? marked.parse(body).trim() : "";
    html = `<h1>${meta.title || ""}</h1>\n${borrowed}${tail ? `\n${tail}` : ""}`;
  } else {
    html = marked.parse(body).trim();
  }
  if (meta.date || meta.author) {
    const parts = [];
    if (meta.date) parts.push(`Published ${fmtDate(meta.date)}`);
    if (meta.author) parts.push(`By ${meta.author}`);
    const byline = `<p class="content-byline" style="color: var(--text-dim); font-style: italic; margin-bottom: 2rem;">\n  ${parts.join(" &middot; ")}\n</p>`;
    const h1End = html.indexOf("</h1>");
    html = h1End === -1
      ? `${byline}\n${html}`
      : `${html.slice(0, h1End + 5)}\n${byline}${html.slice(h1End + 5)}`;
  }
  return { meta, html };
}

/* Marker-bounded replacement (same convention as sync-static-html.mjs). */
function injectBlock(html, label, mdName, content, file) {
  const start = `<!-- generated:${label} — do not edit; edit ${mdName} and run \`npm run sync-content\` -->`;
  const end = `<!-- /generated:${label} -->`;
  const marked_ = new RegExp(`<!-- generated:${label} —[\\s\\S]*?<!-- /generated:${label} -->`);
  if (!marked_.test(html)) {
    throw new Error(
      `${file}: missing <!-- generated:${label} --> markers — add the marker pair where the content belongs (see docs/authoring-content.md)`,
    );
  }
  return html.replace(marked_, `${start}\n${content}\n${end}`);
}

/* ── discovery: every .md with (or destined to have) a sibling .html ── */
function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function contentSources() {
  const sources = [];
  const roots = [join(root, "site")];
  const toolsDir = join(root, "tools");
  for (const t of readdirSync(toolsDir, { withFileTypes: true })) {
    // The template's .md still holds __TOOL_*__ placeholders (markdown
    // would mangle the underscores); it renders after new-tool.sh
    // substitutes them in a real tool.
    if (t.name === "template") continue;
    const src = join(toolsDir, t.name, "frontend", "src");
    if (t.isDirectory() && existsSync(src)) roots.push(src);
  }
  for (const r of roots) {
    for (const f of walk(r)) {
      if (!f.endsWith(".md") || basename(f).toLowerCase() === "readme.md") continue;
      sources.push(f);
    }
  }
  return sources;
}

/* ── essay shell auto-creation ── */
const essaysDir = join(root, "site", "essays");
const SITE = "https://restless-forge.dev";

/* HTML attribute values and JSON string literals need different escaping, and
   both now carry author-supplied text on every run rather than once. `<`
   in the JSON keeps a stray "</script>" in a description from closing the
   JSON-LD block early. */
const attr = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jstr = (s) => JSON.stringify(String(s)).replace(/</g, "\\u003c");

/* Every head tag derived from front-matter, regenerated on each run.
 *
 * This is a marker block rather than a one-time template substitution because
 * the write-once version silently rotted: the origin essay's images moved, its
 * `image:` front-matter was updated, and og:image plus the JSON-LD image kept
 * pointing at the old path. Nothing renders those tags, so the page looked
 * correct while every social share was broken. Anything the front-matter feeds
 * belongs in here; anything fixed (favicons, stylesheet, ad loader) stays in
 * the shell where an author can edit it.
 */
function essayHead(slug, meta, mdPath) {
  for (const k of ["title", "description", "date"]) {
    if (!meta[k]) throw new Error(`${relative(root, mdPath)}: front-matter needs "${k}"`);
  }
  // Optional `image:` front-matter gives an essay its own social card; without
  // it every essay shares the generic site-wide one. Absolute URL required by
  // og:image, so a site-root path is expanded here.
  const ogImage = meta.image
    ? (meta.image.startsWith("http") ? meta.image : `${SITE}${meta.image}`)
    : `${SITE}/og-image.png`;
  const url = `${SITE}/essays/${slug}`;
  const author = meta.author || "Ken";
  return `  <title>${attr(meta.title)} — Restless Forge</title>
  <meta name="description" content="${attr(meta.description)}">
  <link rel="canonical" href="${url}">

  <meta property="og:title" content="${attr(meta.title)}">
  <meta property="og:description" content="${attr(meta.description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${ogImage}">

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": ${jstr(meta.title)},
    "description": ${jstr(meta.description)},
    "author": { "@type": "Person", "name": ${jstr(author)}, "url": "${SITE}/about" },
    "publisher": { "@type": "Organization", "name": "Restless Forge", "url": "${SITE}" },
    "datePublished": "${attr(meta.date)}",
    "image": "${ogImage}",
    "url": "${url}"
  }
  </script>`;
}

function createEssayShell(mdPath, meta) {
  const slug = basename(mdPath, ".md");
  essayHead(slug, meta, mdPath); // validate front-matter before writing a shell
  const shell = readFileSync(join(root, "scripts", "templates", "essay-shell.html"), "utf8")
    .replaceAll("{{SLUG}}", slug);
  const htmlPath = join(essaysDir, `${slug}.html`);
  writeFileSync(htmlPath, shell);
  console.log(`created ${relative(root, htmlPath)}`);
}

/* ── essay index cards from front-matter ── */
function essayCards() {
  const essays = [];
  for (const f of readdirSync(essaysDir)) {
    if (!f.endsWith(".md") || f.toLowerCase() === "readme.md") continue;
    const { meta } = parseFrontMatter(readFileSync(join(essaysDir, f), "utf8"));
    essays.push({ slug: basename(f, ".md"), ...meta });
  }
  essays.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return essays
    .map((e) => {
      const when = e.date ? fmtDate(e.date) : "";
      const by = e.author ? `By ${e.author}` : "";
      const metaLine = [when, by].filter(Boolean).join(" &middot; ");
      return `<div class="essay-card">
  <h2 class="essay-card__title"><a href="/essays/${e.slug}">${e.title}</a></h2>
  <p class="essay-card__meta">${metaLine}</p>
  <p class="essay-card__excerpt">${e.description || ""}</p>
</div>`;
    })
    .join("\n");
}

/* ── main ── */
let changed = 0;

for (const mdPath of contentSources()) {
  const rel = relative(root, mdPath);
  const htmlPath = mdPath.replace(/\.md$/, ".html");
  const isEssay = dirname(mdPath) === essaysDir;

  const { meta, html } = renderContent(mdPath);
  if (!existsSync(htmlPath)) {
    if (!isEssay) throw new Error(`${rel}: no sibling ${basename(htmlPath)} — create the page shell with content markers first`);
    createEssayShell(mdPath, meta);
    changed++;
  }

  const before = readFileSync(htmlPath, "utf8");
  // Name the file the prose actually lives in. With `source:` set that is NOT
  // the .md — it holds front-matter and little else — and a marker saying
  // "edit <slug>.md" sends the next reader to a file with no prose in it. That
  // misdirection is exactly how this generated copy gets mistaken for a
  // hand-maintained duplicate.
  const proseSource = meta.source
    ? `${meta.source} (via source: in ${basename(mdPath)})`
    : basename(mdPath);
  let after = injectBlock(before, "content", proseSource, html, relative(root, htmlPath));
  // Essay heads are front-matter-derived and resync every run; other pages own
  // their head by hand, so there is nothing to regenerate for them.
  if (isEssay) {
    const slug = basename(mdPath, ".md");
    after = injectBlock(after, "head", basename(mdPath), essayHead(slug, meta, mdPath), relative(root, htmlPath));
  }
  if (after !== before) {
    writeFileSync(htmlPath, after);
    changed++;
    console.log(`updated ${relative(root, htmlPath)}`);
  }
}

/* essays index cards */
{
  const indexPath = join(essaysDir, "index.html");
  const before = readFileSync(indexPath, "utf8");
  const start = `<!-- generated:essay-cards — do not edit; edit the essays' .md front-matter and run \`npm run sync-content\` -->`;
  const end = `<!-- /generated:essay-cards -->`;
  const re = /<!-- generated:essay-cards —[\s\S]*?<!-- \/generated:essay-cards -->/;
  if (re.test(before)) {
    const after = before.replace(re, `${start}\n${essayCards()}\n${end}`);
    if (after !== before) {
      writeFileSync(indexPath, after);
      changed++;
      console.log("updated site/essays/index.html (cards)");
    }
  }
}

console.log(changed ? `${changed} change(s)` : "everything up to date");
