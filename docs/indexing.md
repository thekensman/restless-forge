# Indexing and canonical URLs

How Restless Forge makes sure Google sees exactly one URL per page, how that
is enforced, and what the September 2026 indexing investigation found. Read
this before touching `nginx/restless-forge.conf`, renaming or moving a page,
or deleting one.

## The rule: one URL per page

A page's URL follows from where its file sits in `dist/`:

| File | The page's URL |
|---|---|
| `index.html` | `/` |
| `about.html`, `essays/<slug>.html`, `tools/holopath/articles/<slug>.html` | `/about`, `/essays/<slug>`, `/tools/holopath/articles/<slug>` |
| `tools/<id>/index.html`, `tools/<id>/about/index.html` | `/tools/<id>/`, `/tools/<id>/about/` |

That URL, written as `https://restless-forge.dev/...`, is the only one used
anywhere: the page's `rel=canonical`, its `og:url`, the `url` in its JSON-LD,
its `sitemap.xml` entry, and every internal link to it, including the
nav/footer that `shared.js` renders at runtime.

Every other spelling answers with a single 301 to that URL:

| Request | Answer |
|---|---|
| `/about.html` | 301 → `/about` |
| `/tools/holopath/about/index.html`, `/index.html` | 301 → `/tools/holopath/about/`, `/` |
| `/tools/holopath/about` (directory page, no slash) | 301 → `/tools/holopath/about/` |
| a retired URL in the legacy table (below) | 301 → its replacement |
| `http://`, `www.` (any path) | 301 → `https://restless-forge.dev` + same path |
| anything else that has no page behind it | 404, never a redirect to something "close" |

Query strings are carried through every redirect.

## Where it is enforced

| Layer | What it does |
|---|---|
| `nginx/restless-forge.conf` | The maps at the top of the file: `$rf_legacy_target` (retired URLs), `$rf_html_file` / `$rf_html_canonical` (`.html` spellings, only when the file exists), `$rf_html_expires` (HTML revalidates at every URL). nginx's own directory handling adds missing slashes. The port-80 and `www` server blocks handle hosts. |
| `scripts/check-links.mjs` (CI, offline) | Every internal link, canonical, `og:url` and JSON-LD URL resolves to a page **by that page's URL** (a link to `/about.html` or `/tools/x/about` fails). Only the root `sitemap.xml` and `robots.txt` may ship. |
| `scripts/check-urls.mjs` (CI, real nginx) | Serves `dist/` with the real vhost on localhost and asserts the whole policy over HTTP: every page, every `.html` spelling, every directory slash, the sitemap, the legacy table, the 404 list, host variants, `Cache-Control`, and every link the site emits (static, JSON-LD, runtime chrome). Needs `nginx` and `openssl` locally: `npm run build && npm run check-urls`. |
| `.github/workflows/deploy.yml` | After each deploy, against production through Cloudflare: the sitemap sweep (every sitemap URL is a 200 whose canonical is itself) and the legacy sweep (one representative per legacy family, plus host variants, which only warn because Cloudflare and DNS settings live outside this repo). |

## Retired URLs

Each entry in `$rf_legacy_target` needs evidence that the old URL was real
(git history or Search Console) and a replacement with the **same content**.
A merely related page does not qualify, and neither does the homepage.
Sending a dead URL to a loosely related page reads to Google as a soft 404.
`scripts/check-urls.mjs` holds the same list (`LEGACY`) as its spec and fails
if an entry ever shadows a real page.

| Old URL | Now | Why the old URL exists |
|---|---|---|
| `/articles/<slug>` (the 15 HoloPath slugs) | `/tools/holopath/articles/<slug>` | HoloPath's articles index linked here, a holopath.art-era path, until 2026-08-06. Four were still in Search Console's 404 report in September. |
| `/tools/holopath/{about,faq,how-it-works}.html` | `/tools/holopath/<page>/` | HoloPath's sub-pages were `.html` files from the March 2026 consolidation until 2026-05-08. |
| `/tools/{what-is-my-time-worth,holopath,tattoosafe}/{privacy,terms,contact}` (with `/`, `.html` or `/index.html`) | `/privacy`, `/terms`, `/contact` | Per-tool legal pages, retired for the site-global ones on 2026-08-04. Cloud-assisted tools keep their own privacy page and are not in the rule. |
| `/tools/what-is-my-time-worth/blog/` and `/blog/life-energy-and-ymoyl/` | `/tools/what-is-my-time-worth/articles/…` | `blog/` was renamed `articles/` on 2026-03-16, and the whatismytimeworth.app vhost still forwards `/blog/…` path-for-path. |

### Adding one

1. Confirm the old URL was real and the new page is the same content.
2. Add a line to the `$rf_legacy_target` map with a comment saying why.
3. Add the pair to `LEGACY` in `scripts/check-urls.mjs`.
4. `npm run build && npm run check-urls`.

## Deliberately 404

| URL | Why no redirect |
|---|---|
| `/essays/the-time-value-philosophy`, `/essays/making-tools-for-the-restless` | "Coming soon" stubs deleted on 2026-07-18 with no successor. They sat in "Crawled, currently not indexed" from their March/April crawls and will move to 404 when Google recrawls, which is correct. |
| `/tools/<id>/sitemap.xml`, `/tools/<id>/robots.txt` | Leftovers from the standalone domains (see below), removed. |
| Never-published shapes: `/about/`, `/tools/holopath/articles/<slug>/`, `/tools/sandpath/about.html` | No page was ever there. |

## Known limits

- A URL that is legacy in both host and path (for example
  `http://www.restless-forge.dev/about.html`, or
  `holopath.art/articles/<slug>.html` via the old-domain vhost) takes two hops:
  host first, then path. Google follows up to ten. Collapsing it to one would
  mean duplicating the path rules in every redirect server block.
- The old-domain vhosts (`nginx/*-redirect.conf`) are installed by hand and
  are not covered by CI or the deploy sweep.
- `check-urls` proves the config. It cannot see Cloudflare rules or DNS, which
  is why the deploy workflow asks production too.

## September 2026 investigation

The brief: 4 pages indexed, 90 not (12 × 404, 38 × "Crawled, currently not
indexed", 36 × "Discovered, currently not indexed", 3 × "Page with redirect",
1 × "Redirect error"), with the hypothesis that the `.html` to extensionless
migration was incomplete. Evidence came from the Search Console exports of
2026-09-27, git history, and the production vhost served by a real nginx
against a real build (`check-urls` is that test, kept).

### What the HTTP test showed, before the fix

- **Every `.html` URL was a live duplicate.** `location ~* \.html$` served the
  file with a 200 and no redirect: all 15 HoloPath articles, every site page,
  every essay, and every directory page's `index.html`: a second URL for each
  of the 58 sitemap URLs (125 across every built page, unlaunched tools
  included). Until 2026-08-06 the sitemap itself listed the HoloPath `.html`
  URLs while each page's declared canonical 404'd, so Google chose the `.html`
  copy as canonical (URL Inspection for `optimizing-hologram-output.html`,
  crawled 2026-07-01).
- **Retired URLs 404'd although their pages exist under a new address.** That
  covers 8 of the 12 URLs in Search Console's 404 report (4 root-level
  `/articles/<slug>`, and HoloPath's `about.html`, `faq.html`,
  `how-it-works.html` and `contact.html`), the other 11 root-level HoloPath
  slugs its old index linked, and What Is My Time Worth's `/blog/` URLs, whose
  only article has lived under `articles/` since March. Backlinks to
  whatismytimeworth.app/blog/… landed on a 404. The other 4 URLs in that
  report are extensionless HoloPath articles that have answered 200 since
  2026-08-06; Search Console last crawled them in April.
- **Every tool shipped a stale `sitemap.xml` and `robots.txt`** from its
  standalone domain, 15 of each, all deployed. HoloPath's listed its retired
  legal pages and the unslashed `/about`, `/faq`, `/articles`. What Is My Time
  Worth's listed the dead `/blog/` URLs. robots.txt only counts at the host
  root, but the old domains 301 `/robots.txt` path-for-path onto
  `/tools/<id>/robots.txt`, which named these sitemaps. The main sitemap was
  clean; these contradicted it.
- **Every tool's JSON-LD `url` named the unslashed `/tools/<id>`**, a 301,
  while its `rel=canonical` named `/tools/<id>/`. The same slip was in the
  articles' `publisher.url` and in the new-tool template.
- **One internal link hit a redirect**: What Is My Time Worth's main page
  linked `/tools/what-is-my-time-worth/about` without its slash.
- **Canonical HTML at extensionless URLs had no `Cache-Control`.** Only the
  `\.html$` location set `no-cache`, and `try_files $uri.html` serves `/about`,
  essays and HoloPath articles from the prefix locations, so browsers cached
  them heuristically. Not an indexing problem; fixed because the redirect
  change routes every page view through those URLs.
- Clean: every page's `rel=canonical` and `og:url` named its own URL, the root
  sitemap listed exactly the 58 indexable pages, the only `noindex` pages were
  the two intended ones (`/guides/…`, `/sites-i-like`), nginx sets no
  `X-Robots-Tag`, and the vhost already 301'd host variants to the https apex.

### Crawled vs Discovered

- **Crawled, currently not indexed (38):** 24 are URLs that should never be
  indexed as they stand: 15 HoloPath `.html` duplicates, 3 retired legal
  pages, 2 `www` hosts, 2 unslashed directory URLs, 2 deleted stubs. The other
  14 are current pages, 10 of them last crawled in March or April, before the
  canonical fixes and before the real essays shipped.
- **Discovered, currently not indexed (36):** every one is a current
  canonical URL from the sitemap, and none has ever been crawled. The bucket
  went from 0 to 29 on 2026-08-14, right after the 2026-08-06 sitemap switched
  to extensionless URLs, and has only grown since.
- **Indexed (4):** by elimination, the only sitemap URLs in none of the
  exported buckets are `/` and the three tools that inherited 301s from their
  old domains (HoloPath, SandPath, What Is My Time Worth). Confirm in Search
  Console under "View data about indexed pages".

So the hypothesis holds for crawl allocation: Google's recent crawls went to
the legacy URL graph while the current URLs waited. It does **not** explain
everything. Google fetched all 15 HoloPath articles (as `.html`), chose those
URLs as canonical, and still declined to index them. That is an
indexing-selection decision about the content, and fixing URLs will not
reverse it by itself.

### What changed

The nginx rules and guards above; per-tool `sitemap.xml`/`robots.txt` deleted
from all 15 tools that had them; JSON-LD tool URLs slashed in every tool and in the
template; the one non-canonical internal link fixed.

### After deploying

1. Spot-check production (the deploy workflow does this too):

   ```bash
   for u in \
     https://restless-forge.dev/tools/holopath/articles/peppers-ghost-illusion.html \
     https://restless-forge.dev/articles/creating-hologram-art \
     https://restless-forge.dev/tools/what-is-my-time-worth/blog/life-energy-and-ymoyl/ \
     https://www.restless-forge.dev/about; do
     curl -s -o /dev/null -w "%{http_code} $u -> %{redirect_url}\n" "$u"; done
   ```

   Each should print `301` with the canonical URL.
2. In Search Console, URL-inspect a handful of representative URLs, not all of
   them: two legacy `.html` URLs (expect "Page with redirect" after recrawl),
   and two or three current URLs from "Discovered" (Request Indexing on those
   few only). Then "Validate fix" on the 404 and "Crawled" reports.
3. In the Sitemaps report, make sure exactly one sitemap is submitted,
   `https://restless-forge.dev/sitemap.xml`, with status Success and about 58
   discovered URLs. Remove any `http://…/sitemap.xml` or `/tools/<id>/sitemap.xml`
   entry. Several URL Inspections name `http://restless-forge.dev/sitemap.xml`
   (http, not https) as the referring page while also saying "No referring
   sitemaps detected", which is what Google shows when the sitemap it read is
   not the one registered in the property.
4. Leave it three to six weeks. Expect "Page with redirect" to jump from 3 to
   around 30: that is the legacy URLs being consolidated, the intended result.
   What counts as progress: legacy URLs leave "Crawled" and "Not found" for
   "Page with redirect", and "Discovered" starts converting to "Crawled". Only
   then judge whatever is still "Crawled, currently not indexed" as a content
   question.
