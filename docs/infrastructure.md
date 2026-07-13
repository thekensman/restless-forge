# Infrastructure Runbook

Everything about the server side of restless-forge.dev. The guiding
principle: **the repo is the backup.** The droplet holds almost no unique
state, so recovery is "make a new box and press deploy", not archaeology.

## Inventory

| Thing | Value |
|---|---|
| Droplet | `sandpath-01` — 1 GB RAM / 25 GB disk, SFO2, Ubuntu 24.04 LTS |
| Serves | nginx, static files only (no app processes) |
| Web root | `/var/www/restless-forge` (rsynced by the Deploy workflow) |
| Live vhost | `/etc/nginx/sites-available/restless-forge` (**no `.conf` suffix**), symlinked from `sites-enabled/` — deployed automatically by the Deploy workflow with `nginx -t` + rollback |
| DNS / edge | Cloudflare in front of the droplet (orange-cloud proxy) |
| Certs | Let's Encrypt via certbot, **DNS-01 validation through the Cloudflare plugin** (see below) |
| Legacy domains | holopath.art, sandpath.art, whatismytimeworth.app — 301-redirect vhosts, installed by hand; left to expire naturally with their Namecheap registrations. Do not renew, monitor, or extend them. |

## What state lives where

- **In the repo (recoverable by deploy):** all site content, tool builds,
  the main nginx vhost, CI/CD, this runbook.
- **On the droplet only (must exist for the site to work):**
  - Let's Encrypt certs + `/etc/letsencrypt/cloudflare.ini` (API token)
  - `/etc/nginx/sites-enabled/restless-forge` symlink
  - deploy public key in `/root/.ssh/authorized_keys`
    (sshd reads `/root/.ssh/...`, **not** `/home/root/...`)
  - Cloudflare-only firewall rules + `/etc/cron.daily/ip_refresh` (below)
  - legacy redirect vhosts
- **In GitHub secrets:** `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`,
  `DEPLOY_PATH`.

## Monitoring

- `.github/workflows/health-check.yml` runs every 30 minutes: homepage
  content, a tool page, the vhost cache-header fingerprint, and TLS cert
  expiry (alerts at <14 days). Failures open/update a GitHub issue labeled
  `site-health` — GitHub emails you.
- DigitalOcean side (do once, in the dashboard): enable **alert policies**
  (CPU >80%, disk >80%, droplet down → email) and **weekly automated
  backups** (~$1.20/mo) so there's always a recent snapshot you didn't
  have to remember to take.

## Certificate renewal (Cloudflare DNS-01) — how it works, how to test it

Because the firewall only admits Cloudflare IPs on 80/443 (below), plain
HTTP-01 validation can break; certs are issued/renewed with **DNS-01 via
the certbot Cloudflare plugin** instead. One-time setup that must exist on
the box:

```bash
sudo apt install python3-certbot-dns-cloudflare
# Cloudflare dashboard → My Profile → API Tokens → Create Token
#   template "Edit zone DNS", scoped to the restless-forge.dev zone
sudo tee /etc/letsencrypt/cloudflare.ini > /dev/null <<EOF
dns_cloudflare_api_token = <token>
EOF
sudo chmod 600 /etc/letsencrypt/cloudflare.ini

sudo certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 60 \
  -d restless-forge.dev -d www.restless-forge.dev
sudo systemctl reload nginx
```

> **Token-scoping gotcha:** the original token from the sandpath.art era
> was scoped to *that zone only*. A zone-scoped token silently fails for
> restless-forge.dev — re-issue the token scoped to the restless-forge.dev
> zone (or all zones) when migrating.

**Stress test (run these now, and after any server change):**

```bash
sudo certbot renew --dry-run          # full renewal rehearsal against staging
systemctl list-timers | grep certbot  # certbot.timer must be active
sudo grep authenticator /etc/letsencrypt/renewal/restless-forge.dev.conf
                                      # must say dns-cloudflare, not standalone/webroot
sudo openssl x509 -noout -dates -in /etc/letsencrypt/live/restless-forge.dev/cert.pem
```

If the dry run passes and the timer is active, renewal is autonomous. The
health-check workflow is the safety net: it alerts at 14 days remaining,
which is 2 renewal attempts' worth of margin (certbot renews at 30 days).

**Where the schedule lives:** apt-installed certbot runs from the systemd
timer `certbot.timer` (twice daily at 00:00/12:00 plus a randomized delay
of up to 12 h; each run renews only certs within 30 days of expiry, so
most runs are no-ops).

```bash
systemctl list-timers certbot.timer   # NEXT and LAST run times
systemctl cat certbot.timer           # the schedule definition itself
journalctl -u certbot.service -n 50   # log of recent renewal attempts
```

## Cloudflare edge

- The droplet firewalls 80/443 to **Cloudflare IPs only** (ipset `cf4`/`cf6`
  + iptables ACCEPT/DROP), refreshed daily by `/etc/cron.daily/ip_refresh`
  which re-pulls https://www.cloudflare.com/ips-v4 and ips-v6. If Cloudflare
  is ever removed from DNS, these rules must go too or the site goes dark.
- **Cache behavior:** Cloudflare caches by extension and honors origin
  headers. After changing brand assets (favicon/og-image), the 24h origin
  cache means propagation within a day; to force it, purge those URLs in
  the dashboard. (This was the "favicon still shows HoloPath" incident —
  the deploy verify step now hash-compares served bytes to catch it.)
- SSH (22) is deliberately NOT behind Cloudflare — keep it firewalled to
  your own IP or protected by key-only auth (below).

## Disaster recovery

Fast path: restore the latest snapshot/backup in DO, re-point DNS if the
IP changed, done.

From scratch (~30 min, needs: repo, Cloudflare login, DO login):

1. Create droplet (Ubuntu LTS), note IP; update the Cloudflare A/AAAA
   records for restless-forge.dev (keep proxy on).
2. `apt update && apt install -y nginx certbot python3-certbot-dns-cloudflare`
3. Append the deploy public key to `/root/.ssh/authorized_keys`.
4. Recreate `/etc/letsencrypt/cloudflare.ini` (token from Cloudflare) and
   issue the cert — commands in the section above.
5. `ln -s /etc/nginx/sites-available/restless-forge /etc/nginx/sites-enabled/`
   (the file itself arrives with the first deploy; `rm /etc/nginx/sites-enabled/default`).
6. Update the `DEPLOY_HOST` secret if the IP changed; run **Deploy** from
   the Actions tab (workflow_dispatch). It ships `dist/` + the vhost,
   tests, reloads, and verifies.
7. Re-apply the hardening checklist and the Cloudflare ipset firewall
   (commands above / below).

## Server hardening checklist (one-time, manual)

```bash
apt install -y unattended-upgrades fail2ban ufw
dpkg-reconfigure -plow unattended-upgrades   # enable automatic security updates
ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable
systemctl enable --now fail2ban              # default sshd jail is enough
# key-only SSH:
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh
```

## Deliberate non-additions

- **No backend / DB / containers** — every tool is client-side by design;
  there is nothing to persist server-side.
- **No load balancer or second droplet** — static content, modest traffic,
  and a 30-minute from-scratch recovery make redundancy premature.
- **No config management (Ansible etc.)** — the entire server-side surface
  is this one page.
