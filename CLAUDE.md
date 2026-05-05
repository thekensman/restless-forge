# CLAUDE.md — Restless Forge

AI assistant guide for the Restless Forge monorepo.

## What This Is

Restless Forge is a single-domain hub (restless-forge.dev) for free,
browser-only tools. Every tool runs 100% client-side — there are no backends.

Currently live:
1. **What Is My Time Worth?** — Real hourly wage calculator (formerly whatismytimeworth.app)
2. **HoloPath** — Hologram GIF generator (formerly holopath.art)
3. **SandPath** — Image/SVG to sand table converter (formerly sandpath.art)

Global support pages (about, contact, privacy, terms, FAQ, essays, articles) live at the domain root.

## Repository Layout

```
restless-forge/
├── site/                → Static HTML/CSS for global pages (landing, about, privacy, ...)
│   ├── shared.js        → `rf*` utilities (donate links, nav/footer separators)
│   └── tool-chrome.css  → Shared .site-header / .footer styles for every tool
├── tools/
│   ├── template/frontend/    → Turnkey scaffold (copy via scripts/new-tool.sh)
│   ├── what-is-my-time-worth/frontend/
│   ├── holopath/frontend/
│   └── sandpath/frontend/
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
- **Client-only**: no backends. If a tool needs heavy computation, it runs in the browser (Canvas, Workers, Wasm, etc.).
- **Vite base paths**: each tool's `vite.config.ts` uses `defineToolConfig({ base: '/tools/<name>', ... })` via the shared factory in `tools/vite-tool-config.ts`.
- **Shared chrome, per-tool theme**: every tool renders the same `.site-header` / `.footer` markup (from `public/shared.js`), styled by the shared `site/tool-chrome.css`, themed through a set of `--rf-*` CSS custom properties each tool defines.
- **Global pages**: static HTML in `site/` — no build step, just copy to dist.

## Shared Resource Architecture

### `site/shared.js` — runtime utilities
Served at `/shared.js` in dev and prod. Single source of truth for:
- `window.rfDonateLinks` — array of `[url, label]` donation links
- `window.rfDonateHtml()` — renders the "Support Restless Forge" donate block
- `window.rfNavSep` — `<span class="nav-sep">|</span>` between tool and RF nav links
- `window.rfFooterSep` — `<span class="footer-sep">|</span>` for footer separators

Every tool page loads `/shared.js` first, then the tool's own `public/shared.js`.

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

Every HTML page (site-global + every tool, every sub-page) renders the same
4-tag block in `<head>`:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
```

Why these four:
- **SVG**: scalable, modern browsers (overrides the .ico when both load).
- **ICO**: legacy fallback (`sizes="any"` lets browsers pick from the multi-size container).
- **apple-touch-icon**: 180×180 PNG for iOS home screen (no `sizes` attribute — iOS ignores it and modern SEO checks flag it).
- **manifest**: the PWA / Android home-screen description, replacing the deprecated inline Android `<link>` tags.

Vite's base-path rewrite means each tool serves these from its own
`public/` (so each tool keeps its brand color); global pages serve them
from `site/` at the domain root. The block itself is identical across
every page — DO NOT edit it per-page.

Each scope (site root + every tool's `public/`) ships these four files:
`favicon.svg`, `favicon.ico`, `apple-touch-icon.png` (180×180),
`site.webmanifest`. Missing files should be added to that scope's
directory; do NOT switch the `<link>` tag URL to point at another
scope's file.

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
| Next new tool          | 5175 | `dev:<prefix>` or root `dev`      |

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

After running it, do the listed manual steps (build.sh entry, root
package.json dev script, root vite proxy, sitemap, tool hub cards). The
scaffolder prints the exact commands you need.

### Adding an essay

1. Create `site/essays/your-slug.html` using an existing essay as a template.
2. Add a card to `site/essays/index.html`.
3. Add the URL to `site/sitemap.xml`.
4. Ensure it has: title, meta description, OG tags, canonical URL, JSON-LD Article schema.

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
| `/about`, `/contact`, `/privacy`, `/terms`, `/faq` | `site/<page>.html` (nginx try_files) |
| `/tools/` | `site/tools/index.html` |
| `/tools/<name>/` | `tools/<name>/frontend/dist/` |
| `/essays/*` | `site/essays/*.html` |
| `/articles/` | `site/articles/index.html` |

## Code Conventions

- TypeScript strict mode, no runtime npm dependencies.
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
```bash
./build.sh
sudo cp -r dist/* /var/www/restless-forge/
sudo nginx -t && sudo systemctl reload nginx
```

## Where to look when things break

| Symptom | First place to check |
|---|---|
| Favicon doesn't show / wrong logo at root | Each scope owns its own `favicon.svg` / `.ico` / `apple-touch-icon.png` / `site.webmanifest` in `public/` (or `site/` for global). Vite rewrites `/favicon.svg` to the tool's path; do not hand-edit URLs. |
| OG image missing on link previews | Every HTML page must have `<meta property="og:image">` with an absolute URL (`https://restless-forge.dev/...`). Each scope ships one `og-image.png`. |
| Header/footer not rendering on a tool | Tool's `public/shared.js` — is it running? Is `<div id="<prefix>-header">` in the HTML? Is `/shared.js` loading (check Network)? |
| Header renders but styling is wrong | Tool's `:root` — does it define all 7 `--rf-*` tokens? Is `<link href="/tool-chrome.css">` present? |
| `/shared.js` returns the wrong content in dev | `tools/vite-tool-config.ts` — `configureServer` middleware serves it from `site/shared.js` |
| Built HTML points at `/tools/<name>/shared.js` where it should be `/shared.js` | Sentinel plugins in `tools/vite-tool-config.ts` — verify the SITE_GLOBAL_URLS list includes the URL |
| Sub-page 404s in dev | Sub-page HTML must live under `src/`, not `public/`. Vite MPA only routes files in `src/` |
| Old CSS/JS after deploy | Cache-busting in `build.sh` — did the md5 hash change in the build output? |
| New tool builds locally but 404s in prod | nginx config + dist assembly in `build.sh` |

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
- **Essays are placeholders**: the 3 essay files under `site/essays/` contain
  stub content and need real essays before AdSense approval.
