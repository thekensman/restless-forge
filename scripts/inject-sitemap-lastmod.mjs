#!/usr/bin/env node
/* inject-sitemap-lastmod.mjs — add <lastmod> to dist/sitemap.xml at build time.
 *
 * WHY THIS RUNS AT BUILD TIME AND NOT IN sync-static-html.mjs
 *
 * site/sitemap.xml is checked in, and CI enforces `npm run sync` producing no
 * diff. A git-derived lastmod cannot live in a checked-in file: editing a page
 * and regenerating gives the date of the page's PREVIOUS commit, because the
 * edit is not committed yet. The moment you commit both, CI regenerates and
 * gets the NEW commit's date — drift, and a red build on every content change.
 * Injecting into dist/ sidesteps that entirely: the deployed sitemap carries
 * accurate dates and nothing checked in has to change.
 *
 * WHY IT MATTERS
 *
 * Google documents that it ignores <changefreq> and <priority> — the only two
 * fields this sitemap used to emit. <lastmod> is the one field it reads, and
 * without it a sitemap says nothing about what changed. That was fine until
 * a canonical-URL bug left most of the site crawled-but-not-indexed; getting
 * those pages re-evaluated is exactly what lastmod is for.
 *
 * ACCURACY OVER COVERAGE
 *
 * Google discounts a sitemap whose lastmod is obviously unreliable — every URL
 * stamped "today" is the classic tell. A shallow clone (actions/checkout's
 * default) has one commit, so every file would report the same date. Rather
 * than emit that lie, this script detects a shallow or history-less repo and
 * writes NO lastmod at all. Omitting the field is neutral; falsifying it is
 * not. The workflows set fetch-depth: 0 so the real dates are available.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sitemapPath = join(root, "dist", "sitemap.xml");
const SITE = "https://restless-forge.dev";

if (!existsSync(sitemapPath)) {
  console.error("inject-sitemap-lastmod: dist/sitemap.xml not found — run ./build.sh first.");
  process.exit(1);
}

const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });

/* Bail out rather than stamp every URL with the same date. */
function historyIsUsable() {
  try {
    if (git(["rev-parse", "--is-shallow-repository"]).trim() === "true") return false;
    return Number(git(["rev-list", "--count", "HEAD"]).trim()) > 1;
  } catch {
    return false;
  }
}

/* One pass over history: path -> most recent commit date (YYYY-MM-DD).
   Walking `git log` once beats ~58 individual `git log -1` invocations. */
function buildDateMap() {
  const out = git(["log", "--format=%cs", "--name-only", "--no-renames"]);
  const dates = new Map();
  let current = null;
  for (const line of out.split("\n")) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(line)) { current = line; continue; }
    if (!line || !current) continue;
    if (!dates.has(line)) dates.set(line, current); // log is newest-first
  }
  return dates;
}

/* Map a site URL back to the source file(s) that produce it. A page's prose may
   live in a sibling .md (the Markdown pipeline), so both are candidates and the
   most recent wins — editing the .md is what changes the page. */
function sourceCandidates(urlPath) {
  const p = urlPath.replace(/^\//, "");
  const out = [];
  const push = (...xs) => out.push(...xs);

  // "/tools/" itself has no tool segment and falls through to site/tools/.
  const tool = p.match(/^tools\/([^/]+)\/(.*)$/);
  if (tool) {
    const [, id, rest] = tool;
    const base = `tools/${id}/frontend/src`;
    if (rest === "") push(`${base}/index.html`, `${base}/index.md`);
    else if (rest.endsWith("/")) push(`${base}/${rest}index.html`, `${base}/${rest}index.md`);
    else push(`${base}/${rest}.html`, `${base}/${rest}.md`, `${base}/${rest}/index.html`, `${base}/${rest}/index.md`);
    return out;
  }
  if (p === "") push("site/index.html", "site/index.md");
  else if (p.endsWith("/")) push(`site/${p}index.html`, `site/${p}index.md`);
  else push(`site/${p}.html`, `site/${p}.md`, `site/${p}/index.html`);
  return out;
}

const xml = readFileSync(sitemapPath, "utf8");

if (!historyIsUsable()) {
  console.log("  → sitemap lastmod: SKIPPED (shallow clone — dates would all be identical)");
  process.exit(0);
}

const dates = buildDateMap();
let stamped = 0;
let missing = 0;

const updated = xml.replace(/<url><loc>([^<]+)<\/loc>/g, (whole, loc) => {
  const urlPath = loc.startsWith(SITE) ? loc.slice(SITE.length) || "/" : loc;
  let best = null;
  for (const cand of sourceCandidates(urlPath)) {
    if (!existsSync(join(root, cand)) || !statSync(join(root, cand)).isFile()) continue;
    const d = dates.get(cand);
    if (d && (!best || d > best)) best = d;
  }
  if (!best) { missing++; return whole; }
  stamped++;
  return `<url><loc>${loc}</loc><lastmod>${best}</lastmod>`;
});

writeFileSync(sitemapPath, updated);
console.log(`  → sitemap lastmod: ${stamped} stamped${missing ? `, ${missing} without a resolvable source` : ""}`);
