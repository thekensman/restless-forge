# CLAUDE.md — Restless Forge

AI assistant guide for the Restless Forge monorepo.

## What This Is

Restless Forge is a single-domain hub (restless-forge.dev) for free,
browser-first tools. Tools are client-side by default; a small number of
clearly-labeled **cloud-assisted** tools (`tier: 'cloud'` in
`site/tools-data.js`, ☁ badge on their cards) additionally use the shared
FastAPI backend in `backend/`, served at `/api/*` (see `docs/backend.md`).

Currently live:
1. **What Is My Time Worth?** — Real hourly wage calculator (formerly whatismytimeworth.app)
2. **HoloPath** — Hologram GIF generator (formerly holopath.art)
3. **SandPath** — Image/SVG to sand table converter (formerly sandpath.art)
4. **TattooSafe** — AR tattoo scale/placement preview and pricing calculator

Global support pages (about, contact, privacy, terms, FAQ, essays, articles) live at the domain root.

## Repository Layout

```
restless-forge/
├── site/                → Static HTML/CSS for global pages (landing, about, privacy, ...)
│   ├── shared.js        → `rf*` utilities (donate links, nav/footer separators)
│   └── tool-chrome.css  → Shared .site-header / .footer styles for every tool
├── data/                → Cross-tool datasets (tax.ts, mileage.ts, cpi.ts: year-keyed, append-only; subscription-presets.ts)
├── tools/
│   ├── template/frontend/    → Turnkey scaffold (copy via scripts/new-tool.sh)
│   ├── what-is-my-time-worth/frontend/
│   ├── holopath/frontend/
│   ├── sandpath/frontend/
│   └── tattoosafe/frontend/
├── backend/             → Shared FastAPI service for cloud-assisted tools (/api/*; docs/backend.md)
├── scripts/
│   └── new-tool.sh      → Scaffolds tools/<name>/frontend/ from tools/template/
├── nginx/               → Production nginx configs (main site + 301 redirects)
├── vite.config.ts       → Root dev server (serves site/ + proxies tool servers)
├── package.json         → Root scripts: `npm run dev`, `npm test`, `npm run build`
├── build.sh             → Builds all tools → dist/
└── dist/                → Build output (gitignored)
```

### Tool frontend convention

Every tool under `tools/<name>/frontend/` follows the same layout:

```
frontend/
├── package.json          ← name: "<name>-frontend", version 1.0.0, ES modules
├── tsconfig.json         ← target ES2022, strict, bundler moduleResolution
├── vite.config.ts        ← calls defineToolConfig({ base, port, dir })
├── src/                  ← Vite root: HTML pages + TypeScript live here
│   ├── index.html        ← Main app (TypeScript SPA entry point)
│   ├── styles.css        ← Main-app styles (Vite-bundled)
│   ├── app.ts            ← TS entry
│   ├── about/index.html  ← Sub-pages use directory style (clean URLs)
│   ├── faq/index.html
│   └── ...
└── public/               ← Static assets only (NOT HTML pages)
    ├── shared.js         ← Tool-specific header/footer renderer
    ├── pages.css         ← Sub-page styles
    └── [favicons, og-image, robots.txt, sitemap.xml, ads.txt, ...]
```

**Why `src/` for HTML, not `public/`**: Vite's MPA mode (`appType: 'mpa'`) only
routes requests to HTML files found in `root` (`src/`). Files in `public/` are
static assets served verbatim — Vite does not treat them as navigable pages.

## Key Architecture Decisions

- **Monorepo**: all tool source + global pages in one repo.
- **Client-side by default**: if a tool needs heavy computation, it runs in the browser (Canvas, Workers, Wasm, etc.). A tool gets server-side help only when the feature is impossible client-side (e.g. calling the Claude API); such tools set `tier: 'cloud'` in `site/tools-data.js`, wear the ☁ Cloud-assisted badge, spell out their data flow on a per-tool privacy page, and route through the shared backend at `/api/v1/<tool>/` (`backend/`, FastAPI + SQLite, no containers — `docs/backend.md`).
- **Shared data layer**: cross-tool refreshed datasets (tax brackets, …) live in `data/` (repo root — referenced by tools, not a tool itself) as year-keyed, append-only TS modules, imported by consuming tools and bundled at build time. Tool-specific data stays in each tool's engine. Refresh procedure: `docs/automation.md`.
- **Vite base paths**: each tool's `vite.config.ts` uses `defineToolConfig({ base: '/tools/<name>', ... })` via the shared factory in `tools/vite-tool-config.ts`.
- **Shared chrome, per-tool theme**: every tool renders the same `.site-header` / `.footer` markup, produced by `window.rfMountToolChrome(config)` (in `site/shared.js`) from a small per-tool config object in each tool's `public/shared.js`, styled by the shared `site/tool-chrome.css`, themed through a set of `--rf-*` CSS custom properties each tool defines.
- **Global pages**: static HTML in `site/` — no build step, just copy to dist.

## Shared Resource Architecture

### `site/shared.js` — runtime utilities
Served at `/shared.js` in dev and prod. Single source of truth for:
- `window.rfDonateLinks` — array of `[url, label]` donation links
- `window.rfDonateHtml()` — renders the "Support Restless Forge" donate block
- `window.rfNavSep` / `window.rfFooterSep` — `<span class="nav-sep">|</span>` / `<span class="footer-sep">|</span>` separators between tool and RF links
- `window.rfGlobalNavLinks` / `window.rfGlobalFooterLinks` — the Restless Forge / All Tools (nav) and Privacy / Terms / Restless Forge / All Tools (footer) tails every tool appends after its own links
- `window.rfMountToolChrome(config)` — the shared tool header/footer engine. Every `tools/<name>/frontend/public/shared.js` calls this once with `{ base, idPrefix, brand, navLinks, footerLinks, copyrightHtml, extraSupportLinks? }` — `navLinks`/`footerLinks` are tool-specific only (the engine appends the global tails), and `extraSupportLinks` lets a tool prepend its own support link (e.g. SandPath's Ko-fi shop) before the shared Substack/Ko-fi/Buy Me a Coffee links. Returns `{ header, footer }` render functions and wires the `<div id="<prefix>-header">`/`<div id="<prefix>-footer">` DOMContentLoaded injection.
- `window.rfFriendLinks` (`[url, name, desc]`) + `window.rfRenderFriends(id)` — the curated "Sites I Like" recommendations. Single data source; `rfRenderFriends` renders the list onto the `/sites-i-like` page's `<div id="rf-friends">` (pre-rendered statically by `sync-static`, re-run at runtime — same pattern as `rfRenderTools`). Linked from the site footer only (`footerNav`), not the top nav.

Every tool page loads `/shared.js` first, then the tool's own `public/shared.js` (which must call `rfMountToolChrome`, not hand-roll header/footer HTML).

### `site/tool-chrome.css` — shared header/footer CSS
Served at `/tool-chrome.css`. Owns all `.site-header*`, `.nav-toggle`,
`.site-header__support*`, `.footer__donate*`, `.footer__link*`, `.nav-sep`,
`.footer-sep` styles and the `@media (max-width: 640px)` collapsing behavior.

Tools opt in by:
1. `<link rel="stylesheet" href="/tool-chrome.css">` on every HTML page.
2. Defining the 7 `--rf-*` tokens in `:root` (in both `src/styles.css` and
   `public/pages.css`): `--rf-bg`, `--rf-text`, `--rf-muted`, `--rf-dim`,
   `--rf-accent`, `--rf-border`, `--rf-font-mono`. Alias them to the tool's
   own theme tokens.
3. Emitting `.site-header` markup from `public/shared.js` (header with brand,
   `.nav-toggle` button, `.site-header__nav`, and `.site-header__support`).

The dev middleware in `tools/vite-tool-config.ts` serves both files at their
domain-root URLs; `build.sh` cache-busts them across every HTML file in dist.

### Canonical favicon + manifest block

Every HTML page renders the same 4-tag block in `<head>`. The URLs differ
by scope, but the **shape** is invariant:

| Scope | Block |
|---|---|
| Site-global (`site/*.html`) | `/favicon.svg`, `/favicon.ico`, `/apple-touch-icon.png`, `/site.webmanifest` |
| Tool (`tools/<name>/.../index.html`, main + sub-pages) | `/tools/<name>/favicon.svg`, `/tools/<name>/favicon.ico`, `/tools/<name>/apple-touch-icon.png`, `/tools/<name>/site.webmanifest` |

```html
<link rel="icon" type="image/svg+xml" href=".../favicon.svg">
<link rel="icon" href=".../favicon.ico" sizes="any">
<link rel="apple-touch-icon" href=".../apple-touch-icon.png">
<link rel="manifest" href=".../site.webmanifest">
```

Why these four:
- **SVG**: scalable, modern browsers (overrides the .ico when both load).
- **ICO**: legacy fallback (`sizes="any"` lets browsers pick from the multi-size container).
- **apple-touch-icon**: 180×180 PNG for iOS home screen (no `sizes` attribute — iOS ignores it and modern SEO checks flag it).
- **manifest**: the PWA / Android home-screen description, replacing the deprecated inline Android `<link>` tags.

Source HTML hard-codes the scope-specific URL — no build-time path
rewriting. This matches the same convention already used for
`/tools/<name>/pages.css`, `/tools/<name>/shared.js`, og:image, and
canonical URL.

**Fallback to site root.** Tools may **omit** any of these five
fallback-eligible assets (`favicon.svg`, `favicon.ico`,
`apple-touch-icon.png`, `site.webmanifest`, `og-image.png`). When a
request for `/tools/<name>/<asset>` doesn't find a tool-specific file,
nginx (in prod, via the `try_files $uri /$1 =404;` regex location in
`nginx/restless-forge.conf`) and the Vite dev middleware (in local
dev, in `tools/vite-tool-config.ts`) both serve the corresponding
file from the domain root instead. Tools opt into per-brand artwork
by adding files to `public/`; the site-wide RF defaults cover any
gaps automatically.

The two URLs that stay at the domain root on every page are
`/shared.js` and `/tool-chrome.css` (site-global utilities; preserved
through Vite's base-path rewrite by the sentinel plugin pair in
`tools/vite-tool-config.ts`).

### og:image policy

Every HTML page must have `<meta property="og:image" content="...">` with
an absolute URL:
- Site-global pages → `https://restless-forge.dev/og-image.png`
- Tool pages → `https://restless-forge.dev/tools/<name>/og-image.png`

Each scope (site/ + every tool/public/) owns one `og-image.png`
(1200×630 recommended). Sub-pages inherit the same image as the tool's
main page.

### How Vite base-path transformation is worked around

Vite rewrites absolute URLs in HTML against `base`, which would turn
`<script src="/shared.js">` into `<script src="/tools/<name>/shared.js">` and
break cross-tool resource sharing. A pre/post `transformIndexHtml` plugin pair
in `vite-tool-config.ts` sentinel-marks `/shared.js` and `/tool-chrome.css`
before Vite runs and restores them afterwards. Do **not** edit this without
also updating the build output checks.

## Development Workflow

### Everything at once

```bash
npm install          # (first time only)
npm run dev          # starts site proxy :8080 + all tool dev servers
npm test             # runs every tool's vitest suite
npm run build        # ./build.sh — compiles all tools into dist/
```

### Single tool in isolation

```bash
cd tools/<name>/frontend
npm install
npm run dev
```

### Port allocation

| Service                | Port | Started by                        |
|------------------------|------|-----------------------------------|
| Site proxy (serves `site/`, proxies `/tools/*`) | 8080 | `npm run dev` from repo root |
| What Is My Time Worth  | 3000 | `dev:wimtw` or root `dev`         |
| HoloPath               | 5173 | `dev:holopath` or root `dev`      |
| SandPath               | 5174 | `dev:sandpath` or root `dev`      |
| Backend API (cloud-assisted tools) | 8000 | manually: `cd backend && uvicorn main:app --reload` — both dev servers proxy `/api` to it |
| New tools              | next free ≥5199 | declared in the tool's own vite.config.ts — discovery handles the rest |

Global links like `/about`, `/tools/` resolve correctly at the root proxy
(:8080) but NOT when running a single tool's dev server (it doesn't serve
those paths). Test global navigation via the root proxy only.

### Adding a new tool

The scaffolder copies `tools/template/`, substitutes placeholders, and runs
`npm install`:

```bash
scripts/new-tool.sh <tool-name> "<tool-label>" <prefix> <port> <emoji>
# example:
scripts/new-tool.sh tattoo-safe "TattooSafe" ts 5175 "🛡️"
```

build.sh, the root dev/test scripts, and the root vite proxy all
DISCOVER tools automatically from `tools/*/frontend/` (ports and base
paths are read from each tool's `vite.config.ts` by
`scripts/tools.mjs`). Launching a finished tool (directory status flip
+ blurb, noindex removal, ads, `npm run sync`) follows the canonical
checklist in `docs/launching-a-tool.md` — sync regenerates the sitemap,
llms.txt, grids, and the about/terms/FAQ tool copy automatically.

### Generated HTML (never hand-edit; `npm run sync` regenerates both)

Two generators emit checked-in, marker-bounded HTML; CI regenerates
and fails on drift:

1. **Chrome + site metadata** — `scripts/sync-static-html.mjs`
   (`npm run sync-static`): the global nav/footer and the tools grids
   on `/` and `/tools/` are JS-injected at runtime, but each
   placeholder div also carries a static pre-rendered copy for
   crawlers, emitted by running the REAL renderers from
   `site/shared.js` + `site/tools-data.js` in a sandbox. The same run
   generates **`site/sitemap.xml`** (site pages must have a rule in the
   script — it fails on unknown pages; live-tool sub-pages are
   discovered, with legal/noindex pages excluded), **`/llms.txt`**, and
   the live-tool lists on `/about`, `/terms`, and the FAQ answer
   (visible + JSON-LD) from each live tool's `blurb`. Re-run after
   changing nav links, footer links, tool directory data, or launching
   a tool.
2. **Prose** — `scripts/sync-content.mjs` (`npm run sync-content`):
   page copy lives in sibling Markdown files (`X.md` next to `X.html`)
   and renders into `generated:content` blocks; essay shells are
   auto-created from front-matter and the essays index cards
   regenerate. Full conventions: `docs/authoring-content.md`.
   `marked` is a **build-time root devDependency** (allowed — nothing
   ships to the browser; the runtime no-dependency rule is unchanged).

### Adding an essay

1. Write `site/essays/your-slug.md` with front-matter (`title`,
   `description`, `date`, `author`) and a body starting with `# Title`.
2. `npm run sync` — the HTML shell (metas, OG, JSON-LD Article) is
   auto-created, the essays index cards regenerate, and sitemap.xml +
   llms.txt pick up the new essay.

Full authoring conventions (tool articles, raw-HTML blocks, byline
rules): `docs/authoring-content.md`.

## Build System

- **Tools**: TypeScript → `tsc` → Vite build → `tools/<name>/frontend/dist/`.
- **Global pages**: static files in `site/` — no compilation.
- **Assembly**: `build.sh` copies `site/*` + each tool's `dist/*` into top-level `dist/`.
- **Cache-busting**: `build.sh` computes md5 hashes and injects `?v=<hash>` on
  `/shared.js`, `/tool-chrome.css`, each tool's `shared.js`, and each tool's
  `pages.css` across every HTML file. Nginx serves these with a 1-year
  `immutable` cache, so the query-string bust is what invalidates them after
  a deploy. `bust_cache` gracefully skips missing files (e.g. a single-page
  tool that has no `pages.css`).

## URL Routing

| URL Pattern | Source |
|---|---|
| `/` | `site/index.html` |
| `/shared.js` | `site/shared.js` |
| `/tool-chrome.css` | `site/tool-chrome.css` |
| `/about`, `/contact`, `/privacy`, `/terms`, `/faq`, `/sites-i-like` | `site/<page>.html` (nginx try_files) |
| `/tools/` | `site/tools/index.html` |
| `/tools/<name>/` | `tools/<name>/frontend/dist/` |
| `/essays/*` | `site/essays/*.html` |
| `/articles/` | `site/articles/index.html` |
| `/api/*` | FastAPI service on 127.0.0.1:8000 (nginx `^~ /api/` proxy; `backend/`) |

## Code Conventions

- TypeScript strict mode. No runtime npm dependencies unless a tool
  genuinely can't work without one — each exception is documented here.
  Current exceptions: `pdf-lib` (pure-JS, MIT) in forgedoc, forgeinvoice,
  and forgeresume, because parsing/producing real PDFs is not
  hand-rollable. Vite bundles it per tool; nothing is fetched at runtime.
- Vanilla DOM manipulation (no React/Vue/Angular).
- CSS custom properties for theming.
- BEM-like class naming (`.block__element--modifier`).
- Semantic HTML with ARIA attributes.
- Placeholder IDs follow `<prefix>-header` / `<prefix>-footer` where `<prefix>`
  is the tool's JS identifier (wimtw, hp, sp).

## Common Tasks

### Update global nav/footer links
- Global site pages: `site/shared.js`.
- Per-tool headers/footers: `tools/<name>/frontend/public/shared.js` — each
  defines its own `navLinks` / `footerLinks` arrays.

### Update donation links
Edit `window.rfDonateLinks` in `site/shared.js` — the single source of truth.
All tool footers read from it via `window.rfDonateHtml()`.

### Update AdSense publisher ID
Search for `ca-pub-5516736042033534` across all HTML files.

### Update copyright year
Search for `© 2026` across all HTML files.

### Fix a tool-specific bug
Work in the tool's own `frontend/` directory. Its dev server is self-contained.

### Deploy changes

**Normal path: merge to main.** The `Deploy` GitHub Action
(`.github/workflows/deploy.yml`) builds and rsyncs `dist/` to the VPS on
every push to main, deploys the backend (`backend/` →
`/opt/restless-forge/backend`, venv refresh, systemd restart, health
check — see `docs/backend.md`), then deploys `nginx/restless-forge.conf`
to `/etc/nginx/sites-available/restless-forge` (the live vhost has no
`.conf` suffix) with an `nginx -t` check, graceful reload, and automatic
rollback if validation fails. Requires the `DEPLOY_*` and
`ANTHROPIC_API_KEY` repo secrets documented in the workflow file. PRs run
the `CI` workflow (build + all tests, Node and Python) first.
The old-domain redirect vhosts (`nginx/*-redirect.conf`) are NOT deployed
automatically — install those by hand.

Manual fallback:
```bash
./build.sh
sudo cp -r dist/* /var/www/restless-forge/
sudo cp nginx/restless-forge.conf /etc/nginx/sites-available/restless-forge
sudo nginx -t && sudo systemctl reload nginx   # only needed for nginx config changes
```

## Where to look when things break

| Symptom | First place to check |
|---|---|
| Favicon doesn't show / wrong logo on a tool | Source HTML hard-codes `/tools/<name>/favicon.svg` etc. If the tool's `public/` lacks the file, the fallback (nginx regex in prod, Vite middleware in dev) serves the site-root default — add the file to the tool's `public/` to override. |
| OG image missing on link previews | Every HTML page must have `<meta property="og:image">` with an absolute URL (`https://restless-forge.dev/...`). Each scope ships one `og-image.png`. |
| Header/footer not rendering on a tool | Tool's `public/shared.js` — is it running? Is `<div id="<prefix>-header">` in the HTML? Is `/shared.js` loading (check Network)? |
| Header renders but styling is wrong | Tool's `:root` — does it define all 7 `--rf-*` tokens? Is `<link href="/tool-chrome.css">` present? |
| `/shared.js` returns the wrong content in dev | `tools/vite-tool-config.ts` — `configureServer` middleware serves it from `site/shared.js` |
| Built HTML points at `/tools/<name>/shared.js` where it should be `/shared.js` | Sentinel plugins in `tools/vite-tool-config.ts` — verify the SITE_GLOBAL_URLS list includes the URL |
| Sub-page 404s in dev | Sub-page HTML must live under `src/`, not `public/`. Vite MPA only routes files in `src/` |
| Old CSS/JS after deploy | Cache-busting in `build.sh` — did the md5 hash change in the build output? |
| New tool builds locally but 404s in prod | nginx config + dist assembly in `build.sh` |
| Site down / cert expiring / stale assets in prod | `site-health` issues from `.github/workflows/health-check.yml`; server runbook in `docs/infrastructure.md` (Cloudflare edge, DNS-01 cert renewal, disaster recovery) |
| `/api/*` down or erroring | `systemctl status restless-forge-api` + `journalctl -u restless-forge-api` on the droplet; backend runbook in `docs/backend.md` (cost caps, circuit breaker, key rotation) |

## Gotchas

- **Vite base paths matter**: always configure via `defineToolConfig()`. Don't
  hand-roll base paths — the sentinel plugins and MPA config depend on the
  factory.
- **`appType: 'mpa'` is baked into the factory**: sub-pages only work if the
  tool uses `defineToolConfig()`.
- **HTML pages belong in `src/`, NOT `public/`** — Vite MPA only routes files
  in `src/`. `public/` is static assets.
- **Load order matters**: `/shared.js` must load before the tool's
  `public/shared.js` or `window.rfDonateHtml` will be undefined.
- **Old domain redirects**: keep SSL certs renewed for holopath.art,
  sandpath.art, whatismytimeworth.app as long as 301 redirects are active.
- **Essays are real content**: `site/essays/` holds published essays
  (global philosophy / meta-project pieces only — tool-specific articles
  live with their tool). Never re-add "coming soon" stub pages; thin
  indexed content is an AdSense liability.
