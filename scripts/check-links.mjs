#!/usr/bin/env node
/* check-links.mjs — every internal URL the site emits must actually resolve.
 *
 * Runs against dist/ (not source), because resolution depends on how nginx
 * serves the built tree, not on where files live in the repo. Run it after
 * ./build.sh.
 *
 * This exists because of a defect that was invisible from inside the repo and
 * expensive outside it. Two independent bugs, both silent:
 *
 *   1. Every tool article declared an EXTENSIONLESS rel=canonical and og:url
 *      (/tools/<tool>/articles/<slug>), but `location /tools/` in nginx had no
 *      `$uri.html` fallback the way the site root did. So all 19 articles told
 *      Google their authoritative URL was a page that returned 404 — while the
 *      .html URL in sitemap.xml returned 200 the whole time. Requesting the
 *      sitemap URL, which is the obvious thing to check, showed nothing wrong.
 *
 *   2. HoloPath's articles index linked to /articles/<slug> — site-root
 *      absolute, left over from the standalone holopath.art domain, never
 *      rewritten when the tool moved under /tools/holopath/. Those resolved to
 *      the global /articles/ hub, where none of them exist. Sixteen articles
 *      reachable only by typing the URL by hand.
 *
 * Neither shows up in a build, a test, or a source grep. Both show up in
 * Search Console weeks later as a pile of crawl errors.
 *
 * Resolution below mirrors the try_files chains in nginx/restless-forge.conf.
 * If that config changes, change this too — the point is that it agrees with
 * production, not that it is independently reasonable.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const SITE = "https://restless-forge.dev";

if (!existsSync(dist)) {
  console.error("check-links: dist/ not found — run ./build.sh first.");
  process.exit(1);
}

/* Retired per-tool legal pages 301 to the site-global equivalents. A link to
   one is correct even though no file exists for it. */
const LEGAL_REDIRECT = /^\/tools\/(what-is-my-time-worth|holopath|tattoosafe)\/(privacy|terms|contact)\/?$/;
/* Per-tool assets fall back to the site root when the tool ships no override. */
const ASSET_FALLBACK = /^\/tools\/[^/]+\/((?:favicon\.(?:svg|ico))|apple-touch-icon\.png|site\.webmanifest|og-image\.png)$/;

const isFile = (p) => existsSync(p) && statSync(p).isFile();

/* try_files $uri $uri.html $uri/ $uri/index.html — the chain both
   `location /` and `location /tools/` now use. */
function resolves(urlPath) {
  if (LEGAL_REDIRECT.test(urlPath)) return true;
  const asset = urlPath.match(ASSET_FALLBACK);
  if (asset && isFile(join(dist, asset[1]))) return true;

  const rel = decodeURIComponent(urlPath).replace(/^\//, "");
  if (urlPath.endsWith("/")) return isFile(join(dist, rel, "index.html"));
  return (
    isFile(join(dist, rel)) ||
    isFile(join(dist, `${rel}.html`)) ||
    isFile(join(dist, rel, "index.html"))
  );
}

function* walkHtml(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walkHtml(p);
    else if (e.name.endsWith(".html")) yield p;
  }
}

/* Internal references only. /api/ is proxied to the backend and has no file. */
function internalRefs(html) {
  const out = new Set();
  const add = (raw) => {
    if (!raw) return;
    let u = raw.trim();
    if (u.startsWith(SITE)) u = u.slice(SITE.length) || "/";
    if (!u.startsWith("/")) return;          // external, mailto:, #anchor, relative
    if (u.startsWith("//")) return;          // protocol-relative → external
    u = u.split("#")[0].split("?")[0];       // cache-busting ?v= and fragments
    if (!u || u.startsWith("/api/")) return;
    out.add(u);
  };
  for (const m of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) add(m[1]);
  for (const m of html.matchAll(/<link[^>]+rel=["']canonical["'][^>]*>/gi)) {
    add((m[0].match(/href=["']([^"']+)["']/) || [])[1]);
  }
  for (const m of html.matchAll(/<meta[^>]+property=["']og:url["'][^>]*>/gi)) {
    add((m[0].match(/content=["']([^"']+)["']/) || [])[1]);
  }
  return out;
}

const problems = [];
let pages = 0;
let links = 0;

for (const file of walkHtml(dist)) {
  pages++;
  const rel = relative(dist, file);
  const html = readFileSync(file, "utf8");
  for (const url of internalRefs(html)) {
    links++;
    if (!resolves(url)) problems.push(`${rel} → ${url}`);
  }
}

/* sitemap.xml is what Google actually crawls; a dead URL in it is the most
   expensive kind, since it is an explicit invitation to fetch. */
const sitemap = join(dist, "sitemap.xml");
if (isFile(sitemap)) {
  for (const m of readFileSync(sitemap, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const u = m[1].startsWith(SITE) ? m[1].slice(SITE.length) || "/" : m[1];
    links++;
    if (u.startsWith("/") && !resolves(u)) problems.push(`sitemap.xml → ${u}`);
  }
}

/* ── A sitemap URL must be the canonical URL of the page it points at ──
 *
 * The resolves() check above asks only "does some file serve this path". That
 * is too weak, and it let a third variant of the canonical bug through.
 *
 * HoloPath's four sub-pages were listed in sitemap.xml as
 * /tools/holopath/about/ (200) while the pages themselves declared
 * rel=canonical and og:url as /tools/holopath/about — no trailing slash, which
 * nginx 301s straight back to the slashed form. resolves() passed it, because
 * /tools/holopath/about does find about/index.html on disk; the redirect only
 * exists in production, where a file-existence test cannot see it. So Google
 * was invited to crawl a URL, served 200, and then told by the page that its
 * real address was somewhere else — which turned out to be a redirect back to
 * where it started. Contradictory canonicalisation on four pages, the same
 * family as bugs 1 and 2 above with 301 substituted for 404.
 *
 * The invariant that actually matters is the stronger one: the URL we
 * advertise IS the URL the page claims. Comparing the two strings catches the
 * trailing-slash mismatch, the extensionless-canonical bug, and any future
 * drift between the sitemap generator and a hand-written <head>. Noindexed
 * pages are not in the sitemap and are therefore exempt, which is correct —
 * they are not advertised to anyone. */
function fileServing(urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\//, "");
  const candidates = urlPath.endsWith("/")
    ? [join(dist, rel, "index.html")]
    : [join(dist, `${rel}.html`), join(dist, rel, "index.html"), join(dist, rel)];
  return candidates.find((c) => isFile(c) && c.endsWith(".html")) || null;
}

if (isFile(sitemap)) {
  for (const m of readFileSync(sitemap, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const loc = m[1];
    const urlPath = loc.startsWith(SITE) ? loc.slice(SITE.length) || "/" : loc;
    if (!urlPath.startsWith("/")) continue;
    const file = fileServing(urlPath);
    if (!file) continue; // already reported by the resolves() pass above
    const html = readFileSync(file, "utf8");
    const tag = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i);
    if (!tag) {
      problems.push(`${relative(dist, file)}: in sitemap.xml but declares no rel=canonical`);
      continue;
    }
    const href = (tag[0].match(/href=["']([^"']+)["']/) || [])[1];
    if (href !== loc) {
      problems.push(
        `${relative(dist, file)}: sitemap says ${loc} but the page's canonical is ${href} ` +
        `— one of the two is wrong, and Google is told to prefer the canonical`,
      );
    }
    // og:url is a weaker canonicalisation hint than rel=canonical, but it is
    // one, and checking only the canonical missed WIMTW's main page pointing
    // og:url at the unslashed URL that 301s. Same string, same rule.
    const og = html.match(/<meta[^>]+property=["']og:url["'][^>]*>/i);
    const ogUrl = og && (og[0].match(/content=["']([^"']+)["']/) || [])[1];
    if (ogUrl && ogUrl !== loc) {
      problems.push(
        `${relative(dist, file)}: sitemap says ${loc} but og:url is ${ogUrl}`,
      );
    }
  }
}

/* ── Cache-busting: every stable-filename css/js must carry ?v=<hash> ──
 *
 * nginx serves css/js as `immutable, max-age=31536000` while HTML is
 * `no-cache`. That split is only safe if the URL changes when the file does.
 * /styles.css was referenced bare for months, so returning visitors held a
 * year-old stylesheet against freshly deployed markup — and `immutable` means
 * the browser does not even revalidate to find out.
 *
 * It surfaced as a phantom: when the rail ads shipped, phones with a cached
 * pre-rail styles.css had no `.ad-rail { display: none }`, so two 600px ad
 * containers rendered as ordinary blocks and pushed the article 1200px down
 * behind a wall of black. Nothing reproduced locally, because a local build
 * always serves a fresh stylesheet. Only the stale client saw it.
 *
 * Vite's own bundles (assets/index-<hash>.js) put the hash in the filename and
 * need no query string; anything else with a stable name does.
 */
const HASHED_FILENAME = /-[A-Za-z0-9_-]{8,}\.(?:js|css)$/;

for (const file of walkHtml(dist)) {
  const rel = relative(dist, file);
  const html = readFileSync(file, "utf8");
  for (const m of html.matchAll(/(?:href|src)=["'](\/[^"']+\.(?:css|js))(\?[^"']*)?["']/g)) {
    const [, path, query] = m;
    if (query && query.includes("v=")) continue;
    if (HASHED_FILENAME.test(path)) continue;
    problems.push(
      `${rel} → ${path} is served immutable for a year but has no ?v= hash. ` +
      `Add a bust_cache call in build.sh, or returning visitors keep a stale ` +
      `copy against new HTML.`,
    );
  }
}

if (problems.length) {
  console.error(`\ncheck-links: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(
    "\nResolution mirrors nginx/restless-forge.conf. A link that 404s in " +
    "production is a crawl error in Search Console weeks later.\n",
  );
  process.exit(1);
}
console.log(`check-links: OK (${links} internal links across ${pages} pages)`);
