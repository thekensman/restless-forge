#!/usr/bin/env bash
# ═══════════════════════════════════════════════════
# Restless Forge — Build Script
# Builds all tools and assembles the deployable site
# ═══════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="${SCRIPT_DIR}/dist"

echo "═══ Restless Forge Build ═══"
echo ""

# ── Clean previous build ──
echo "[1/7] Cleaning previous build..."
rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

# ── Copy global site pages ──
echo "[2/7] Copying global site pages..."
cp -r "${SCRIPT_DIR}/site/"* "${DIST_DIR}/"

# ─────────────────────────────────────────────────────────────────────────────
# build_vite_tool <label> <dir-name>
#
# Builds a standard Vite tool frontend (src/ + public/ convention) and copies
# the output into dist/tools/<dir-name>/.
#
# Convention expected in tools/<dir-name>/frontend/:
#   src/index.html          — TypeScript SPA entry (Vite-bundled)
#   src/<page>/index.html   — Static sub-pages (copied as-is, not bundled)
#   public/                 — Static assets (shared.js, pages.css, favicons…)
#   vite.config.ts          — Calls defineToolConfig() from tools/vite-tool-config.ts
#
# To add a new Vite tool: call this function with its label and directory name,
# then add a bust_cache call in the cache-busting section below.
# ─────────────────────────────────────────────────────────────────────────────
build_vite_tool() {
  local label="$1"
  local name="$2"   # directory name under tools/ and dist/tools/
  local frontend="${SCRIPT_DIR}/tools/${name}/frontend"

  cd "${frontend}"
  npm ci --silent
  npm run build

  mkdir -p "${DIST_DIR}/tools/${name}"
  cp -r dist/* "${DIST_DIR}/tools/${name}/"

  # Copy sub-page HTML directly — Vite only bundles src/index.html.
  # Sub-pages are static HTML (IIFE scripts, public/-relative CSS) and are
  # excluded from Rollup to avoid bundling warnings. Copy them verbatim here.
  find "${frontend}/src" -name "*.html" ! -path "*/src/index.html" \
    | while IFS= read -r f; do
        rel="${f#${frontend}/src/}"
        dest="${DIST_DIR}/tools/${name}/${rel}"
        mkdir -p "$(dirname "$dest")"
        cp "$f" "$dest"
      done

  echo "  → ${label} built successfully"
}

# ── Build Vite tools ──
echo "[3/7] Building What Is My Time Worth..."
build_vite_tool "What Is My Time Worth" "what-is-my-time-worth"

echo "[4/7] Building HoloPath..."
build_vite_tool "HoloPath" "holopath"

# ── Build SandPath ──
echo "[5/7] Building SandPath..."
build_vite_tool "SandPath" "sandpath"

# ── Cache-bust shared static files ──
# shared.js and pages.css have static filenames, so nginx's immutable
# 1-year cache would serve stale versions after updates. Inject a content
# hash into the HTML references so browsers re-fetch only when files change.
echo "[6/7] Cache-busting shared static files..."

bust_cache() {
  local dir="$1"
  local tool_path="$2"   # e.g. /tools/what-is-my-time-worth
  local js_hash css_hash
  js_hash=$(md5sum "${dir}/shared.js" | cut -c1-8)
  css_hash=$(md5sum "${dir}/pages.css" | cut -c1-8)
  find "${dir}" -name "*.html" -exec sed -i \
    -e "s|${tool_path}/shared\.js\"|${tool_path}/shared.js?v=${js_hash}\"|g" \
    -e "s|${tool_path}/pages\.css\"|${tool_path}/pages.css?v=${css_hash}\"|g" \
    {} \;
  echo "  → ${tool_path}: shared.js?v=${js_hash}  pages.css?v=${css_hash}"
}

bust_cache "${DIST_DIR}/tools/what-is-my-time-worth" "/tools/what-is-my-time-worth"
bust_cache "${DIST_DIR}/tools/holopath"               "/tools/holopath"
# Add a bust_cache call here for each new tool.

# Cache-bust the global /shared.js across ALL html files in dist
site_shared_hash=$(md5sum "${DIST_DIR}/shared.js" | cut -c1-8)
find "${DIST_DIR}" -name "*.html" -exec sed -i \
  -e "s|\"/shared\.js\"|\"/shared.js?v=${site_shared_hash}\"|g" \
  {} \;
echo "  → /shared.js?v=${site_shared_hash}"

# ── Summary ──
echo ""
echo "[7/7] Build complete!"
echo ""
echo "Deployable site at: ${DIST_DIR}/"
echo ""
echo "Directory structure:"
echo "  dist/"
echo "  ├── index.html              (landing page)"
echo "  ├── styles.css              (global styles)"
echo "  ├── about.html              (global about)"
echo "  ├── privacy.html            (global privacy)"
echo "  ├── terms.html              (global terms)"
echo "  ├── faq.html                (global FAQ)"
echo "  ├── sitemap.xml             (global sitemap)"
echo "  ├── robots.txt"
echo "  ├── ads.txt"
echo "  ├── tools/"
echo "  │   ├── index.html          (tools hub)"
echo "  │   ├── what-is-my-time-worth/"
echo "  │   ├── holopath/"
echo "  │   └── sandpath/"
echo "  ├── essays/"
echo "  └── articles/"
echo ""
echo "To deploy: copy dist/* to /var/www/restless-forge/"
echo "Then: sudo nginx -t && sudo systemctl reload nginx"
