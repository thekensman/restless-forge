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
 * The shell owns everything else: head metas, chrome placeholders, ad
 * slots, breadcrumbs. Extras this script also handles:
 *   - site/essays/<slug>.md with no sibling .html → the shell is created
 *     from scripts/templates/essay-shell.html using the front-matter
 *     (new essay = one Markdown file; add it to sitemap.xml yourself).
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
    const m = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim();
  }
  return { meta, body: src.slice(src.indexOf("\n", end + 1) + 1) };
}

function fmtDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/* Render a content .md file to the HTML that goes between the markers. */
function renderContent(mdPath) {
  const { meta, body } = parseFrontMatter(readFileSync(mdPath, "utf8"));
  let html = marked.parse(body).trim();
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

function createEssayShell(mdPath, meta) {
  const slug = basename(mdPath, ".md");
  for (const k of ["title", "description", "date"]) {
    if (!meta[k]) throw new Error(`${relative(root, mdPath)}: front-matter needs "${k}" to create its page shell`);
  }
  // Optional `image:` front-matter gives an essay its own social card; without
  // it every essay shares the generic site-wide one. Absolute URL required by
  // og:image, so a site-root path is expanded here.
  const ogImage = meta.image
    ? (meta.image.startsWith("http") ? meta.image : `${SITE}${meta.image}`)
    : `${SITE}/og-image.png`;
  const shell = readFileSync(join(root, "scripts", "templates", "essay-shell.html"), "utf8")
    .replaceAll("{{TITLE}}", meta.title)
    .replaceAll("{{DESCRIPTION}}", meta.description)
    .replaceAll("{{SLUG}}", slug)
    .replaceAll("{{DATE}}", meta.date)
    .replaceAll("{{AUTHOR}}", meta.author || "Ken")
    .replaceAll("{{OG_IMAGE}}", ogImage);
  const htmlPath = join(essaysDir, `${slug}.html`);
  writeFileSync(htmlPath, shell);
  console.log(`created ${relative(root, htmlPath)} — run \`npm run sync-static\` to add it to sitemap.xml and llms.txt`);
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
  const after = injectBlock(before, "content", basename(mdPath), html, relative(root, htmlPath));
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
