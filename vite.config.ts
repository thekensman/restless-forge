// Root dev server — serves site/ at / and proxies tool dev servers.
// Usage: npm run dev (starts all tool servers + this server concurrently)
//
// Proxy entries are DISCOVERED from tools/*/frontend/vite.config.ts (port +
// base), so adding a tool requires no edit here. To run a single tool, use
// `npm run dev --prefix tools/<name>/frontend` instead.
//
// URLs while running:
//   http://localhost:8080/                → site/index.html (RF landing)
//   http://localhost:8080/about           → site/about.html
//   http://localhost:8080/tools/          → site/tools/index.html
//   http://localhost:8080/tools/<name>/   → proxied to that tool's dev port
//   http://localhost:8080/games/          → site/games/index.html
//   http://localhost:8080/games/<slug>/   → games/<slug>/, served as-is (below)
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { discoverTools } from "./scripts/tools.mjs";
import { GAMES_DIR, loadGames } from "./scripts/games.mjs";

const proxy = Object.fromEntries(
  discoverTools().map((t) => [
    t.base,
    { target: `http://localhost:${t.port}`, changeOrigin: true, ws: true },
  ])
);

// Backend API (cloud-assisted tools). Run it locally with:
//   cd backend && uvicorn main:app --reload --port 8000
// In prod, nginx proxies /api/ to the same service.
proxy["/api"] = { target: "http://localhost:8000", changeOrigin: true };

// Restored games are static folders that no build step touches, so they are
// streamed from games/<slug>/ verbatim, without Vite's HTML transform. Only
// the paths that ship (`files` in games/games.json) are served, as in prod,
// and the slashless URL redirects, as nginx does: every path in a game page is
// relative, so the page breaks without the slash.
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".wav": "audio/wav",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function serveGames(): Plugin {
  return {
    name: "rf-serve-games",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = (req.url || "").split("?")[0].match(/^\/games\/([a-z0-9-]+)(\/.*)?$/);
        const game = m && loadGames().find((g) => g.slug === m[1]);
        if (!m || !game) return next();
        if (m[2] === undefined) {
          res.statusCode = 301;
          res.setHeader("Location", `/games/${game.slug}/`);
          return res.end();
        }
        const rel = decodeURIComponent(m[2]).slice(1) || "index.html";
        const dir = join(GAMES_DIR, game.slug);
        const file = normalize(join(dir, rel));
        const shipped = game.files.some((f: string) => rel === f || rel.startsWith(`${f}/`));
        if (!shipped || !file.startsWith(dir + sep) || !existsSync(file) || !statSync(file).isFile()) {
          return next();
        }
        res.setHeader("Content-Type", TYPES[extname(file)] || "application/octet-stream");
        res.setHeader("Cache-Control", "no-store");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: "site",
  plugins: [serveGames()],
  server: {
    port: 8080,
    proxy,
  },
});
