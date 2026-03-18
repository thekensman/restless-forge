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

# ── Build What Is My Time Worth ──
echo "[3/7] Building What Is My Time Worth..."
cd "${SCRIPT_DIR}/tools/what-is-my-time-worth/frontend"
npm ci --silent
npm run build
mkdir -p "${DIST_DIR}/tools/what-is-my-time-worth"
cp -r dist/* "${DIST_DIR}/tools/what-is-my-time-worth/"
echo "  → What Is My Time Worth built successfully"

# ── Build HoloPath ──
echo "[4/7] Building HoloPath..."
cd "${SCRIPT_DIR}/tools/holopath/frontend"
npm ci --silent
npm run build
mkdir -p "${DIST_DIR}/tools/holopath"
cp -r dist/* "${DIST_DIR}/tools/holopath/"
echo "  → HoloPath built successfully"

# ── Build SandPath ──
echo "[5/7] Building SandPath..."
cd "${SCRIPT_DIR}/tools/sandpath/frontend"
npm ci --silent
npm run build
mkdir -p "${DIST_DIR}/tools/sandpath"
cp -r dist/* "${DIST_DIR}/tools/sandpath/"
cd "${SCRIPT_DIR}/tools/sandpath/"
cp -r ${SCRIPT_DIR}/tools/sandpath/backend "${DIST_DIR}/tools/sandpath/backend"
echo "  → SandPath built successfully"

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
