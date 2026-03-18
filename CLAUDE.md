# CLAUDE.md — Restless Forge

AI assistant guide for the Restless Forge monorepo.

## What This Is

Restless Forge consolidates three tool-based websites into a single domain (restless-forge.dev):

1. **What Is My Time Worth?** — Real hourly wage calculator (formerly whatismytimeworth.app)
2. **HoloPath** — Hologram GIF generator (formerly holopath.art)
3. **SandPath** — Image/SVG to sand table converter (formerly sandpath.art)

Global support pages (about, contact, privacy, terms, FAQ, essays, articles) live at the domain root.

## Repository Layout

```
restless-forge/
├── site/           → Static HTML/CSS for global pages (landing, about, privacy, etc.)
│   └── shared.js   → Global nav/footer + rf* shared utilities for all tool pages
├── tools/          → Tool source code (each has its own frontend/ directory)
│   ├── what-is-my-time-worth/frontend/  → Vite + TS, base: /tools/what-is-my-time-worth/
│   ├── holopath/frontend/               → Vite + TS, base: /tools/holopath/
│   └── sandpath/frontend/ + backend/    → Vite + TS + Python FastAPI
├── nginx/          → Production nginx configs (main site + 301 redirects)
├── build.sh        → Builds all tools → dist/
├── setup.sh        → Server setup script
└── dist/           → Build output (gitignored)
```

## Key Architecture Decisions

- **Monorepo**: All tool source + global pages in one repo for unified maintenance
- **Vite base paths**: Each tool's `vite.config.ts` sets `base: '/tools/[name]/'` so assets load from the correct subdirectory
- **Global pages**: Static HTML in `site/` — no build step, just copy to dist
- **Per-tool identity**: Each tool keeps its own CSS, fonts, and visual theme
- **Shared footer**: All tools link to global about/contact/privacy/terms and include the same donation footer
- **Shared components via JS**: Nav and footer are generated from `shared.js` files. `site/shared.js` is the global root that also exposes `rf*` utilities. Tool-specific `public/shared.js` files depend on it.
- **SandPath backend**: Python FastAPI proxied through nginx at `/api/`

## Shared Resource Architecture

`site/shared.js` (served at `/shared.js`) is the single source of truth for:
- `window.rfDonateLinks` — array of [url, label] donation links
- `window.rfDonateHtml()` — renders the standard "Support Restless Forge" donate block
- `window.rfNavSep` — `<span class="nav-sep">|</span>` separator between tool and RF nav links
- `window.rfFooterSep` — `<span class="footer-sep">|</span>` separator for footer
- `window.rfNav()` — global site navigation
- `window.rfFooter()` — global site footer

Every tool page (both main app and sub-pages) loads `/shared.js` first, then its own `shared.js`. This ensures the `rf*` globals are available when the tool's nav/footer functions run.

Vite dev servers each include a `configureServer` plugin that serves `site/shared.js` at `/shared.js` so local development works without nginx.

## Development Workflow

### Working on a specific tool

```bash
cd tools/holopath/frontend
npm install
npm run dev
```

Each tool runs on its own dev port (3000, 5173, 5174). Sub-pages (about, faq, etc.) are served correctly thanks to `appType: 'mpa'` in each tool's `vite.config.ts`. Global links like `/about` won't resolve in dev — that's expected; they work in production behind nginx.

### Building everything

```bash
./build.sh    # Runs npm ci + npm run build for each tool, copies to dist/
```

### Adding a new tool

1. Create `tools/new-tool/frontend/` with standard Vite + TS setup
2. Set `base: '/tools/new-tool/'` in `vite.config.ts`; also add `appType: 'mpa'`
3. Add the `/shared.js` dev plugin to `vite.config.ts`:
   ```ts
   import { readFileSync } from "fs";
   import { fileURLToPath } from "url";
   import { resolve, dirname } from "path";
   const __dirname = dirname(fileURLToPath(import.meta.url));
   const siteSharedJs = resolve(__dirname, "../../../site/shared.js");
   // In defineConfig server.plugins:
   { name: "serve-site-shared-js",
     configureServer(server) {
       server.middlewares.use("/shared.js", (_req, res) => {
         res.setHeader("Content-Type", "application/javascript");
         res.end(readFileSync(siteSharedJs, "utf-8"));
       });
     } }
   ```
4. In `src/index.html`, add `<script src="/shared.js"></script>` before the tool's own `<script src="shared.js"></script>`
5. Create `frontend/public/shared.js` with tool-specific nav/footer functions that use `window.rfDonateHtml()`, `window.rfNavSep`, and `window.rfFooterSep`
6. In every static HTML file under `frontend/public/`, add `<script src="/shared.js"></script>` before the tool's shared.js include
7. Add build step in `build.sh` (copy pattern from WIMTW or HoloPath)
8. Add `bust_cache "${DIST_DIR}/tools/new-tool" "/tools/new-tool"` in build.sh cache-bust section
9. Add tool card to `site/index.html` and `site/tools/index.html`
10. Add URL to `site/sitemap.xml`
11. Update nginx config if the tool needs API proxying

### Adding an essay

1. Create `site/essays/your-essay-slug.html` using existing essay as template
2. Add card to `site/essays/index.html`
3. Add URL to `site/sitemap.xml`
4. Ensure essay has: title, meta description, OG tags, canonical URL, JSON-LD Article schema

## Build System

- **Tools**: TypeScript → Vite build → `tools/[name]/frontend/dist/`
- **Global pages**: Static files in `site/` — no compilation
- **Assembly**: `build.sh` copies `site/*` + each tool's `dist/*` into top-level `dist/`
- **Cache-busting**: `build.sh` injects content-hash `?v=HASH` into HTML references for `shared.js`, `pages.css`, and the global `/shared.js` so stale cached files are never served after updates

## URL Routing

| URL Pattern | Source |
|---|---|
| `/` | `site/index.html` |
| `/shared.js` | `site/shared.js` (global shared utilities) |
| `/about` | `site/about.html` (nginx: try `$uri.html`) |
| `/contact` | `site/contact.html` |
| `/privacy` | `site/privacy.html` |
| `/terms` | `site/terms.html` |
| `/faq` | `site/faq.html` |
| `/tools/` | `site/tools/index.html` |
| `/tools/holopath/` | `tools/holopath/frontend/dist/` |
| `/tools/sandpath/` | `tools/sandpath/frontend/dist/` |
| `/tools/what-is-my-time-worth/` | `tools/what-is-my-time-worth/frontend/dist/` |
| `/essays/*` | `site/essays/*.html` |
| `/articles/` | `site/articles/index.html` |
| `/api/*` | Proxied to SandPath backend (port 8000) |

## Code Conventions

- TypeScript strict mode, no runtime npm dependencies
- Vanilla DOM manipulation (no React/Vue/Angular)
- CSS custom properties for theming (each tool has its own color scheme)
- BEM-like class naming (`.block__element--modifier`)
- Semantic HTML with ARIA attributes

## Testing

```bash
cd tools/holopath/frontend && npm test
cd tools/sandpath/frontend && npm test
cd tools/what-is-my-time-worth/frontend && npm test
cd tools/sandpath/backend && python run_tests.py
```

## Common Tasks

### Update global nav/footer links
Edit the shared.js file for the relevant context:
- **Global site pages**: `site/shared.js` — nav and footer for all pages in `site/`
- **WIMTW sub-pages**: `tools/what-is-my-time-worth/frontend/public/shared.js` — header and footer for about, faq, articles, contact, privacy, terms
- **HoloPath sub-pages**: `tools/holopath/frontend/public/shared.js` — nav, support banner, and footer for all pages in `public/`
- **Tool main apps** (Vite index.html): Each tool's `src/index.html` includes both `/shared.js` and its own `shared.js` — nav/footer logic lives in the tool's `public/shared.js`

### Update donation links
Edit `window.rfDonateLinks` in `site/shared.js` — this is the single source of truth. All tool footers use `window.rfDonateHtml()` which reads from this array.

### Update AdSense publisher ID
Search for `ca-pub-5516736042033534` across all HTML files.

### Update copyright year
Search for `© 2026` across all HTML files.

### Fix a tool-specific bug
Work in the tool's own `frontend/` directory. The tool's Vite dev server is self-contained.

### Deploy changes
```bash
./build.sh
sudo cp -r dist/* /var/www/restless-forge/
sudo nginx -t && sudo systemctl reload nginx
```

## Gotchas

- **Vite base paths matter**: If you reset a tool's `vite.config.ts`, re-add the `base` and `appType: 'mpa'` properties or sub-pages and assets won't work correctly
- **`appType: 'mpa'` required**: Without this, Vite's dev server falls back to serving the main SPA (`src/index.html`) for all routes, overriding static sub-pages in `public/`
- **Load order matters**: `/shared.js` must be loaded before a tool's `shared.js` or `window.rfDonateHtml` etc. will be undefined
- **SandPath needs its backend**: Unlike the other tools, SandPath has API calls to a Python backend on port 8000
- **nginx rate limiting**: The API has a 15 req/min limit per IP — adjust in `nginx/restless-forge.conf` if needed
- **Old domain redirects**: Keep SSL certs renewed for holopath.art, sandpath.art, whatismytimeworth.app as long as 301 redirects are active
- **Essays are placeholders**: The 3 essay files have placeholder content — Ken needs to write the actual essays for AdSense approval
