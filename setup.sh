#!/usr/bin/env bash
# ═══════════════════════════════════════════════════
# Restless Forge — Server Setup Script
# Run on sandpath-01 VPS to configure the production environment
# ═══════════════════════════════════════════════════
set -euo pipefail

echo "═══ Restless Forge Server Setup ═══"
echo ""
echo "This script configures the production server for restless-forge.dev."
echo "Run as root or with sudo on the sandpath-01 VPS."
echo ""

# ── Pre-flight checks ──
if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: This script must be run as root (or with sudo)."
  exit 1
fi

# ── 1. Create web root ──
echo "[1/7] Creating web root directory..."
mkdir -p /var/www/restless-forge
chown -R www-data:www-data /var/www/restless-forge

# ── 2. Install nginx configs ──
echo "[2/7] Installing nginx configurations..."

NGINX_AVAILABLE="/etc/nginx/sites-available"
NGINX_ENABLED="/etc/nginx/sites-enabled"

# Main site config
cp nginx/restless-forge.conf "${NGINX_AVAILABLE}/restless-forge"

# Redirect configs
cp nginx/holopath-redirect.conf "${NGINX_AVAILABLE}/holopath-redirect"
cp nginx/sandpath-redirect.conf "${NGINX_AVAILABLE}/sandpath-redirect"
cp nginx/whatismytimeworth-redirect.conf "${NGINX_AVAILABLE}/whatismytimeworth-redirect"

# Enable sites
ln -sf "${NGINX_AVAILABLE}/restless-forge" "${NGINX_ENABLED}/restless-forge"
ln -sf "${NGINX_AVAILABLE}/holopath-redirect" "${NGINX_ENABLED}/holopath-redirect"
ln -sf "${NGINX_AVAILABLE}/sandpath-redirect" "${NGINX_ENABLED}/sandpath-redirect"
ln -sf "${NGINX_AVAILABLE}/whatismytimeworth-redirect" "${NGINX_ENABLED}/whatismytimeworth-redirect"

echo "  → nginx configs installed and enabled"

# ── 3. SSL Certificates ──
echo "[3/7] Checking SSL certificates..."
echo ""
echo "  If not already set up, run:"
echo "  certbot certonly --nginx -d restless-forge.dev -d www.restless-forge.dev"
echo ""
echo "  Existing domain certs should already be in place for:"
echo "  - holopath.art"
echo "  - sandpath.art"
echo "  - whatismytimeworth.app"
echo ""

# ── 4. Test nginx config ──
echo "[4/5] Testing nginx configuration..."
nginx -t
echo "  → nginx config test passed"

# ── 5. Build and deploy ──
echo "[5/5] Building site..."
echo ""
echo "  Run the build script to compile all tools:"
echo "    ./build.sh"
echo ""
echo "  Then copy to web root:"
echo "    cp -r dist/* /var/www/restless-forge/"
echo "    chown -R www-data:www-data /var/www/restless-forge"
echo ""

# ── Reload nginx ──
echo "Reloading nginx..."
systemctl reload nginx
echo "  → nginx reloaded"

echo ""
echo "═══ Setup Complete ═══"
echo ""
echo "Next steps:"
echo "  1. Verify SSL: https://restless-forge.dev/"
echo "  2. Test redirects:"
echo "     curl -I https://holopath.art"
echo "     curl -I https://sandpath.art"
echo "     curl -I https://whatismytimeworth.app"
echo "  3. Test all tool pages load"
echo "  4. Set up Google Search Console"
echo "  5. Write essays (see /site/essays/ for templates)"
echo "  6. Submit sitemap to GSC"
echo ""
echo "Pre-migration backup:"
echo "  tar -czf /tmp/restless-forge-pre-migration.tar.gz /var/www/restless-forge"
