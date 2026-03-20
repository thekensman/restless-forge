import { defineConfig } from "vite";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, "src");
const siteSharedJs = resolve(__dirname, "../../../site/shared.js");
const base = "/tools/what-is-my-time-worth";

export default defineConfig({
  root: "src",
  publicDir: "../public",
  base: base + "/",
  appType: "mpa",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    // Only bundle the TypeScript SPA entry point.
    // Sub-pages are static HTML (no TS modules) — they are copied as-is
    // by build.sh after the Vite build completes.
    rollupOptions: { input: resolve(srcDir, "index.html") },
  },
  server: { port: 3000 },
  plugins: [
    {
      name: "dev-middleware",
      configureServer(server) {
        // Serve site/shared.js at /shared.js for local dev.
        // In production, nginx serves the real file at this path.
        server.middlewares.use("/shared.js", (_req, res) => {
          res.setHeader("Content-Type", "application/javascript");
          res.end(readFileSync(siteSharedJs, "utf-8"));
        });

        // Serve sub-page HTML directly from src/ without going through
        // Vite's HTML transform. The transform fails on sub-pages because:
        //   1. <script src="/shared.js"> is a non-module IIFE — Vite can't bundle it
        //   2. <link href="/tools/.../pages.css"> points to public/, not src/
        // By bypassing the transform we serve raw HTML; the browser then
        // fetches CSS/JS separately via their absolute URLs (which are served
        // correctly by sirv for public/ assets and our /shared.js middleware).
        server.middlewares.use((req, res, next) => {
          let url = (req.url ?? "/").split("?")[0];
          // Strip base prefix added by the root proxy server
          if (url.startsWith(base)) url = url.slice(base.length) || "/";
          // Skip root (handled by Vite's normal SPA pipeline)
          if (url === "/" || url === "/index.html") return next();
          // Resolve candidate file path
          let candidate: string | null = null;
          if (url.endsWith("/")) {
            candidate = resolve(srcDir, url.slice(1) + "index.html");
          } else if (url.endsWith(".html")) {
            candidate = resolve(srcDir, url.slice(1));
          }
          if (candidate && existsSync(candidate)) {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(readFileSync(candidate, "utf-8"));
            return;
          }
          next();
        });
      },
    },
  ],
});
