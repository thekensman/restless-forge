#!/usr/bin/env node
/* check-urls.mjs: serve dist/ with the REAL nginx/restless-forge.conf and
 * check, over HTTP, that every page answers at exactly one URL.
 *
 * Run it after ./build.sh. It needs an nginx binary (and openssl for a
 * throwaway certificate). CI installs nginx when the runner image lacks it.
 *
 * WHY A REAL SERVER
 *
 * Search Console spent 2026 reporting URL bugs that no offline check could
 * see, because each one was a decision nginx makes at request time:
 *
 *   - canonical URLs that 404'd (location /tools/ had no $uri.html fallback)
 *   - canonicals and sitemap entries naming the unslashed form of a directory
 *     page, which nginx 301s back to the slashed one
 *   - every legacy .html URL serving the page again with a 200, so Google held
 *     two URLs per article and picked the .html one as canonical
 *
 * scripts/check-links.mjs models nginx's try_files chains against dist/, and
 * a model only knows what it was told. The deploy workflow's sitemap sweep
 * asks production, but only after the change has shipped. This asks the real
 * config, on every pull request, before merge.
 *
 * WHAT IT ASSERTS (policy: docs/indexing.md)
 *
 *   1. Every HTML page in dist/ returns 200 at its canonical URL, and that is
 *      the URL its rel=canonical and og:url name.
 *   2. Every other spelling of a page (the literal .html path, or a directory
 *      page without its slash) 301s straight to the canonical URL.
 *   3. sitemap.xml lists exactly the indexable pages, by canonical URL.
 *   4. Each retired URL in LEGACY below 301s to its replacement in one hop,
 *      and no LEGACY entry shadows a real page.
 *   5. The URLs in GONE stay 404 (a deleted page is not redirected to some
 *      loosely related one).
 *   6. http:// and www. variants 301 to the https apex, path and query intact.
 *   7. No internal link the site emits points at a redirect or an error: the
 *      static HTML, the JSON-LD, and the nav/footer that shared.js renders at
 *      runtime.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const SITE = "https://restless-forge.dev";

/* ── Retired URLs with a known replacement ──
 * The spec for the $rf_legacy_target table in nginx/restless-forge.conf. Every
 * entry is backed by git history and/or Search Console (docs/indexing.md). */
const HOLOPATH_SLUGS = [
  "best-hologram-projectors", "best-images-for-holograms", "colour-theory-holographic-art",
  "creating-hologram-art", "diy-hologram-pyramid", "future-of-holographic-displays",
  "gif-vs-video-hologram", "history-of-holograms", "hologram-displays-for-business",
  "hologram-effects-explained", "holograms-in-pop-culture", "how-hologram-pyramids-work",
  "led-hologram-fans", "optimizing-hologram-output", "peppers-ghost-illusion",
];
const LEGACY = [
  // HoloPath's articles index linked here (holopath.art-era paths) until 2026-08-06.
  ...HOLOPATH_SLUGS.map((s) => [`/articles/${s}`, `/tools/holopath/articles/${s}`]),
  // HoloPath's sub-pages were <page>.html until 2026-05-08.
  ["/tools/holopath/about.html", "/tools/holopath/about/"],
  ["/tools/holopath/faq.html", "/tools/holopath/faq/"],
  ["/tools/holopath/how-it-works.html", "/tools/holopath/how-it-works/"],
  // Per-tool legal/contact pages, retired for the site-global ones 2026-08-04.
  ["/tools/holopath/contact.html", "/contact"],
  ["/tools/holopath/privacy.html", "/privacy"],
  ["/tools/holopath/terms.html", "/terms"],
  ["/tools/holopath/contact/", "/contact"],
  ["/tools/what-is-my-time-worth/privacy/", "/privacy"],
  ["/tools/what-is-my-time-worth/terms/", "/terms"],
  ["/tools/what-is-my-time-worth/contact/", "/contact"],
  ["/tools/what-is-my-time-worth/privacy", "/privacy"],
  ["/tools/tattoosafe/contact/", "/contact"],
  // What Is My Time Worth's blog/ became articles/ on 2026-03-16.
  ["/tools/what-is-my-time-worth/blog", "/tools/what-is-my-time-worth/articles/"],
  ["/tools/what-is-my-time-worth/blog/", "/tools/what-is-my-time-worth/articles/"],
  ["/tools/what-is-my-time-worth/blog/life-energy-and-ymoyl/",
    "/tools/what-is-my-time-worth/articles/life-energy-and-ymoyl/"],
];

/* The representative legacy/current pairs from the 2026-09 indexing
   investigation. Check 2 already covers every .html spelling; these are named
   so that a failure reads in the investigation's own terms. */
const INVESTIGATION_PAIRS = ["how-hologram-pyramids-work", "diy-hologram-pyramid",
  "best-hologram-projectors", "optimizing-hologram-output", "peppers-ghost-illusion"]
  .map((s) => [`/tools/holopath/articles/${s}.html`, `/tools/holopath/articles/${s}`]);

/* ── URLs that must stay 404 ──
 * A redirect needs a genuine replacement. These have none, and sending them to
 * a hub page would be a soft 404 in Google's eyes. */
const GONE = [
  "/essays/the-time-value-philosophy",       // "coming soon" stub, deleted 2026-07-18
  "/essays/making-tools-for-the-restless",   // "coming soon" stub, deleted 2026-07-18
  "/no-such-page.html",                      // .html with no file behind it
  "/tools/holopath/articles/best-hologram-projectors/", // never-published slash form
  "/tools/holopath/sitemap.xml",             // per-tool sitemaps were stale; removed
  "/tools/holopath/robots.txt",              // robots.txt only counts at the host root
  "/./about.html",                           // dot segments must not mint a duplicate
];

/* ── Host and protocol variants → https apex ── */
const HOSTS = [
  ["http://restless-forge.dev/", `${SITE}/`],
  ["http://restless-forge.dev/about", `${SITE}/about`],
  ["https://www.restless-forge.dev/about", `${SITE}/about`],
  ["http://www.restless-forge.dev/tools/holopath/?ref=x", `${SITE}/tools/holopath/?ref=x`],
  ["https://www.restless-forge.dev/", `${SITE}/`],
];

// ─────────────────────────────────────────────────────────────────────────────

const fail = (msg) => { console.error(`check-urls: ${msg}`); process.exit(1); };
if (!existsSync(dist)) fail("dist/ not found. Run ./build.sh first.");

const run = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8" });
function findBinary(name, extra = []) {
  const which = run("sh", ["-c", `command -v ${name}`]);
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  return extra.find((p) => existsSync(p)) || null;
}
const nginxBin = process.env.NGINX || findBinary("nginx", ["/usr/sbin/nginx", "/usr/local/sbin/nginx"]);
if (!nginxBin) {
  fail("no nginx binary found. Install one (apt-get install nginx-light, brew install nginx) or set NGINX=/path/to/nginx.");
}
const openssl = findBinary("openssl");
if (!openssl) fail("no openssl binary found (needed for a throwaway TLS certificate).");

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer().listen(0, "127.0.0.1", () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  }).on("error", reject);
});

/* ── Build a sandboxed copy of the vhost ──
 * Only what cannot work outside the droplet changes: certificate paths, the
 * web root, and listen addresses. Everything that decides a response is
 * byte-for-byte the file production runs. Each substitution must match, so a
 * reshaped config fails loudly here instead of being silently half-tested. */
const prefix = mkdtempSync(join(tmpdir(), "rf-check-urls-"));
let nginxStarted = false;
function stopNginx() {
  if (nginxStarted) run(nginxBin, ["-p", prefix, "-c", join(prefix, "nginx.conf"), "-e", join(prefix, "error.log"), "-s", "stop"]);
  nginxStarted = false;
  rmSync(prefix, { recursive: true, force: true });
}
process.on("exit", stopNginx);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(130));

const [httpsPort, httpPort] = [await freePort(), await freePort()];

const cert = run(openssl, [
  "req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-subj", "/CN=restless-forge.dev",
  "-keyout", join(prefix, "privkey.pem"), "-out", join(prefix, "fullchain.pem"),
]);
if (cert.status !== 0) fail(`openssl could not create a test certificate:\n${cert.stderr}`);

let vhost = readFileSync(join(root, "nginx", "restless-forge.conf"), "utf8");
function sub(pattern, replacement, what) {
  const before = vhost;
  vhost = vhost.replace(pattern, replacement);
  if (vhost === before) fail(`nginx/restless-forge.conf no longer contains ${what}; update the sandbox in check-urls.mjs.`);
}
sub(/\/etc\/letsencrypt\/live\/restless-forge\.dev\//g, `${prefix}/`, "the letsencrypt certificate paths");
sub(/root \/var\/www\/restless-forge;/, `root "${dist}";`, "`root /var/www/restless-forge;`");
sub(/^\s*listen \[::\]:.*$/gm, "", "IPv6 listen directives");
sub(/listen 443 ssl http2;/g, `listen 127.0.0.1:${httpsPort} ssl http2;`, "`listen 443 ssl http2;`");
sub(/listen 80;/g, `listen 127.0.0.1:${httpPort};`, "`listen 80;`");
vhost = vhost.replace(/ssl_stapling(_verify)?\s+on;/g, "ssl_stapling$1 off;"); // self-signed: nothing to staple
writeFileSync(join(prefix, "site.conf"), vhost);

/* The distro build bakes absolute temp paths under /var/lib/nginx into the
   binary, which a non-root run cannot create. Point every one at the prefix. */
const version = run(nginxBin, ["-V"]).stderr;
const temps = [...version.matchAll(/--http-([a-z-]+)-temp-path=\S+/g)]
  .map(([, kind]) => kind)
  .filter((kind) => !version.includes(`--without-http_${kind.replace("-", "_")}_module`))
  .map((kind) => {
    const dir = join(prefix, "tmp", kind);
    mkdirSync(dir, { recursive: true });
    return `  ${kind.replace("-", "_")}_temp_path ${dir};`;
  });
const confDir = dirname((version.match(/--conf-path=(\S+)/) || [])[1] || "/etc/nginx/nginx.conf");
const mime = [join(confDir, "mime.types"), "/etc/nginx/mime.types", "/usr/local/etc/nginx/mime.types"]
  .find((p) => existsSync(p));
if (!mime) fail("could not find nginx's mime.types.");

writeFileSync(join(prefix, "nginx.conf"), `
${process.getuid?.() === 0 ? "user root;" : ""}
worker_processes 1;
pid ${prefix}/nginx.pid;
error_log ${prefix}/error.log warn;
events { worker_connections 256; }
http {
  include ${mime};
  default_type application/octet-stream;
  access_log off;
  # Production listens on 80/443, so its Location headers never carry a
  # port. The sandbox uses high ports; keep them out of Location too.
  port_in_redirect off;
${temps.join("\n")}
  include ${prefix}/site.conf;
}
`);

const nginxArgs = ["-p", prefix, "-c", join(prefix, "nginx.conf"), "-e", join(prefix, "error.log")];
const test = run(nginxBin, ["-t", ...nginxArgs]);
if (test.status !== 0) fail(`nginx -t rejected the config:\n${test.stderr}`);
const start = run(nginxBin, nginxArgs);
if (start.status !== 0) fail(`nginx would not start:\n${start.stderr}`);
nginxStarted = true;

/* ── HTTP client pinned to the sandbox ──
 * Absolute URLs go in, so host and scheme are part of what is tested; the
 * connection always lands on 127.0.0.1. Redirects are never followed: the
 * first response is the thing under test. */
const agents = {
  "https:": new https.Agent({ keepAlive: true, rejectUnauthorized: false }),
  "http:": new http.Agent({ keepAlive: true }),
};
function fetchRaw(url) {
  const u = new URL(url);
  const mod = u.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request({
      host: "127.0.0.1",
      port: u.protocol === "https:" ? httpsPort : httpPort,
      servername: u.hostname,
      path: rawPath(url),
      method: "GET",
      headers: { Host: u.hostname },
      agent: agents[u.protocol],
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolve({
        status: res.statusCode,
        location: res.headers.location || "",
        cacheControl: [res.headers["cache-control"] || ""].flat().join(", "),
        body,
      }));
    });
    req.setTimeout(10000, () => req.destroy(new Error(`timeout: ${url}`)));
    req.on("error", reject);
    req.end();
  });
}
/* new URL() would normalise "/./about.html" away; send the path as written. */
const rawPath = (url) => url.replace(/^https?:\/\/[^/]+/, "") || "/";

async function waitForNginx() {
  for (let i = 0; i < 50; i++) {
    try { await fetchRaw(`${SITE}/robots.txt`); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  fail(`nginx did not answer on 127.0.0.1:${httpsPort}\n${readFileSync(join(prefix, "error.log"), "utf8")}`);
}
await waitForNginx();

const cache = new Map();
const get = (url) => {
  if (!cache.has(url)) {
    // A failed request is a finding like any other, not a crash.
    cache.set(url, fetchRaw(url).catch((err) => ({ status: `no answer (${err.message})`, location: "", cacheControl: "", body: "" })));
  }
  return cache.get(url);
};

const problems = [];
const counts = {};
const tally = (check) => { counts[check] = (counts[check] || 0) + 1; };
const problem = (check, msg) => problems.push(`[${check}] ${msg}`);

/* Expect exactly one 301 to `to`, and `to` itself to be a 200. */
async function expectRedirect(check, from, to) {
  tally(check);
  const r = await get(from);
  if (r.status !== 301 || r.location !== to) {
    problem(check, `${from} → ${r.status}${r.location ? ` ${r.location}` : ""}, want 301 ${to}`);
    return;
  }
  const t = await get(to);
  if (t.status !== 200) problem(check, `${from} → 301 ${to}, which answers ${t.status} (want 200, one hop)`);
}

// ── 1 + 2: every page, at its one URL ────────────────────────────────────────
function* walkHtml(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walkHtml(p);
    else if (e.name.endsWith(".html")) yield p;
  }
}
const attr = (html, re, name) => ((html.match(re) || [""])[0].match(new RegExp(`${name}=["']([^"']+)["']`)) || [])[1];
const noindex = (html) => /<meta(?=[^>]*\bname=["']robots["'])(?=[^>]*\bcontent=["'][^"']*noindex)[^>]*>/i.test(html);

const pages = [];
for (const file of walkHtml(dist)) {
  const rel = relative(dist, file).split("\\").join("/");
  const path = rel === "index.html" ? "/"
    : rel.endsWith("/index.html") ? `/${rel.slice(0, -"index.html".length)}`
    : `/${rel.slice(0, -".html".length)}`;
  const html = readFileSync(file, "utf8");
  pages.push({ rel, path, url: SITE + path, html, indexable: !noindex(html) });
}
const canonicalUrls = new Set(pages.map((p) => p.url));

for (const p of pages) {
  tally("page");
  const r = await get(p.url);
  if (r.status !== 200) { problem("page", `${p.url} (${p.rel}) answers ${r.status}, want 200`); continue; }
  // HTML must revalidate (docs/frontend-pitfalls.md §1). Extensionless pages
  // once went out with no Cache-Control at all, because only the \.html$
  // location set one and try_files serves them from the prefix locations.
  if (!/no-cache/.test(r.cacheControl)) {
    problem("page", `${p.url} is served with Cache-Control "${r.cacheControl}", want no-cache (HTML must revalidate)`);
  }

  const canonical = attr(p.html, /<link[^>]+rel=["']canonical["'][^>]*>/i, "href");
  const ogUrl = attr(p.html, /<meta[^>]+property=["']og:url["'][^>]*>/i, "content");
  if (canonical && canonical !== p.url) problem("page", `${p.rel}: served at ${p.url} but rel=canonical says ${canonical}`);
  if (!canonical && p.indexable) problem("page", `${p.rel}: indexable but declares no rel=canonical`);
  if (ogUrl && ogUrl !== p.url) problem("page", `${p.rel}: served at ${p.url} but og:url says ${ogUrl}`);

  await expectRedirect("html-spelling", `${SITE}/${p.rel}`, p.url);
  if (p.path !== "/" && p.path.endsWith("/")) await expectRedirect("dir-slash", p.url.slice(0, -1), p.url);
}

// ── 3: sitemap = the indexable pages ─────────────────────────────────────────
{
  tally("sitemap");
  const locs = [...readFileSync(join(dist, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const indexable = new Set(pages.filter((p) => p.indexable).map((p) => p.url));
  for (const loc of locs) {
    if (!indexable.has(loc)) problem("sitemap", `${loc} is listed but is not the canonical URL of an indexable page`);
  }
  for (const url of indexable) {
    if (!locs.includes(url)) problem("sitemap", `${url} is indexable but missing from sitemap.xml (Google has no route to it)`);
  }
}

// ── 4: retired URLs → their replacement ──────────────────────────────────────
for (const [from, to] of LEGACY) {
  if (canonicalUrls.has(SITE + from) || existsSync(join(dist, from)) ||
      existsSync(join(dist, `${from}.html`)) || existsSync(join(dist, from, "index.html"))) {
    problem("legacy", `${from} is a real page in dist/ now; its legacy redirect would hide it`);
    continue;
  }
  await expectRedirect("legacy", SITE + from, SITE + to);
}
for (const [from, to] of INVESTIGATION_PAIRS) await expectRedirect("investigation-pair", SITE + from, SITE + to);

// ── 5: genuinely gone ────────────────────────────────────────────────────────
for (const path of GONE) {
  tally("gone");
  const r = await get(SITE + path);
  if (r.status !== 404) problem("gone", `${path} → ${r.status}${r.location ? ` ${r.location}` : ""}, want 404`);
}

// ── 6: host and protocol ─────────────────────────────────────────────────────
for (const [from, to] of HOSTS) await expectRedirect("host", from, to);

// ── 7: every internal link lands on a 200 ────────────────────────────────────
/* Links the site emits, from three places: href/src in static HTML, absolute
   site URLs inside JSON-LD, and the header/footer shared.js renders at runtime
   (render it here in a DOM-less sandbox; Googlebot sees the rendered DOM). */
const links = new Map(); // url → first page that emits it
const addLink = (raw, from) => {
  if (!raw) return;
  let u = raw.trim().replace(/&amp;/g, "&");
  if (u.startsWith(SITE)) u = u.slice(SITE.length) || "/";
  if (!u.startsWith("/") || u.startsWith("//") || u.startsWith("/api/")) return;
  u = u.split("#")[0];
  if (u && !links.has(SITE + u)) links.set(SITE + u, from);
};
for (const p of pages) {
  for (const m of p.html.matchAll(/\s(?:href|src)=["']([^"']+)["']/g)) addLink(m[1], p.rel);
  for (const block of p.html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const m of block[1].matchAll(/"(https:\/\/restless-forge\.dev[^"]*)"/g)) addLink(m[1], `${p.rel} (JSON-LD)`);
  }
}

function renderChrome(toolSharedJs, pathname) {
  try { return renderChromeUnsafe(toolSharedJs, pathname); } catch (err) {
    problem("chrome", `${toolSharedJs ? relative(root, toolSharedJs) : "site/shared.js"} threw in the sandbox (${err.message}); update renderChrome in check-urls.mjs`);
    return [];
  }
}
function renderChromeUnsafe(toolSharedJs, pathname) {
  const grabbed = [];
  const el = () => ({ innerHTML: "", style: {}, addEventListener() {}, setAttribute() {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelector: () => null, querySelectorAll: () => [], appendChild() {}, insertAdjacentHTML() {} });
  const document = { readyState: "loading", addEventListener() {}, querySelector: () => null,
    querySelectorAll: () => [], getElementById: () => null, createElement: el, body: el() };
  const window = { location: { pathname }, addEventListener() {} };
  const ctx = vm.createContext({ window, document, console, setTimeout, clearTimeout });
  vm.runInContext(readFileSync(join(root, "site", "shared.js"), "utf8"), ctx, { filename: "site/shared.js" });
  if (!toolSharedJs) return [window.rfNav(), window.rfFooter()];
  const mount = window.rfMountToolChrome;
  window.rfMountToolChrome = (config) => { const chrome = mount(config); grabbed.push(chrome); return chrome; };
  vm.runInContext(readFileSync(toolSharedJs, "utf8"), ctx, { filename: toolSharedJs });
  return grabbed.flatMap((c) => [c.header(), c.footer()]);
}
{
  const rendered = [["site nav/footer", renderChrome(null, "/")]];
  for (const e of readdirSync(join(dist, "tools"), { withFileTypes: true })) {
    const js = join(dist, "tools", e.name, "shared.js");
    if (e.isDirectory() && existsSync(js)) {
      rendered.push([`tools/${e.name}/shared.js`, renderChrome(js, `/tools/${e.name}/`)]);
    }
  }
  for (const [from, html] of rendered) {
    tally("chrome");
    const found = html.join("").match(/href=["'][^"']+["']/g) || [];
    if (!found.length) {
      problem("chrome", `${from} rendered no links in the sandbox; it must call rfMountToolChrome (or the sandbox here needs updating)`);
    }
    for (const m of found) addLink(m.slice(6, -1), `${from} (runtime)`);
  }
}
for (const [url, from] of links) {
  tally("link");
  const r = await get(url);
  if (r.status !== 200) problem("link", `${from} links ${url.slice(SITE.length)} → ${r.status}${r.location ? ` ${r.location}` : ""}`);
}

// ── report ───────────────────────────────────────────────────────────────────
const summary = Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(", ");
if (problems.length) {
  console.error(`\ncheck-urls: ${problems.length} problem(s) (${summary})\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error("\nThese are real responses from nginx/restless-forge.conf serving dist/. See docs/indexing.md.\n");
  process.exit(1);
}
console.log(`check-urls: OK (${summary}; ${cache.size} requests against nginx/restless-forge.conf)`);
process.exit(0);
