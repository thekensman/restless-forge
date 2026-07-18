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
import { readFileSync, writeFileSync } from "node:fs";
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

const pages = [
  "index.html", "about.html", "contact.html", "privacy.html", "terms.html",
  "faq.html", "tools/index.html", "articles/index.html", "essays/index.html",
  "essays/why-i-build-these-tools.html", "essays/how-a-tool-gets-built.html",
];

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
console.log(changed ? `${changed} file(s) updated` : "everything up to date");
