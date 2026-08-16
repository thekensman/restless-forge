#!/usr/bin/env bash
# ═══════════════════════════════════════════════════
# Restless Forge — Build Script
# Builds all tools and assembles the deployable site
# ═══════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="${SCRIPT_DIR}/dist"

# ads.txt is fetched directly by ad-network crawlers as plain static text —
# no browser, no JS — so its publisher ID can't be runtime-resolved like the
# rest of the AdSense wiring (see window.rfAdsenseClientId in site/shared.js,
# which every page uses instead). Keep this value in sync with that constant.
RF_ADSENSE_PUB="pub-5516736042033534"

echo "═══ Restless Forge Build ═══"
echo ""

# ── Clean previous build ──
echo "[1/5] Cleaning previous build..."
rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

# ── Copy global site pages ──
echo "[2/5] Copying global site pages..."
cp -r "${SCRIPT_DIR}/site/"* "${DIST_DIR}/"
# Markdown content sources (rendered into the HTML by sync-content) are
# authoring files, not deployables.
find "${DIST_DIR}" -name '*.md' -delete

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
  # Sub-page source HTML uses explicit `/tools/<name>/...` URLs for every
  # tool-scoped resource (favicons, pages.css, shared.js), so no path
  # rewriting is needed at copy time.
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
# Convention-driven: every tools/<name>/frontend/ directory is built.
# Adding a new tool requires NO edit here — drop it in tools/ and it ships.
echo "[3/5] Building all tool frontends..."
for frontend in "${SCRIPT_DIR}"/tools/*/frontend; do
  name="$(basename "$(dirname "${frontend}")")"
  [ "${name}" = "template" ] && continue
  echo "  ── ${name} ──"
  build_vite_tool "${name}" "${name}"
done

# ── Cache-bust shared static files ──
# shared.js and pages.css have static filenames, so nginx's immutable
# 1-year cache would serve stale versions after updates. Inject a content
# hash into the HTML references so browsers re-fetch only when files change.
echo "[4/5] Cache-busting shared static files..."

bust_cache() {
  local dir="$1"
  local tool_path="$2"   # e.g. /tools/what-is-my-time-worth
  local js_hash=""
  local css_hash=""
  if [ -f "${dir}/shared.js" ]; then
    js_hash=$(md5sum "${dir}/shared.js" | cut -c1-8)
    find "${dir}" -name "*.html" -exec sed -i \
      -e "s|${tool_path}/shared\.js\"|${tool_path}/shared.js?v=${js_hash}\"|g" \
      {} \;
  fi
  if [ -f "${dir}/pages.css" ]; then
    css_hash=$(md5sum "${dir}/pages.css" | cut -c1-8)
    find "${dir}" -name "*.html" -exec sed -i \
      -e "s|${tool_path}/pages\.css\"|${tool_path}/pages.css?v=${css_hash}\"|g" \
      {} \;
  fi
  echo "  → ${tool_path}: shared.js?v=${js_hash:-<missing>}  pages.css?v=${css_hash:-<missing>}"
}

# Convention-driven: cache-bust every built tool.
for tool_dir in "${DIST_DIR}"/tools/*/; do
  name="$(basename "${tool_dir}")"
  [ -f "${tool_dir}index.html" ] || continue   # skip the hub index.html dir itself
  bust_cache "${DIST_DIR}/tools/${name}" "/tools/${name}"
done

# Cache-bust the global /tools-data.js across ALL html files in dist
if [ -f "${DIST_DIR}/tools-data.js" ]; then
  tools_data_hash=$(md5sum "${DIST_DIR}/tools-data.js" | cut -c1-8)
  find "${DIST_DIR}" -name "*.html" -exec sed -i \
    -e "s|\"/tools-data\.js\"|\"/tools-data.js?v=${tools_data_hash}\"|g" \
    {} \;
  echo "  → /tools-data.js?v=${tools_data_hash}"
fi

# Cache-bust the global /shared.js across ALL html files in dist
site_shared_hash=$(md5sum "${DIST_DIR}/shared.js" | cut -c1-8)
find "${DIST_DIR}" -name "*.html" -exec sed -i \
  -e "s|\"/shared\.js\"|\"/shared.js?v=${site_shared_hash}\"|g" \
  {} \;
echo "  → /shared.js?v=${site_shared_hash}"

# Cache-bust the global /styles.css across ALL html files in dist.
# This one was missed for a long time and the failure was ugly: nginx serves
# css as `immutable, max-age=1y` while HTML is `no-cache`, so returning
# visitors kept a year-old stylesheet against brand-new markup and the browser
# would not even revalidate. When the rail ads were added, phones with a
# cached pre-rail styles.css had no `.ad-rail { display: none }` rule, so two
# 600px ad containers rendered as ordinary blocks and pushed the article
# 1200px down the page behind a wall of black.
if [ -f "${DIST_DIR}/styles.css" ]; then
  site_styles_hash=$(md5sum "${DIST_DIR}/styles.css" | cut -c1-8)
  find "${DIST_DIR}" -name "*.html" -exec sed -i \
    -e "s|\"/styles\.css\"|\"/styles.css?v=${site_styles_hash}\"|g" \
    {} \;
  echo "  → /styles.css?v=${site_styles_hash}"
fi

# Cache-bust the shared /tool-chrome.css across ALL html files in dist
if [ -f "${DIST_DIR}/tool-chrome.css" ]; then
  site_chrome_hash=$(md5sum "${DIST_DIR}/tool-chrome.css" | cut -c1-8)
  find "${DIST_DIR}" -name "*.html" -exec sed -i \
    -e "s|\"/tool-chrome\.css\"|\"/tool-chrome.css?v=${site_chrome_hash}\"|g" \
    {} \;
  echo "  → /tool-chrome.css?v=${site_chrome_hash}"
fi

# ── Substitute the AdSense publisher ID into ads.txt ──
# Source ads.txt files carry the __RF_ADSENSE_PUB__ placeholder instead of
# the literal ID (see RF_ADSENSE_PUB above). Substitute it in, then fail the
# build loudly if anything was missed or the value looks wrong — a broken
# ads.txt fails silently in production otherwise.
find "${DIST_DIR}" -name "ads.txt" -exec sed -i \
  "s/__RF_ADSENSE_PUB__/${RF_ADSENSE_PUB}/g" {} \;

leftover=$(grep -rl "__RF_ADSENSE_PUB__" "${DIST_DIR}" || true)
if [ -n "${leftover}" ]; then
  echo "ERROR: __RF_ADSENSE_PUB__ placeholder left unsubstituted in:" >&2
  echo "${leftover}" >&2
  exit 1
fi
if [ "$(grep -rl "${RF_ADSENSE_PUB}" "${DIST_DIR}" --include=ads.txt | wc -l)" -eq 0 ]; then
  echo "ERROR: ads.txt substitution produced zero matches — check RF_ADSENSE_PUB." >&2
  exit 1
fi
echo "  → ads.txt: ${RF_ADSENSE_PUB}"

# ── Stamp <lastmod> into the deployed sitemap ──
# Build-time, not in sync-static-html.mjs: site/sitemap.xml is checked in and
# CI fails on drift, but a git-derived date changes the moment you commit the
# page it describes. Injecting into dist/ keeps the deployed sitemap accurate
# without making every content edit a red build. See the script header.
node "${SCRIPT_DIR}/scripts/inject-sitemap-lastmod.mjs"

# ── Summary ──
echo ""
echo "[5/5] Build complete!"
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
echo "  │   └── <one dir per tool>/"
echo "  ├── essays/"
echo "  └── articles/"
echo ""
echo "To deploy: copy dist/* to /var/www/restless-forge/"
echo "Then: sudo nginx -t && sudo systemctl reload nginx"
