#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════
# Restless Forge — New Tool Scaffolder
#
# Usage: scripts/new-tool.sh <tool-name> <tool-label> <tool-prefix> <dev-port> <emoji>
#
# Example:
#   scripts/new-tool.sh tattoo-safe "TattooSafe" ts 5175 "🛡️"
#
# What this does:
#   1. Copies tools/template/frontend/ → tools/<tool-name>/frontend/
#   2. Replaces __TOOL_NAME__/__TOOL_LABEL__/__TOOL_PREFIX__/__TOOL_PORT__/__TOOL_EMOJI__
#   3. Runs npm install in the new tool
#   4. Prints the remaining manual steps (build.sh entry, nav cards, sitemap, etc.)
# ═══════════════════════════════════════════════════════
set -euo pipefail

if [ $# -ne 5 ]; then
  echo "Usage: $0 <tool-name> <tool-label> <tool-prefix> <dev-port> <emoji>"
  echo "Example: $0 tattoo-safe \"TattooSafe\" ts 5175 \"🛡️\""
  exit 1
fi

TOOL_NAME="$1"
TOOL_LABEL="$2"
TOOL_PREFIX="$3"
TOOL_PORT="$4"
TOOL_EMOJI="$5"

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${SCRIPT_DIR}/tools/template/frontend"
DST="${SCRIPT_DIR}/tools/${TOOL_NAME}/frontend"

if [ -d "${SCRIPT_DIR}/tools/${TOOL_NAME}" ]; then
  echo "ERROR: tools/${TOOL_NAME} already exists. Aborting."
  exit 1
fi

if ! [[ "${TOOL_PREFIX}" =~ ^[a-z][a-z0-9]*$ ]]; then
  echo "ERROR: tool-prefix must be lowercase letters/digits, starting with a letter."
  echo "       Got: ${TOOL_PREFIX}"
  exit 1
fi

if ! [[ "${TOOL_PORT}" =~ ^[0-9]+$ ]]; then
  echo "ERROR: dev-port must be a number. Got: ${TOOL_PORT}"
  exit 1
fi

echo "═══ Scaffolding tools/${TOOL_NAME}/ ═══"
echo "  name:   ${TOOL_NAME}"
echo "  label:  ${TOOL_LABEL}"
echo "  prefix: ${TOOL_PREFIX}"
echo "  port:   ${TOOL_PORT}"
echo "  emoji:  ${TOOL_EMOJI}"
echo ""

# Copy template
mkdir -p "$(dirname "${DST}")"
cp -r "${SRC}" "${DST}"

# Substitute placeholders in every file under the new tool
find "${DST}" -type f \( -name "*.ts" -o -name "*.js" -o -name "*.html" -o -name "*.css" -o -name "*.json" \) -print0 |
  while IFS= read -r -d '' f; do
    sed -i \
      -e "s|__TOOL_NAME__|${TOOL_NAME}|g" \
      -e "s|__TOOL_LABEL__|${TOOL_LABEL}|g" \
      -e "s|__TOOL_PREFIX__|${TOOL_PREFIX}|g" \
      -e "s|__TOOL_PORT__|${TOOL_PORT}|g" \
      -e "s|__TOOL_EMOJI__|${TOOL_EMOJI}|g" \
      "$f"
  done

# Install dependencies
echo "[install] running npm install in ${DST}"
(cd "${DST}" && npm install --silent)

cat <<EOF

✓ tools/${TOOL_NAME}/frontend/ created and installed.

Manual steps remaining (no safe way to automate without breaking something):

  1. Add the build step to build.sh (near the other build_vite_tool calls):
       build_vite_tool "${TOOL_LABEL}" "${TOOL_NAME}"
     and a bust_cache call below:
       bust_cache "\${DIST_DIR}/tools/${TOOL_NAME}" "/tools/${TOOL_NAME}"

  2. Add to the root package.json "dev" concurrently list and create a dev:${TOOL_PREFIX} alias:
       "dev:${TOOL_PREFIX}": "npm run dev --prefix tools/${TOOL_NAME}/frontend"

  3. Add a proxy entry to the root vite.config.ts:
       "/tools/${TOOL_NAME}": { target: "http://localhost:${TOOL_PORT}", changeOrigin: true, ws: true }

  4. Add a tool card to site/index.html and site/tools/index.html.

  5. Add URLs to site/sitemap.xml.

  6. (If the tool has an API / backend) Update nginx/restless-forge.conf.

Start developing:
  cd tools/${TOOL_NAME}/frontend
  npm run dev
EOF
