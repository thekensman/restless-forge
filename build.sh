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
echo "[1/6] Cleaning previous build..."
rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

# ── Copy global site pages ──
echo "[2/6] Copying global site pages..."
cp -r "${SCRIPT_DIR}/site/"* "${DIST_DIR}/"

# ── Build What Is My Time Worth ──
echo "[3/6] Building What Is My Time Worth..."
cd "${SCRIPT_DIR}/tools/what-is-my-time-worth/frontend"
npm ci --silent
npm run build
mkdir -p "${DIST_DIR}/tools/what-is-my-time-worth"
cp -r dist/* "${DIST_DIR}/tools/what-is-my-time-worth/"
echo "  → What Is My Time Worth built successfully"

# ── Build HoloPath ──
echo "[4/6] Building HoloPath..."
cd "${SCRIPT_DIR}/tools/holopath/frontend"
npm ci --silent
npm run build
mkdir -p "${DIST_DIR}/tools/holopath"
cp -r dist/* "${DIST_DIR}/tools/holopath/"
echo "  → HoloPath built successfully"

# ── Build SandPath ──
echo "[5/6] Building SandPath..."
cd "${SCRIPT_DIR}/tools/sandpath/frontend"
npm ci --silent
npm run build
mkdir -p "${DIST_DIR}/tools/sandpath"
cp -r dist/* "${DIST_DIR}/tools/sandpath/"
echo "  → SandPath built successfully"

# ── Summary ──
echo ""
echo "[6/6] Build complete!"
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
