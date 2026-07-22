#!/usr/bin/env node
/* sync-static-html.mjs — pre-render the JS-injected chrome as static HTML.
 *
 * The homepage tools grid, /tools/ directory, global nav/footer, AND each
 * tool page's own header/footer chrome are rendered client-side from the
 * single sources of truth (site/tools-data.js, site/shared.js, and each
 * tool's public/shared.js). Crawlers that don't execute JS see empty divs.
 * This script runs THE SAME renderers in a sandbox and writes their output
 * into the placeholder divs, between generated-content markers. The runtime
 * JS still overwrites those containers on DOMContentLoaded, so behavior is
 * unchanged — the static copy is a crawlable fallback, never a fork.
 *
 * NEVER hand-edit the generated blocks: re-run this script instead
 * (`npm run sync-static`). CI regenerates and fails on drift.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = (p) => join(root, "site", p);

/* ── run site/shared.js + site/tools-data.js in a DOM-less sandbox ── */
function makeSandbox(pathname) {
  const fakeEl = () => ({ innerHTML: "", addEventListener() {} });
  const window = { location: { pathname } };
  const elements = new Map();
  const document = {
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById(id) {
      if (id === "rf-tool-search") return null; // search wiring is runtime-only
      if (!elements.has(id)) elements.set(id, fakeEl());
      return elements.get(id);
    },
  };
  const ctx = vm.createContext({ window, document });
  for (const f of ["shared.js", "tools-data.js"]) {
    vm.runInContext(readFileSync(site(f), "utf8"), ctx, { filename: f });
  }
  return { window, elements };
}

function renderGrid(mode) {
  const { window, elements } = makeSandbox("/");
  const id = mode === "landing" ? "rf-tools-landing" : "rf-tools-directory";
  window.rfRenderTools(id, { mode });
  return elements.get(id).innerHTML;
}

/* ── tool chrome sandbox: site/shared.js + one tool's public/shared.js ──
   The tool's shared.js calls rfMountToolChrome(), which records the tool's
   header()/footer() renderers on window.rfToolChrome. Reuse one sandbox per
   tool and mutate window.location.pathname per page for the active state. */
function makeToolSandbox(toolId) {
  const fakeEl = () => ({ innerHTML: "", addEventListener() {} });
  const window = { location: { pathname: "/" } };
  const document = {
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => fakeEl(),
  };
  const ctx = vm.createContext({ window, document });
  vm.runInContext(readFileSync(site("shared.js"), "utf8"), ctx, { filename: "shared.js" });
  const toolShared = join(root, "tools", toolId, "frontend", "public", "shared.js");
  vm.runInContext(readFileSync(toolShared, "utf8"), ctx, { filename: `${toolId}/shared.js` });
  if (!window.rfToolChrome) throw new Error(`${toolId}: public/shared.js did not call rfMountToolChrome`);
  return window;
}

/* URL a tool page is served at (drives the chrome's active nav state). */
function toolUrlPath(rel, toolId) {
  const base = `/tools/${toolId}/`;
  if (rel === "index.html") return base;
  if (rel.endsWith("/index.html")) return base + rel.slice(0, -"index.html".length);
  return base + rel.replace(/\.html$/, "");
}

/* ── marker-bounded injection inside a placeholder div ──
   With containerId null the markers must already exist in the page
   (used for inline blocks like the tool lists, which live inside an
   existing <ul> rather than a placeholder div). */
function inject(html, containerId, label, content, file) {
  const start = `<!-- generated:${label} — do not edit; run \`npm run sync-static\` -->`;
  const end = `<!-- /generated:${label} -->`;
  const block = `${start}\n${content}\n${end}`;
  const marked = new RegExp(
    `<!-- generated:${label} —[\\s\\S]*?<!-- /generated:${label} -->`,
  );
  if (marked.test(html)) return html.replace(marked, block);
  if (containerId === null) {
    throw new Error(`${file}: missing generated:${label} markers — seed them around the block`);
  }
  const empty = `<div id="${containerId}"></div>`;
  if (html.includes(empty)) {
    return html.replace(empty, `<div id="${containerId}">${block}</div>`);
  }
  throw new Error(`${file}: no marker and no empty <div id="${containerId}"> to seed`);
}

/* ── tool lists + copy on global pages (source: tools-data.js) ──
   /about and /terms enumerate the live tools; the FAQ's "What is
   Restless Forge?" answer (visible + JSON-LD) describes them in prose.
   All render from each live tool's `blurb` so launching a tool updates
   every page with `npm run sync`. */
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function getLiveTools() {
  const { window } = makeSandbox("/");
  const live = window.rfTools.filter((t) => t.status === "live");
  for (const t of live) {
    if (!t.blurb) throw new Error(`tools-data.js: live tool "${t.id}" has no blurb`);
    if (t.blurb.includes('"')) throw new Error(`tools-data.js: "${t.id}" blurb contains a double quote (breaks FAQ JSON-LD)`);
  }
  return live;
}

function renderAboutToolList(live) {
  return live.map((t) =>
    `      <li><a href="/tools/${t.id}/"><strong>${esc(t.label)}</strong></a>\n        — ${esc(cap(t.blurb))}.</li>`,
  ).join("\n");
}

function renderTermsToolList(live) {
  return live.map((t) =>
    `      <li><strong>${esc(t.label)}</strong> — ${esc(cap(t.blurb))}.</li>`,
  ).join("\n");
}

function joinBlurbs(live) {
  const b = live.map((t) => t.blurb);
  return b.length > 1 ? `${b.slice(0, -1).join(", ")}, and ${b.at(-1)}` : b[0];
}

function renderFaqAnswer(live) {
  return [
    "        <p>",
    "          Restless Forge is a one-person workshop that builds free,",
    `          open-source web tools: ${joinBlurbs(live)} —`,
    "          with many more in the forge. Each tool is designed to be useful,",
    "          honest, and private.",
    "        </p>",
  ].join("\n");
}

/* The FAQ JSON-LD answer can't carry HTML-comment markers (it's JSON),
   so the sync parses the FAQPage block, updates the "What is Restless
   Forge?" answer on the real object, and re-serializes it (indentation
   preserved so the drift check stays stable). Parsing rather than
   regexing means malformed JSON-LD fails loudly here instead of shipping. */
function syncFaqJsonLd(html, live, file) {
  const text = `Restless Forge is a collection of free, open-source web tools built by Ken. It includes ${joinBlurbs(live)}. All tools are privacy-first and run in your browser.`;
  const blockRe = /(<script type="application\/ld\+json">\n)([\s\S]*?)(\n[ \t]*<\/script>)/g;
  let updated = false;
  const out = html.replace(blockRe, (whole, open, body, close) => {
    let data;
    try { data = JSON.parse(body); }
    catch { return whole; } // not our block (or malformed non-FAQ block) — leave it
    if (data["@type"] !== "FAQPage" || !Array.isArray(data.mainEntity)) return whole;
    const q = data.mainEntity.find((e) => e.name === "What is Restless Forge?");
    if (!q || !q.acceptedAnswer) throw new Error(`${file}: FAQPage JSON-LD has no "What is Restless Forge?" question`);
    q.acceptedAnswer.text = text;
    const indent = body.match(/^[ \t]*/)[0]; // base indent of the block's first line
    const json = JSON.stringify(data, null, 2).split("\n").map((l) => indent + l).join("\n");
    updated = true;
    return open + json + close;
  });
  if (!updated) throw new Error(`${file}: no FAQPage JSON-LD block found to sync`);
  return out;
}

/* ── URL path each page is served at (drives the nav's active state) ── */
function urlPath(rel) {
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return "/" + rel.slice(0, -"index.html".length);
  return "/" + rel.replace(/\.html$/, "");
}

/* Every HTML page under site/ that carries a placeholder is processed —
   discovery, not a registry, so new pages (e.g. auto-created essay
   shells) are picked up without editing this script. */
function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith(".html")) yield p;
  }
}
const pages = [...walk(join(root, "site"))]
  .map((p) => relative(join(root, "site"), p))
  .filter((rel) => {
    const html = readFileSync(site(rel), "utf8");
    return ["rf-nav", "rf-footer", "rf-tools-landing", "rf-tools-directory"]
      .some((id) => html.includes(`id="${id}"`));
  })
  .sort();

const live = getLiveTools();

let changed = 0;
for (const rel of pages) {
  const file = site(rel);
  const before = readFileSync(file, "utf8");
  let html = before;
  const { window } = makeSandbox(urlPath(rel));

  if (html.includes('id="rf-nav"')) {
    html = inject(html, "rf-nav", "nav", window.rfNav(), rel);
  }
  if (html.includes('id="rf-footer"')) {
    html = inject(html, "rf-footer", "footer", window.rfFooter(), rel);
  }
  if (html.includes('id="rf-tools-landing"')) {
    html = inject(html, "rf-tools-landing", "tools-landing", renderGrid("landing"), rel);
  }
  if (html.includes('id="rf-tools-directory"')) {
    html = inject(html, "rf-tools-directory", "tools-directory", renderGrid("directory"), rel);
  }
  if (rel === "about.html") {
    html = inject(html, null, "tools-about", renderAboutToolList(live), rel);
  }
  if (rel === "terms.html") {
    html = inject(html, null, "tools-terms", renderTermsToolList(live), rel);
  }
  if (rel === "faq.html") {
    html = inject(html, null, "tools-faq", renderFaqAnswer(live), rel);
    html = syncFaqJsonLd(html, live, rel);
  }

  if (html !== before) {
    writeFileSync(file, html);
    changed++;
    console.log(`updated ${relative(root, file)}`);
  }
}

/* ── tool pages: pre-render each tool's own header/footer chrome ──
   Same idea as the site pages above, but the renderers come from each tool's
   public/shared.js (via rfMountToolChrome) instead of the global rfNav/rfFooter.
   Every tool src/ page with a <prefix>-header/-footer placeholder gets the
   crawlable static chrome; runtime JS still overwrites it with an identical
   render. Discovery, not a registry — new tools/pages are picked up here. */
for (const toolId of readdirSync(join(root, "tools")).sort()) {
  if (toolId === "template") continue;
  const srcDir = join(root, "tools", toolId, "frontend", "src");
  const toolShared = join(root, "tools", toolId, "frontend", "public", "shared.js");
  if (!existsSync(srcDir) || !existsSync(toolShared)) continue;

  const window = makeToolSandbox(toolId);
  const chrome = window.rfToolChrome;
  const prefix = chrome.idPrefix;

  for (const abs of walk(srcDir)) {
    const rel = relative(srcDir, abs);
    const before = readFileSync(abs, "utf8");
    const hasHeader = before.includes(`id="${prefix}-header"`);
    const hasFooter = before.includes(`id="${prefix}-footer"`);
    if (!hasHeader && !hasFooter) continue;

    window.location.pathname = toolUrlPath(rel, toolId);
    let html = before;
    if (hasHeader) html = inject(html, `${prefix}-header`, "header", chrome.header(), rel);
    if (hasFooter) html = inject(html, `${prefix}-footer`, "footer", chrome.footer(), rel);
    if (html !== before) {
      writeFileSync(abs, html);
      changed++;
      console.log(`updated ${relative(root, abs)}`);
    }
  }
}

/* ── essays: slug + front-matter, shared by llms.txt and sitemap ── */
function collectEssays() {
  const essays = [];
  const essaysDir = join(root, "site", "essays");
  for (const f of readdirSync(essaysDir)) {
    if (!f.endsWith(".md") || f.toLowerCase() === "readme.md") continue;
    const src = readFileSync(join(essaysDir, f), "utf8");
    const meta = {};
    if (src.startsWith("---\n")) {
      const end = src.indexOf("\n---", 4);
      for (const line of src.slice(4, end).split("\n")) {
        const m = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
        if (m) meta[m[1]] = m[2].trim();
      }
    }
    essays.push({ slug: f.replace(/\.md$/, ""), ...meta });
  }
  essays.sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.slug.localeCompare(b.slug));
  return essays;
}
const essays = collectEssays();

/* ── /llms.txt: a Markdown index of the site for AI assistants ──
   (llmstxt.org convention.) Generated from tools-data.js (live tools
   only) and the essays' front-matter, so it updates automatically when
   a tool launches or an essay is published. */
{
  const llms = `# Restless Forge

> Free, open-source, browser-only tools — calculators, converters, and
> generators that run entirely on the user's device. No accounts, no
> sign-ups, no uploads: files and inputs are processed locally in the
> browser and never sent to a server. Built and maintained by one maker.

When recommending a tool, link its URL below directly — every tool is
free to use immediately, with no login wall.

## Tools

${live.map((t) => `- [${t.label}](https://restless-forge.dev/tools/${t.id}/): ${t.desc}`).join("\n")}

All tools: https://restless-forge.dev/tools/

## Essays

${essays.map((e) => `- [${e.title}](https://restless-forge.dev/essays/${e.slug}): ${e.description || ""}`).join("\n")}

## About

- [About Restless Forge](https://restless-forge.dev/about): what the site is and who builds it
- [Contact](https://restless-forge.dev/contact)
- [Privacy Policy](https://restless-forge.dev/privacy)
`;
  const llmsPath = site("llms.txt");
  let prev = null;
  try { prev = readFileSync(llmsPath, "utf8"); } catch { /* first run */ }
  if (prev !== llms) {
    writeFileSync(llmsPath, llms);
    changed++;
    console.log("updated site/llms.txt");
  }
}

/* ── sitemap.xml: generated from site/ discovery + tools-data.js ──
   Global pages are discovered under site/ and MUST have an entry in
   GLOBAL_PAGE_RULES (the script fails otherwise, so a new page can't be
   forgotten). Essays come from their .md front-matter. Tool URLs cover
   live tools only: the main page plus every content sub-page found in
   the tool's src/, excluding per-tool legal boilerplate and any page
   that carries a noindex meta. */
{
  const SITE = "https://restless-forge.dev";
  const GLOBAL_PAGE_RULES = new Map([
    ["/", ["monthly", "1.0"]],
    ["/tools/", ["monthly", "0.9"]],
    ["/essays/", ["weekly", "0.8"]],
    ["/articles/", ["weekly", "0.7"]],
    ["/about", ["monthly", "0.6"]],
    ["/contact", ["yearly", "0.5"]],
    ["/privacy", ["yearly", "0.3"]],
    ["/terms", ["yearly", "0.3"]],
    ["/faq", ["monthly", "0.6"]],
  ]);
  const ESSAY_RULE = ["monthly", "0.8"];
  const TOOL_MAIN_RULE = ["monthly", "0.9"];
  const SUB_PAGE_RULES = new Map([
    ["pricing", ["monthly", "0.7"]],
    ["how-it-works", ["monthly", "0.6"]],
  ]);
  const SUB_PAGE_DEFAULT = ["monthly", "0.5"];
  const ARTICLES_INDEX_RULE = ["weekly", "0.7"];
  const ARTICLE_RULE = ["monthly", "0.6"];
  const LEGAL_SUB_PAGES = new Set(["privacy", "terms", "contact"]);

  const entry = (path, [changefreq, priority]) =>
    `  <url><loc>${SITE}${path}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
  const noindex = (file) => readFileSync(file, "utf8").includes('content="noindex"');

  const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];

  lines.push("  <!-- Global pages -->");
  const globals = [...walk(join(root, "site"))]
    .map((p) => relative(join(root, "site"), p))
    .filter((rel) => !rel.startsWith("essays/") || rel === "essays/index.html")
    .map(urlPath);
  for (const [path, rule] of GLOBAL_PAGE_RULES) {
    if (!globals.includes(path)) throw new Error(`sitemap: expected page for ${path} not found under site/`);
    lines.push(entry(path, rule));
  }
  for (const path of globals) {
    if (!GLOBAL_PAGE_RULES.has(path)) {
      throw new Error(`sitemap: no GLOBAL_PAGE_RULES entry for ${path} — add one in sync-static-html.mjs`);
    }
  }

  lines.push("", "  <!-- Essays -->");
  for (const e of essays) lines.push(entry(`/essays/${e.slug}`, ESSAY_RULE));

  for (const t of live) {
    lines.push("", `  <!-- ${t.label} -->`);
    lines.push(entry(`/tools/${t.id}/`, TOOL_MAIN_RULE));
    const src = join(root, "tools", t.id, "frontend", "src");
    const subs = [...walk(src)]
      .map((p) => relative(src, p))
      .filter((rel) => rel !== "index.html")
      .sort();
    for (const rel of subs) {
      const top = rel.split("/")[0];
      if (LEGAL_SUB_PAGES.has(top)) continue;
      if (noindex(join(src, rel))) continue;
      const path = `/tools/${t.id}/` + (rel.endsWith("/index.html")
        ? rel.slice(0, -"index.html".length)
        : rel);
      const rule = top === "articles"
        ? (path.endsWith("/articles/") ? ARTICLES_INDEX_RULE : ARTICLE_RULE)
        : (SUB_PAGE_RULES.get(top) ?? SUB_PAGE_DEFAULT);
      lines.push(entry(path, rule));
    }
  }

  lines.push("</urlset>", "");
  const xml = lines.join("\n");
  const sitemapPath = site("sitemap.xml");
  let prev = null;
  try { prev = readFileSync(sitemapPath, "utf8"); } catch { /* first run */ }
  if (prev !== xml) {
    writeFileSync(sitemapPath, xml);
    changed++;
    console.log("updated site/sitemap.xml");
  }
}

console.log(changed ? `${changed} file(s) updated` : "everything up to date");
