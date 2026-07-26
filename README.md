# Restless Forge

**A workshop for making things that matter.**

Restless Forge is a consolidated hub for free, open-source web tools. All tools are privacy-first, run in the browser, and require no sign-ups.

**Live site:** https://restless-forge.dev

## Tools

| Tool | Description | Path |
|------|-------------|------|
| **What Is My Time Worth?** | Real hourly wage calculator with DIY-vs-hire decision engine and job comparison | `/tools/what-is-my-time-worth/` |
| **HoloPath** | Hologram GIF generator — transforms images, GIFs, and videos into holographic art | `/tools/holopath/` |
| **SandPath** | Image and SVG to sand table pattern converter (.thr / .gcode) | `/tools/sandpath/` |

## Repository Structure

```
restless-forge/
├── site/                              # Global site pages (static HTML/CSS)
│   ├── index.html                     # Landing page
│   ├── styles.css                     # Global site styles
│   ├── about.html                     # About Restless Forge
│   ├── privacy.html                   # Global privacy policy
│   ├── terms.html                     # Global terms of use
│   ├── faq.html                       # Global FAQ
│   ├── tools/index.html               # Tools hub
│   ├── articles/index.html            # Articles hub (links to Substack)
│   ├── essays/                        # Original essays for AdSense
│   │   ├── index.html
│   │   ├── why-i-build-these-tools.html
│   │   ├── the-time-value-philosophy.html
│   │   └── making-tools-for-the-restless.html
│   ├── sitemap.xml
│   ├── robots.txt
│   └── ads.txt
├── tools/                             # Tool source code
│   ├── template/frontend/             # Starter scaffold for new tools
│   ├── what-is-my-time-worth/frontend/  # TypeScript + Vite (port 3000)
│   ├── holopath/frontend/             # TypeScript + Vite (port 5173)
│   └── sandpath/frontend/             # TypeScript + Vite (port 5174)
├── nginx/                             # Production nginx configs
│   ├── restless-forge.conf            # Main site
│   ├── holopath-redirect.conf         # 301: holopath.art → restless-forge.dev
│   ├── sandpath-redirect.conf         # 301: sandpath.art → restless-forge.dev
│   └── whatismytimeworth-redirect.conf# 301: whatismytimeworth.app → restless-forge.dev
├── build.sh                           # Builds all tools → dist/
├── setup.sh                           # Server setup script
├── CLAUDE.md                          # AI assistant guide
├── MIGRATION.md                       # Migration guide
└── README.md                          # This file
```

## Quick Start

### Development

Run everything at once from the repo root:

```bash
npm install
npm run dev           # proxies all tools at http://localhost:8080
npm test              # runs all tool test suites
```

Or develop a single tool in isolation:

```bash
cd tools/<tool>/frontend
npm install
npm run dev
```

| Tool | Dev port | Base path |
|---|---|---|
| What Is My Time Worth | 3000 | `/tools/what-is-my-time-worth/` |
| HoloPath | 5173 | `/tools/holopath/` |
| SandPath | 5174 | `/tools/sandpath/` |

Almost every tool is fully client-side, with nothing else to run.
Cloud-assisted tools (badged ☁ in the directory) call the small FastAPI
service in `backend/` — run it locally with:

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000
```

Both dev servers proxy `/api` to it. See `docs/backend.md`.

### Build

```bash
./build.sh
```

Builds all three tools and assembles the complete site into `dist/`.

### Deploy

```bash
# Copy build output to web root
sudo cp -r dist/* /var/www/restless-forge/
sudo chown -R www-data:www-data /var/www/restless-forge

# Test and reload nginx
sudo nginx -t && sudo systemctl reload nginx
```

## Tech Stack

- **Frontend:** TypeScript, Vite, vanilla CSS (no frameworks)
- **Server:** nginx, Let's Encrypt, Cloudflare
- **Zero runtime npm dependencies** — all tools use native browser APIs
- **Client-side by default** — almost every tool runs entirely in the
  browser; the few clearly-labeled ☁ Cloud-assisted tools use one small
  FastAPI service (`backend/`, SQLite, no containers)

## Support

- [Ko-fi](https://ko-fi.com/restless-forge)
- [Buy Me a Coffee](https://buymeacoffee.com/restlessforge)
- [Substack](https://restlessforge.substack.com)
- [GitHub](https://github.com/thekensman/)

## License

Each tool retains its original license. See individual tool directories for details.
