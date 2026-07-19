#!/usr/bin/env node
/* sync-static-html.mjs — pre-render the JS-injected chrome as static HTML.
 *
 * The homepage tools grid, /tools/ directory, and global nav/footer are
 * rendered client-side from the single sources of truth (site/tools-data.js
 * and site/shared.js). Crawlers that don't execute JS see empty divs. This
 * script runs THE SAME renderers in a sandbox and writes their output into
 * the placeholder divs, between generated-content markers. The runtime JS
 * still overwrites those containers on DOMContentLoaded, so behavior is
 * unchanged — the static copy is a crawlable fallback, never a fork.
 *
 * NEVER hand-edit the generated blocks: re-run this script instead
 * (`npm run sync-static`). CI regenerates and fails on drift.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
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

/* ── marker-bounded injection inside a placeholder div ── */
function inject(html, containerId, label, content, file) {
  const start = `<!-- generated:${label} — do not edit; run \`npm run sync-static\` -->`;
  const end = `<!-- /generated:${label} -->`;
  const block = `${start}\n${content}\n${end}`;
  const marked = new RegExp(
    `<!-- generated:${label} —[\\s\\S]*?<!-- /generated:${label} -->`,
  );
  if (marked.test(html)) return html.replace(marked, block);
  const empty = `<div id="${containerId}"></div>`;
  if (html.includes(empty)) {
    return html.replace(empty, `<div id="${containerId}">${block}</div>`);
  }
  throw new Error(`${file}: no marker and no empty <div id="${containerId}"> to seed`);
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

  if (html !== before) {
    writeFileSync(file, html);
    changed++;
    console.log(`updated ${relative(root, file)}`);
  }
}

/* ── /llms.txt: a Markdown index of the site for AI assistants ──
   (llmstxt.org convention.) Generated from tools-data.js (live tools
   only) and the essays' front-matter, so it updates automatically when
   a tool launches or an essay is published. */
{
  const { window } = makeSandbox("/");
  const live = window.rfTools.filter((t) => t.status === "live");
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
  essays.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

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

console.log(changed ? `${changed} file(s) updated` : "everything up to date");
