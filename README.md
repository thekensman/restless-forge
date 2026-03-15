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
│   ├── what-is-my-time-worth/
│   │   └── frontend/                  # TypeScript + Vite (port 3000)
│   ├── holopath/
│   │   └── frontend/                  # TypeScript + Vite (port 5173)
│   └── sandpath/
│       ├── frontend/                  # TypeScript + Vite (port 5174)
│       └── backend/                   # Python FastAPI (port 8000)
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

Each tool can be developed independently:

```bash
# What Is My Time Worth
cd tools/what-is-my-time-worth/frontend
npm install
npm run dev    # http://localhost:3000

# HoloPath
cd tools/holopath/frontend
npm install
npm run dev    # http://localhost:5173

# SandPath (requires backend)
cd tools/sandpath/backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000

cd tools/sandpath/frontend
npm install
npm run dev    # http://localhost:5174
```

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
- **SandPath Backend:** Python, FastAPI, Uvicorn
- **Server:** nginx, Let's Encrypt, Cloudflare
- **Zero runtime npm dependencies** — all tools use native browser APIs

## Support

- [Ko-fi](https://ko-fi.com/E1E21UH4DX)
- [Buy Me a Coffee](https://buymeacoffee.com/stygnus)
- [Substack](https://substack.com/@stygnus)
- [GitHub](https://github.com/thekensman/)

## License

Each tool retains its original license. See individual tool directories for details.
