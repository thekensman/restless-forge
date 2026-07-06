# Migration Guide: Restless Forge Consolidation

> **Historical document.** This one-time migration (holopath.art, sandpath.art,
> whatismytimeworth.app → restless-forge.dev) is complete. Kept for the
> 301-redirect mapping and cert notes; details may not reflect the current
> codebase. For current architecture and deploy steps, see `CLAUDE.md`.

Step-by-step guide for migrating holopath.art, sandpath.art, and whatismytimeworth.app into restless-forge.dev.

## Pre-Migration Checklist

- [ ] `restless-forge.dev` domain registered and active
- [ ] Cloudflare configured for restless-forge.dev
- [ ] sandpath-01 VPS accessible via SSH
- [ ] All three source repos available
- [ ] SSL certificates for restless-forge.dev (Let's Encrypt or Cloudflare)

## Phase 1: Server Preparation

### 1.1 DNS Configuration

Point `restless-forge.dev` A record to sandpath-01 IP via Cloudflare.

```
Type: A
Name: restless-forge.dev
Content: <sandpath-01-IP>
Proxy: Enabled (orange cloud)
```

### 1.2 SSL Setup

```bash
# If using Let's Encrypt:
sudo certbot certonly --nginx -d restless-forge.dev -d www.restless-forge.dev

# If using Cloudflare: Set SSL mode to "Full (strict)"
```

### 1.3 Create Web Root

```bash
sudo mkdir -p /var/www/restless-forge
sudo chown -R www-data:www-data /var/www/restless-forge
```

## Phase 2: Build and Deploy

### 2.1 Clone and Build

```bash
git clone <restless-forge-repo-url>
cd restless-forge

# Install Node.js dependencies and build all tools
./build.sh
```

### 2.2 Deploy to Web Root

```bash
sudo cp -r dist/* /var/www/restless-forge/
sudo chown -R www-data:www-data /var/www/restless-forge
```

### 2.3 SandPath Backend — removed

SandPath was later rewritten to run 100% client-side; the Python backend
(and its `/api/` nginx proxy) no longer exist. No backend setup is needed
for any tool.

## Phase 3: nginx Configuration

### 3.1 Install Configs

```bash
# Copy nginx configs
sudo cp nginx/restless-forge.conf /etc/nginx/sites-available/restless-forge
sudo cp nginx/holopath-redirect.conf /etc/nginx/sites-available/holopath-redirect
sudo cp nginx/sandpath-redirect.conf /etc/nginx/sites-available/sandpath-redirect
sudo cp nginx/whatismytimeworth-redirect.conf /etc/nginx/sites-available/whatismytimeworth-redirect

# Enable sites
sudo ln -sf /etc/nginx/sites-available/restless-forge /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/holopath-redirect /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/sandpath-redirect /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/whatismytimeworth-redirect /etc/nginx/sites-enabled/
```

### 3.2 Disable Old Site Configs

```bash
# Remove old domain configs from sites-enabled (keep in sites-available for rollback)
sudo rm -f /etc/nginx/sites-enabled/holopath
sudo rm -f /etc/nginx/sites-enabled/sandpath
sudo rm -f /etc/nginx/sites-enabled/whatismytimeworth
```

### 3.3 Test and Reload

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Phase 4: Verification

### 4.1 Immediate Checks (Same Day)

```bash
# DNS resolves
nslookup restless-forge.dev

# HTTPS works
curl -I https://restless-forge.dev/

# Landing page loads
curl -s https://restless-forge.dev/ | head -5

# All tools load
curl -I https://restless-forge.dev/tools/what-is-my-time-worth/
curl -I https://restless-forge.dev/tools/holopath/
curl -I https://restless-forge.dev/tools/sandpath/

# Support pages load
curl -I https://restless-forge.dev/about
curl -I https://restless-forge.dev/privacy
curl -I https://restless-forge.dev/terms
curl -I https://restless-forge.dev/faq

# Redirects work
curl -I https://holopath.art
curl -I https://sandpath.art
curl -I https://whatismytimeworth.app
# All should return 301 with Location: https://restless-forge.dev/tools/...
```

### 4.2 Browser Testing

- [ ] Landing page: layout, links, tool cards
- [ ] Each tool: full functionality (calculator, GIF generation, file conversion)
- [ ] Mobile responsiveness
- [ ] All navigation links work
- [ ] Donation footer visible on all pages
- [ ] No JavaScript console errors

### 4.3 SEO Verification

- [ ] Canonical URLs correct on each page
- [ ] Open Graph tags render in social media previews
- [ ] JSON-LD schema valid (test at https://validator.schema.org/)
- [ ] sitemap.xml accessible at https://restless-forge.dev/sitemap.xml

## Phase 5: Post-Migration (First Week)

### 5.1 Google Search Console

1. Add `restless-forge.dev` as new property
2. Verify domain ownership
3. Submit sitemap: `https://restless-forge.dev/sitemap.xml`
4. Add old domains as properties to monitor 301 redirect indexing
5. Use "URL Inspection" to verify redirects are being followed

### 5.2 Monitor

- Check GSC for crawl errors daily for the first week
- Verify no 404 errors in nginx access logs:
  ```bash
  grep " 404 " /var/log/nginx/access.log | tail -20
  ```

## Phase 6: Content & AdSense (Weeks 3-6)

### 6.1 Write Essays

Replace placeholder content in these files with original essays (800+ words each):

1. `site/essays/why-i-build-these-tools.html`
2. `site/essays/the-time-value-philosophy.html`
3. `site/essays/making-tools-for-the-restless.html`

After writing, rebuild and redeploy:
```bash
sudo cp -r site/essays/* /var/www/restless-forge/essays/
```

### 6.2 Update Substack Links

Review high-traffic Substack posts and update links:
- `holopath.art` → `restless-forge.dev/tools/holopath/`
- `sandpath.art` → `restless-forge.dev/tools/sandpath/`
- `whatismytimeworth.app` → `restless-forge.dev/tools/what-is-my-time-worth/`

### 6.3 AdSense Application

Prerequisites before applying:
- [ ] Domain live for 2+ weeks
- [ ] 2-3 original essays published (800+ words each)
- [ ] 5+ crawlable pages with real content
- [ ] Privacy policy in place
- [ ] ads.txt configured
- [ ] No crawl errors in GSC

Apply at: https://www.google.com/adsense/

## Rollback Plan

If critical issues arise:

```bash
# 1. Disable restless-forge nginx block
sudo rm /etc/nginx/sites-enabled/restless-forge
sudo rm /etc/nginx/sites-enabled/holopath-redirect
sudo rm /etc/nginx/sites-enabled/sandpath-redirect
sudo rm /etc/nginx/sites-enabled/whatismytimeworth-redirect

# 2. Re-enable old site configs
sudo ln -sf /etc/nginx/sites-available/holopath /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/sandpath /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/whatismytimeworth /etc/nginx/sites-enabled/

# 3. Reload
sudo nginx -t && sudo systemctl reload nginx
```

Keep old domains running in parallel for at least 2 weeks after migration.

## URL Mapping Reference

| Old URL | New URL |
|---------|---------|
| `https://holopath.art/` | `https://restless-forge.dev/tools/holopath/` |
| `https://holopath.art/about` | `https://restless-forge.dev/tools/holopath/about.html` |
| `https://holopath.art/faq` | `https://restless-forge.dev/tools/holopath/faq.html` |
| `https://holopath.art/articles/` | `https://restless-forge.dev/tools/holopath/articles/` |
| `https://sandpath.art/` | `https://restless-forge.dev/tools/sandpath/` |
| `https://whatismytimeworth.app/` | `https://restless-forge.dev/tools/what-is-my-time-worth/` |
| `https://whatismytimeworth.app/about/` | `https://restless-forge.dev/about` |
| `https://whatismytimeworth.app/faq/` | `https://restless-forge.dev/tools/what-is-my-time-worth/faq/` |
| `https://whatismytimeworth.app/blog/` | `https://restless-forge.dev/tools/what-is-my-time-worth/blog/` |
| N/A | `https://restless-forge.dev/essays/` |
| N/A | `https://restless-forge.dev/articles/` |
