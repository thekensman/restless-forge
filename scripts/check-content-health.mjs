#!/usr/bin/env node
/* check-content-health.mjs — guard the rules an AdSense rejection taught us.
 *
 * Run in CI. Exits non-zero with an explanation when a tool drifts back into
 * a state that got the site rejected once already. This exists because docs
 * get forgotten and a check does not.
 *
 * The rules are deliberately narrow — each one encodes a defect that actually
 * happened, not a style preference:
 *
 *   1. Live tools must not ship their own privacy/terms/contact pages.
 *      Five near-duplicate policies is duplicate-content risk; the site-global
 *      /privacy, /terms and /contact are the single source. EXCEPTION: a
 *      tier:'cloud' tool must document its server-side data flow on its own
 *      privacy page (see CLAUDE.md), so cloud tools may keep privacy/.
 *
 *   2. Indexable, ad-bearing PROSE sub-pages must clear a word floor.
 *      TattooSafe was serving ads on 59-92 word pages. Main tool pages
 *      (src/index.html) are exempt: a converter's value is the interactive
 *      tool, not prose, so a short description there is legitimate.
 *
 *   3. Live tools must not carry `noindex` anywhere — launching means being
 *      indexable, and a forgotten noindex silently hides a launched page.
 *
 *   4. Unlaunched tools must carry `noindex` on every page AND ship no ad
 *      markup. noindex stops indexing, not ad serving; ads on placeholder
 *      pages are an AdSense policy problem. This locks in the discipline that
 *      kept 76 unlaunched pages clean during the rejection review.
 *
 * There is deliberately NO article-count rule: plenty of good tools (simple
 * file converters, single-purpose calculators) do not warrant articles.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIN_WORDS = 250;
const LEGAL = ["privacy", "terms", "contact"];

/* Live/tier status comes from the same single source the site renders from. */
function loadTools() {
  const window = {};
  vm.runInContext(
    readFileSync(join(root, "site/tools-data.js"), "utf8"),
    vm.createContext({ window, document: { getElementById: () => null } }),
    { filename: "tools-data.js" },
  );
  return window.rfTools;
}

function* walkHtml(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walkHtml(p);
    else if (e.name.endsWith(".html")) yield p;
  }
}

/* Visible prose only: drop script/style bodies and all tags, then count. */
function visibleWords(file) {
  const html = readFileSync(file, "utf8")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  return html.split(/\s+/).filter(Boolean).length;
}

const problems = [];
const tools = loadTools();

for (const tool of tools) {
  const src = join(root, "tools", tool.id, "frontend", "src");
  if (!existsSync(src) || !statSync(src).isDirectory()) continue;

  const live = tool.status === "live";
  const cloud = tool.tier === "cloud";

  // ── Rule 1: live tools own no legal/contact pages (cloud keeps privacy) ──
  if (live) {
    for (const leg of LEGAL) {
      if (leg === "privacy" && cloud) continue;
      if (existsSync(join(src, leg))) {
        problems.push(
          `${tool.id}: ships its own /${leg}/ page. Live tools use the ` +
          `site-global /${leg} instead — delete it and link the global page.`,
        );
      }
    }
  }

  for (const file of walkHtml(src)) {
    const rel = relative(root, file);
    const html = readFileSync(file, "utf8");
    const noindex = /content=["']noindex/.test(html);
    const hasAds = /class=["']adsbygoogle|rfMountAdsenseSlots/.test(html);
    const isMainPage = relative(src, file) === "index.html";

    if (live) {
      // ── Rule 3: no stray noindex on a launched tool ──
      if (noindex) {
        problems.push(`${rel}: live tool page carries noindex — remove it.`);
      }
      // ── Rule 2: ad-bearing prose sub-pages must clear the floor ──
      if (hasAds && !isMainPage) {
        const words = visibleWords(file);
        if (words < MIN_WORDS) {
          problems.push(
            `${rel}: ${words} words but serves ads (floor ${MIN_WORDS}). ` +
            `Thin ad-bearing pages are what "low value content" means — ` +
            `expand it, or remove the ad slot.`,
          );
        }
      }
    } else {
      // ── Rule 4: unlaunched tools stay noindexed and ad-free ──
      if (!noindex) {
        problems.push(
          `${rel}: unlaunched tool page is missing ` +
          `<meta name="robots" content="noindex">.`,
        );
      }
      if (hasAds) {
        problems.push(
          `${rel}: unlaunched tool page carries ad markup. noindex stops ` +
          `indexing, not ad serving — add ads at launch, not before.`,
        );
      }
    }
  }
}

if (problems.length) {
  console.error(`\ncontent health: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error("\nSee docs/launching-a-tool.md for the rules behind these checks.\n");
  process.exit(1);
}
console.log("content health: OK");
