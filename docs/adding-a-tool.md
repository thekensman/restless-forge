# Adding a New Tool to Restless Forge

This guide walks through integrating a new Vite + TypeScript tool into the monorepo, following the same conventions as WIMTW and HoloPath.

## Quick reference — placeholders used in this guide

| Placeholder     | Example                  | Meaning                                |
|-----------------|--------------------------|----------------------------------------|
| `TOOL_NAME`     | `my-tool`                | Directory name under `tools/` and URL slug |
| `TOOL_LABEL`    | `My Tool`                | Human-readable display name            |
| `TOOL_PREFIX`   | `mt`                     | Short JS/HTML identifier for functions/IDs |
| `TOOL_EMOJI`    | `🔧`                     | Emoji shown in the header brand        |
| `PORT`          | `5175`                   | Unique dev server port (see below)     |

**Ports in use:** WIMTW=3000, HoloPath=5173, SandPath=5174. Pick the next available.

---

## Step 1 — Copy the template

```bash
cp -r tools/template/frontend tools/TOOL_NAME/frontend
```

Then do a global find-and-replace inside that directory:

```bash
cd tools/TOOL_NAME/frontend
# Replace all placeholders (adjust values as needed)
grep -rl 'TOOL_NAME'   . | xargs sed -i 's|TOOL_NAME|my-tool|g'
grep -rl 'TOOL_LABEL'  . | xargs sed -i 's|TOOL_LABEL|My Tool|g'
grep -rl 'TOOL_PREFIX' . | xargs sed -i 's|TOOL_PREFIX|mt|g'
grep -rl 'TOOL_EMOJI'  . | xargs sed -i 's|TOOL_EMOJI|🔧|g'
grep -rl 'PORT'        . | xargs sed -i 's|PORT|5175|g'
```

---

## Step 2 — Add sub-pages

Copy the `src/about/index.html` template for each sub-page you need:

```
src/
├── index.html              ← TypeScript SPA — Vite bundles this
├── about/index.html        ← Static sub-page — copied as-is by build.sh
├── faq/index.html
├── contact/index.html
├── privacy/index.html      ← Optional: link to /privacy instead
├── terms/index.html        ← Optional: link to /terms instead
└── articles/
    ├── index.html
    └── my-article/index.html
```

Every sub-page follows the same pattern:

```html
<link rel="stylesheet" href="/tools/TOOL_NAME/pages.css">
<script src="/shared.js"></script>
<script src="/tools/TOOL_NAME/shared.js"></script>
...
<div id="TOOL_PREFIX-header"></div>
<main><!-- page content --></main>
<div id="TOOL_PREFIX-footer"></div>
```

**Why absolute URLs?** Sub-page HTML is served raw (not Vite-processed) because it contains non-module IIFE scripts and CSS from `public/` that Vite can't bundle. Absolute URLs like `/tools/TOOL_NAME/shared.js` are resolved correctly by the dev server and nginx in production.

---

## Step 3 — Add static assets to `public/`

```
public/
├── shared.js       ← Tool nav/footer (already created by template)
├── pages.css       ← Sub-page styles (copy from WIMTW or HoloPath and adapt)
├── favicon-32.png
├── apple-touch-icon.png
├── og-image.png
├── robots.txt
├── sitemap.xml
└── ads.txt
```

Copy `pages.css` from an existing tool as a starting point — it has all the shared header/footer/content styles. Customize colours and fonts with CSS custom properties.

---

## Step 4 — Update `public/shared.js`

The template `public/shared.js` is a working starting point. The key things to update:

1. **`navLinks` / `footerLinks`** — list the pages for your tool. Pages at `'/'` get a separator automatically.
2. **`window.TOOL_PREFIXHeader()`** — returns the full header HTML string.
3. **`window.TOOL_PREFIXFooter()`** — returns the full footer HTML string.
4. **`DOMContentLoaded`** — auto-injects into `<div id="TOOL_PREFIX-header">` and `<div id="TOOL_PREFIX-footer">`.

The `rf*` globals (`rfNavSep`, `rfFooterSep`, `rfDonateHtml`) come from `site/shared.js`, which is loaded first via `<script src="/shared.js">`.

---

## Step 5 — Update `build.sh`

Add two lines — one to build the tool, one to cache-bust it:

```bash
# In the "Build Vite tools" section:
echo "[N/7] Building My Tool..."
build_vite_tool "My Tool" "my-tool"

# In the "Cache-bust" section:
bust_cache "${DIST_DIR}/tools/my-tool" "/tools/my-tool"
```

The `build_vite_tool` function (already defined in `build.sh`) handles:
- `npm ci && npm run build`
- Copying Vite output (`dist/`) to `dist/tools/TOOL_NAME/`
- Copying sub-page HTML from `src/` (bypassing Vite bundling)

Also update the summary at the bottom of `build.sh` to mention your tool.

---

## Step 6 — Update the root dev server

In `vite.config.ts` (repo root), add a proxy entry:

```ts
proxy: {
  // ... existing entries ...
  "/tools/my-tool": {
    target: "http://localhost:PORT",
    changeOrigin: true,
    ws: true,
  },
},
```

In `package.json` (repo root), add your tool's dev server to the `dev` script:

```json
"dev": "concurrently ... \"npm run dev --prefix tools/my-tool/frontend\""
```

---

## Step 7 — Add to the site

1. **Tool card** — add a card to `site/index.html` (landing page) and `site/tools/index.html` (all-tools hub). Follow the existing card pattern.
2. **Sitemap** — add your tool's URLs to `site/sitemap.xml`.
3. **nginx** — if your tool needs API proxying, add a `location` block in `nginx/restless-forge.conf`.

---

## Step 8 — Initialize npm

```bash
cd tools/TOOL_NAME/frontend
npm init -y
npm install --save-dev vite typescript
```

Add to `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "type": "module"
}
```

Create `tsconfig.json` — copy from WIMTW or HoloPath and adjust as needed.

---

## Step 9 — Local development

```bash
# Run just this tool
cd tools/TOOL_NAME/frontend
npm run dev
# Visit http://localhost:PORT/tools/TOOL_NAME/

# Or run everything at once from the repo root
npm run dev
# Visit http://localhost:8080/tools/TOOL_NAME/
```

Sub-pages (e.g. `/tools/TOOL_NAME/about/`) are served raw by the dev middleware in `vite-tool-config.ts` — no Vite transform, CSS and JS load via their absolute URLs.

---

## Checklist

- [ ] `tools/TOOL_NAME/frontend/vite.config.ts` — uses `defineToolConfig`, unique port
- [ ] `tools/TOOL_NAME/frontend/src/index.html` — TypeScript SPA, absolute shared.js URL
- [ ] `tools/TOOL_NAME/frontend/src/*/index.html` — sub-pages, absolute CSS/JS URLs, placeholder divs
- [ ] `tools/TOOL_NAME/frontend/public/shared.js` — nav/footer functions + DOMContentLoaded injection
- [ ] `tools/TOOL_NAME/frontend/public/pages.css` — sub-page styles
- [ ] `tools/TOOL_NAME/frontend/public/` — favicons, og-image.png, robots.txt, sitemap.xml
- [ ] `build.sh` — `build_vite_tool` call + `bust_cache` call
- [ ] `vite.config.ts` (root) — proxy entry for dev server
- [ ] `package.json` (root) — tool added to `dev` script
- [ ] `site/index.html` — tool card added
- [ ] `site/tools/index.html` — tool card added
- [ ] `site/sitemap.xml` — tool URLs added

---

## Architecture reference

```
tools/TOOL_NAME/frontend/
├── src/                     ← Vite root (MPA mode)
│   ├── index.html           ← Only Rollup entry — TypeScript SPA
│   ├── app.ts               ← TypeScript entry point
│   ├── styles.css           ← Main app styles (Vite-processed)
│   └── <page>/index.html   ← Sub-pages (static, NOT Rollup inputs)
└── public/                  ← Static assets (NOT navigable pages in dev)
    ├── shared.js            ← Tool nav/footer (IIFE, depends on /shared.js)
    ├── pages.css            ← Sub-page styles
    └── [favicons, og-image, robots.txt, sitemap.xml, ads.txt]
```

**Why sub-pages are NOT Rollup inputs:** Sub-pages use non-module IIFE scripts
(`<script src="/shared.js">`) and `public/`-relative CSS. Vite's HTML transform
can't handle either, producing build warnings. Instead, sub-pages are copied
verbatim by `build.sh` after the Vite build. The dev server serves them raw via
the middleware in `tools/vite-tool-config.ts`.

**Script load order matters:** `/shared.js` (site-level globals) must load before
the tool's `shared.js` (which calls `window.rfDonateHtml`, `window.rfNavSep`, etc.).
