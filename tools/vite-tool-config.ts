/**
 * Shared Vite configuration factory for Restless Forge tool frontends.
 *
 * Each tool's vite.config.ts calls defineToolConfig() with its own options
 * instead of duplicating the full config. All common logic lives here:
 *   - MPA mode with only src/index.html as the Rollup entry
 *   - Dev middleware: serves /shared.js from site/shared.js
 *   - Dev middleware: serves sub-page HTML raw (bypasses Vite's HTML
 *     transform, which can't handle IIFE scripts or public/-relative CSS)
 *
 * Usage in a tool's vite.config.ts:
 *   import { defineToolConfig } from "../../vite-tool-config.js";
 *   import { fileURLToPath } from "url";
 *   import { dirname } from "path";
 *   const __dirname = dirname(fileURLToPath(import.meta.url));
 *   export default defineToolConfig({ base: "/tools/my-tool", port: 3000, dir: __dirname });
 */

import { defineConfig } from "vite";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

export interface ToolConfigOptions {
  /** URL base path for this tool, e.g. "/tools/my-tool" (no trailing slash) */
  base: string;
  /** Dev server port — each tool must use a unique port */
  port: number;
  /** Absolute path to the tool's frontend/ directory (pass `__dirname`) */
  dir: string;
}

export function defineToolConfig({ base, port, dir }: ToolConfigOptions) {
  const srcDir       = resolve(dir, "src");
  const publicDir    = resolve(dir, "public");
  // site/ lives three levels up from tools/<name>/frontend/
  const siteRoot       = resolve(dir, "../../../site");
  const siteSharedJs   = resolve(siteRoot, "shared.js");
  const siteToolChrome = resolve(siteRoot, "tool-chrome.css");

  // Tool-scoped assets that fall back to site/ when the tool doesn't ship
  // its own copy. Mirrors the nginx regex location in restless-forge.conf.
  const FALLBACK_ASSETS = [
    "favicon.svg",
    "favicon.ico",
    "apple-touch-icon.png",
    "site.webmanifest",
    "og-image.png",
  ];
  const contentTypeFor = (name: string): string => {
    if (name.endsWith(".svg"))         return "image/svg+xml";
    if (name.endsWith(".ico"))         return "image/x-icon";
    if (name.endsWith(".png"))         return "image/png";
    if (name.endsWith(".webmanifest")) return "application/manifest+json";
    return "application/octet-stream";
  };

  // URLs that are SITE-global, not tool-scoped. Vite's default HTML asset
  // handling rewrites every absolute `/foo` href/src to `${base}/foo` during
  // build. For these shared resources we want the original root-relative URL
  // preserved so the single file at the domain root is served across all tools.
  //
  // Naively replacing `${base}${url}` → `${url}` in the post-transform breaks
  // tool-local URLs that happen to be the full rebased form in the source
  // (e.g. `/tools/<name>/shared.js`). We sentinel-mark the site-global URLs
  // in a PRE-transform so Vite's HTML processor leaves them alone, then
  // restore them in the POST-transform.
  const SITE_GLOBAL_URLS = ["/shared.js", "/tool-chrome.css"];
  const sentinel = (url: string) => `__RF_SITE__${url}`;

  return defineConfig({
    root: "src",
    publicDir: "../public",
    base: base + "/",
    appType: "mpa",
    build: {
      outDir: "../dist",
      emptyOutDir: true,
      // Only the TypeScript SPA is a Rollup entry. Sub-pages are static HTML
      // with no TS modules — they are copied as-is by build.sh after the build.
      rollupOptions: { input: resolve(srcDir, "index.html") },
    },
    server: { port },
    plugins: [
      {
        // Before Vite's HTML processor rebases absolute URLs, swap site-global
        // URLs for a sentinel that doesn't start with `/` so Vite ignores it.
        name: "site-global-urls-pre",
        transformIndexHtml: {
          order: "pre",
          handler(html) {
            let out = html;
            for (const url of SITE_GLOBAL_URLS) {
              out = out.split(`"${url}"`).join(`"${sentinel(url)}"`);
            }
            return out;
          },
        },
      },
      {
        // After Vite is done, replace the sentinel with the original absolute
        // URL so the browser fetches the shared file from the domain root.
        name: "site-global-urls-post",
        transformIndexHtml: {
          order: "post",
          handler(html) {
            let out = html;
            for (const url of SITE_GLOBAL_URLS) {
              out = out.split(`"${sentinel(url)}"`).join(`"${url}"`);
            }
            return out;
          },
        },
      },
      {
        name: "tool-dev-middleware",
        configureServer(server) {
          // Serve site/shared.js at /shared.js.
          // In production nginx serves the real file; this bridges local dev.
          server.middlewares.use("/shared.js", (_req, res) => {
            res.setHeader("Content-Type", "application/javascript");
            res.end(readFileSync(siteSharedJs, "utf-8"));
          });

          // Serve site/tool-chrome.css at /tool-chrome.css — shared header/footer
          // styles used by every tool that opts into the standardized chrome.
          server.middlewares.use("/tool-chrome.css", (_req, res) => {
            res.setHeader("Content-Type", "text/css");
            res.end(readFileSync(siteToolChrome, "utf-8"));
          });

          // Per-tool asset fallback to site/. Tools may omit any of the
          // FALLBACK_ASSETS files; this middleware serves the site-wide
          // version when the tool's own public/ doesn't have it. Mirrors
          // the nginx regex location in restless-forge.conf so dev and
          // prod behave identically.
          server.middlewares.use((req, res, next) => {
            const url = (req.url ?? "").split("?")[0];
            const m = url.match(new RegExp(`^${base}/([^/]+)$`));
            if (!m || !FALLBACK_ASSETS.includes(m[1])) return next();
            const toolFile = resolve(publicDir, m[1]);
            if (existsSync(toolFile)) return next();   // let Vite serve it
            const siteFile = resolve(siteRoot, m[1]);
            if (!existsSync(siteFile)) return next();  // 404 from Vite
            res.setHeader("Content-Type", contentTypeFor(m[1]));
            res.end(readFileSync(siteFile));
          });

          // Serve sub-page HTML raw from src/ without Vite's HTML transform.
          // The transform fails on sub-pages because they use non-module IIFE
          // scripts and absolute CSS URLs pointing to public/ (not src/).
          // Serving raw HTML lets the browser fetch CSS/JS via their absolute
          // URLs, resolved correctly by sirv (public/) and the middleware above.
          server.middlewares.use((req, res, next) => {
            let url = (req.url ?? "/").split("?")[0];
            // Strip base prefix added by the root proxy dev server
            if (url.startsWith(base)) url = url.slice(base.length) || "/";
            // Root is handled by Vite's normal SPA pipeline
            if (url === "/" || url === "/index.html") return next();

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
}
