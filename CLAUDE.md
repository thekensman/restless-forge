# CLAUDE.md — Restless Forge

AI assistant guide for the Restless Forge monorepo.

## What This Is

Restless Forge consolidates three tool-based websites into a single domain (restless-forge.dev):

1. **What Is My Time Worth?** — Real hourly wage calculator (formerly whatismytimeworth.app)
2. **HoloPath** — Hologram GIF generator (formerly holopath.art)
3. **SandPath** — Image/SVG to sand table converter (formerly sandpath.art)

Global support pages (about, privacy, terms, FAQ, essays, articles) live at the domain root.

## Repository Layout

```
restless-forge/
├── site/           → Static HTML/CSS for global pages (landing, about, privacy, etc.)
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
- **Shared footer**: All tools link to global about/privacy/terms and include the same donation footer
- **SandPath backend**: Python FastAPI proxied through nginx at `/api/`

## Development Workflow

### Working on a specific tool

```bash
cd tools/holopath/frontend
npm install
npm run dev
```

Each tool runs on its own dev port (3000, 5173, 5174). During development, internal links like `/about` won't resolve — that's expected; they work in production behind nginx.

### Building everything

```bash
./build.sh    # Runs npm ci + npm run build for each tool, copies to dist/
```

### Adding a new tool

1. Create `tools/new-tool/frontend/` with standard Vite + TS setup
2. Set `base: '/tools/new-tool/'` in `vite.config.ts`
3. Add build step in `build.sh`
4. Add tool card to `site/index.html` and `site/tools/index.html`
5. Add URL to `site/sitemap.xml`
6. Update nginx config if the tool needs API proxying

### Adding an essay

1. Create `site/essays/your-essay-slug.html` using existing essay as template
2. Add card to `site/essays/index.html`
3. Add URL to `site/sitemap.xml`
4. Ensure essay has: title, meta description, OG tags, canonical URL, JSON-LD Article schema

## Build System

- **Tools**: TypeScript → Vite build → `tools/[name]/frontend/dist/`
- **Global pages**: Static files in `site/` — no compilation
- **Assembly**: `build.sh` copies `site/*` + each tool's `dist/*` into top-level `dist/`

## URL Routing

| URL Pattern | Source |
|---|---|
| `/` | `site/index.html` |
| `/about` | `site/about.html` (nginx: try `$uri.html`) |
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

### Update donation links
Edit the inline footer in each tool's `index.html` (search for "Support Restless Forge") and in `site/styles.css` / global page footers.

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

- **Vite base paths matter**: If you reset a tool's `vite.config.ts`, re-add the `base` property or assets won't load in production
- **SandPath needs its backend**: Unlike the other tools, SandPath has API calls to a Python backend on port 8000
- **nginx rate limiting**: The API has a 15 req/min limit per IP — adjust in `nginx/restless-forge.conf` if needed
- **Old domain redirects**: Keep SSL certs renewed for holopath.art, sandpath.art, whatismytimeworth.app as long as 301 redirects are active
- **Essays are placeholders**: The 3 essay files have placeholder content — Ken needs to write the actual essays for AdSense approval
