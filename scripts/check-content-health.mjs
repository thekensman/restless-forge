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
 *   5. Site-global pages under site/ that load the AdSense script must clear
 *      the same word floor. The first version of this script only walked
 *      tools/, which is exactly why /sites-i-like (47 words), /essays/ (121)
 *      and the /tools/ hub (159) survived a remediation pass untouched — and
 *      those are a reviewer's first clicks. A page with the loader is a
 *      monetized page whether or not it has an <ins> slot, because Auto Ads
 *      serves against the loader alone.
 *
 *   6. A page carrying an ad SLOT must also carry the LOADER. Three TattooSafe
 *      sub-pages had <ins class="adsbygoogle"> and called rfMountAdsenseSlots()
 *      with no loader script, so the queue was pushed and nothing consumed it —
 *      ads silently never rendered. Found by hand; nothing caught it.
 *
 *   7. A local image a page references must exist on disk. The origin essay
 *      shipped its prose before its four photographs were in the repo, and
 *      nothing would have stopped it merging with four broken images on the
 *      site's most prominent piece of writing. Broken images are invisible in
 *      review (the HTML looks fine) and obvious to every reader.
 *      This covers og:image and JSON-LD image too, which are the opposite
 *      problem: invisible to the reader AND to review, because nothing on the
 *      page renders them. When the essay's images landed under a different
 *      directory than its front-matter named, the visible <figure> tags were
 *      corrected and the social card silently kept pointing into the void —
 *      an essay shell's <head> is generated once and never resynced.
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

/* An ad SLOT (the unit itself) vs the LOADER (the script that fills it).
   A page needs both: a slot alone pushes to a queue nothing consumes, and a
   loader alone still monetizes the page via Auto Ads. */
const hasAdSlot = (html) => /class=["']adsbygoogle|rfMountAdsenseSlots/.test(html);
const hasAdLoader = (html) => /rfAdsenseClientId/.test(html);

const slotWithoutLoader = (rel) =>
  `${rel}: has an ad slot but no AdSense loader. The slot pushes to a queue ` +
  `nothing consumes, so ads never render. Add the loader after ` +
  `<script src="/shared.js"></script>, or remove the slot.`;

/* ── Rule 7: referenced local images must exist ──
   Checked in two forms:
     a) site-root-absolute paths in src=/href= (what the reader actually sees).
        Tool pages resolve /tools/<id>/… assets through an nginx fallback to the
        site root, so both candidates are accepted before reporting a miss.
     b) absolute https://restless-forge.dev/… URLs anywhere in the page — this
        is og:image and the JSON-LD Article.image, which are never rendered and
        so are never noticed when they rot. An essay shell's <head> is written
        ONCE, at creation, so changing `image:` front-matter afterwards does not
        update it: the origin essay's images moved and its social card kept
        pointing at the old path. Nothing looked wrong on the page.
   Remote URLs on other hosts and data: URIs are skipped. */
const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const SITE = "https://restless-forge.dev";

function missingImages(file, html) {
  const out = [];
  const seen = new Set();
  const refs = [
    ...[...html.matchAll(/(?:src|href)=["'](\/[^"'?#]+)["']/g)].map((m) => m[1]),
    ...[...html.matchAll(new RegExp(`${SITE}(/[^"'\\s?#]+)`, "g"))].map((m) => m[1]),
  ];
  for (const url of refs) {
    if (!IMG_EXT.test(url) || seen.has(url)) continue;
    seen.add(url);
    // dist/ layout: site/<path> for site-root assets, and for /tools/<id>/<a>
    // either the tool's public/ dir or the site-root fallback.
    const candidates = [join(root, "site", url.slice(1))];
    const tool = url.match(/^\/tools\/([^/]+)\/(.+)$/);
    if (tool) {
      candidates.push(join(root, "tools", tool[1], "frontend", "public", tool[2]));
      candidates.push(join(root, "site", tool[2]));
    }
    if (!candidates.some((p) => existsSync(p))) out.push(url);
  }
  return out;
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
    const hasAds = hasAdSlot(html);
    const isMainPage = relative(src, file) === "index.html";

    // ── Rule 6: a slot without a loader renders nothing ──
    if (hasAds && !hasAdLoader(html)) problems.push(slotWithoutLoader(rel));

    // ── Rule 7: referenced local images must exist ──
    for (const img of missingImages(file, html)) {
      problems.push(`${rel}: references ${img}, which does not exist.`);
    }

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

/* ── Rules 5 + 6 for the site-global pages ──
   These are a reviewer's first clicks and were unguarded until now. Any page
   loading the AdSense script is monetized — Auto Ads serves against the
   loader alone — so the word floor applies whether or not an <ins> is
   present. Generated blocks (tool grids, friend lists) count toward the
   total: they are real rendered content, just not hand-written. */
for (const file of walkHtml(join(root, "site"))) {
  const rel = relative(root, file);
  const html = readFileSync(file, "utf8");

  if (hasAdSlot(html) && !hasAdLoader(html)) problems.push(slotWithoutLoader(rel));

  for (const img of missingImages(file, html)) {
    problems.push(`${rel}: references ${img}, which does not exist.`);
  }

  if (hasAdLoader(html)) {
    const words = visibleWords(file);
    if (words < MIN_WORDS) {
      problems.push(
        `${rel}: ${words} words but loads AdSense (floor ${MIN_WORDS}). ` +
        `Site-global pages are what a reviewer lands on first — expand it, ` +
        `or drop the loader from this page.`,
      );
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
