# Adding a New Tool to Restless Forge

Every new tool follows the same recipe. The fast path uses
`scripts/new-tool.sh`; the manual path is here as a reference for when you
need to deviate.

## Fast path (one command + a few edits)

```bash
scripts/new-tool.sh <tool-name> "<tool-label>" <prefix> <port> "<emoji>"
# example:
scripts/new-tool.sh tattoo-safe "TattooSafe" ts 5175 "🛡️"
```

This copies `tools/template/frontend/` to `tools/<tool-name>/frontend/`,
replaces every placeholder, and runs `npm install`. build.sh, the root
dev/test scripts, and the root vite proxy discover the new tool
automatically — the only manual steps are:

1. **site/tools-data.js** — add the tool entry with `status: "soon"`;
   flip to `"live"` to publish (label, category, and description live
   ONLY there — both hub pages render from it).
2. **Remove `noindex`** — the template ships every HTML page with
   `<meta name="robots" content="noindex">` so unfinished tools that are
   deployed but unlisted don't get crawled as thin content. Delete that
   line from every page under `src/` when the tool launches.
3. **site/sitemap.xml** — add the tool URLs when it goes public.

After the edits, `npm run dev` from repo root will start your new tool on
the port you chose, proxied at `http://localhost:8080/tools/<tool-name>/`.

---

## Placeholder reference

The template uses distinctive `__TOKEN__` placeholders so a single find/
replace can't accidentally match surrounding text:

| Placeholder        | Example       | Meaning                                     |
|--------------------|---------------|---------------------------------------------|
| `__TOOL_NAME__`    | `tattoo-safe` | Directory name under `tools/` + URL slug    |
| `__TOOL_LABEL__`   | `TattooSafe`  | Display name (header brand, titles)         |
| `__TOOL_PREFIX__`  | `ts`          | Identifier prefix (placeholder IDs, JS fns) |
| `__TOOL_PORT__`    | `5175`        | Dev-server port (unique per tool)           |
| `__TOOL_EMOJI__`   | `🛡️`          | Small emoji/glyph in the header brand       |

**Ports in use:** WIMTW=3000, HoloPath=5173, SandPath=5174. Use 5175+
for new tools.

---

## Manual path (what the scaffolder does under the hood)

### 1. Copy the template

```bash
cp -r tools/template/frontend tools/<tool-name>/frontend
cd tools/<tool-name>/frontend

sed -i 's|__TOOL_NAME__|<tool-name>|g'  $(find . -type f)
sed -i 's|__TOOL_LABEL__|<tool-label>|g' $(find . -type f)
sed -i 's|__TOOL_PREFIX__|<prefix>|g'    $(find . -type f)
sed -i 's|__TOOL_PORT__|<port>|g'        $(find . -type f)
sed -i 's|__TOOL_EMOJI__|<emoji>|g'      $(find . -type f)

npm install
```

### 2. What comes with the template

```
frontend/
├── package.json              ← dev/build/test scripts, vite + vitest + jsdom
├── tsconfig.json             ← target ES2022, strict
├── vite.config.ts            ← calls defineToolConfig({ base, port, dir })
├── src/
│   ├── index.html            ← Main app, opts into /tool-chrome.css + /shared.js
│   ├── styles.css            ← :root defines --rf-* aliases + main-app styles
│   ├── app.ts                ← TS entry stub
│   └── about/index.html      ← Example static sub-page
└── public/
    ├── shared.js             ← .site-header / .footer renderer
    └── pages.css             ← :root defines --rf-* aliases + sub-page styles
```

### 3. Customize the theme

In both `src/styles.css` and `public/pages.css`, the `:root` block defines
your tool's native tokens (`--bg`, `--text`, `--accent`, etc.) AND a block
of `--rf-*` aliases used by the shared header/footer:

```css
:root {
  /* native tokens */
  --bg: #0b0d12;
  --text: #d8d4cc;
  --accent: #d4a44e;
  /* ... */

  /* aliases consumed by site/tool-chrome.css */
  --rf-bg: var(--bg);
  --rf-text: var(--text);
  --rf-muted: var(--text-muted);
  --rf-dim: var(--text-dim);
  --rf-accent: var(--accent);
  --rf-border: var(--border);
  --rf-font-mono: var(--font-mono);
}
```

All 7 aliases are required. Don't redefine `.site-header*`, `.nav-toggle`,
`.footer__donate*`, `.footer__link*`, `.nav-sep`, `.footer-sep`, or the
`@media (max-width: 640px)` collapse rule — `site/tool-chrome.css` owns them.

### 4. Add more sub-pages (optional)

Sub-pages live under `src/` using directory-style URLs:

```
src/
├── index.html
├── about/index.html
├── faq/index.html
├── contact/index.html
└── articles/
    ├── index.html
    └── my-first-article/index.html
```

Every sub-page HTML file must contain:

```html
<link rel="stylesheet" href="/tool-chrome.css">
<link rel="stylesheet" href="/tools/<tool-name>/pages.css">
<script src="/shared.js"></script>
<script src="/tools/<tool-name>/shared.js"></script>
...
<div id="<prefix>-header"></div>
<main>...</main>
<div id="<prefix>-footer"></div>
```

The absolute URLs are preserved through Vite's build via the sentinel
`transformIndexHtml` plugins in `tools/vite-tool-config.ts`.

### 5. Monorepo wiring — automatic

`build.sh`, root `npm run dev` / `npm test`, and the root vite proxy all
discover tools from `tools/*/frontend/` via `scripts/tools.mjs` (each
tool's port + base path are read from its own `vite.config.ts`). There is
nothing to edit at the repo root when adding or removing a tool.

### 6. Add to the site

- Add the tool entry to `site/tools-data.js` (the single source of truth
  for label/category/description/status — hub pages render from it).
- URLs in `site/sitemap.xml` when it goes public.

---

## Verification checklist

Run from repo root:

```bash
npm run dev           # should start all tools incl. the new one
npm run build         # should succeed without errors
```

Then open the built HTML:

```bash
grep -n "tool-chrome\|site-header\|shared.js" dist/tools/<tool-name>/index.html
# expect:
#   <link rel="stylesheet" href="/tool-chrome.css?v=HASH">
#   <script src="/shared.js?v=HASH">
#   <script src="/tools/<tool-name>/shared.js?v=HASH">
```

Visually verify at `http://localhost:8080/tools/<tool-name>/`:

- Header renders with your brand + nav + support strip.
- Narrow the window — nav collapses into a hamburger at ≤640px.
- Footer renders with donate block + legal links + copyright.
- Tool theme colors flow through to the header accent on hover.

If any of those fail, see "Where to look when things break" in `CLAUDE.md`.
