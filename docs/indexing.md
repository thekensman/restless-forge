# Indexing and canonical URLs

How Restless Forge makes sure Google sees exactly one URL per page, and how
that is enforced. Read this before touching `nginx/restless-forge.conf`,
renaming or moving a page, or deleting one.

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
| `/articles/<slug>` (the 8 HoloPath slugs still published) | `/tools/holopath/articles/<slug>` | HoloPath's articles index linked here, a holopath.art-era path, until 2026-08-06. Four were still in Search Console's 404 report in September. |
| `/tools/holopath/articles/optimizing-hologram-output` (also `.html` and `/articles/…`) | `/tools/holopath/articles/creating-hologram-art` | Merged on 2026-10-13: both walked through the same tool settings. |
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
| `/tools/<id>/sitemap.xml`, `/tools/<id>/robots.txt` | Leftovers from the standalone domains that re-advertised retired URLs. Removed; `check-links` fails if one ships again. |
| Never-published shapes: `/about/`, `/tools/holopath/articles/<slug>/`, `/tools/sandpath/about.html` | No page was ever there. |
| `/tools/holopath/articles/` best-hologram-projectors, colour-theory-holographic-art, future-of-holographic-displays, history-of-holograms, hologram-displays-for-business, holograms-in-pop-culture (also `.html` and `/articles/…`) | Removed on 2026-10-13 as generic content unrelated to what HoloPath does (`docs/adsense-readiness.md`, F1). No page replaces them, so a redirect would be a soft 404. |

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
