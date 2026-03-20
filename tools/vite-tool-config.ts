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
  const srcDir = resolve(dir, "src");
  // site/shared.js lives three levels up from tools/<name>/frontend/
  const siteSharedJs = resolve(dir, "../../../site/shared.js");

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
        name: "tool-dev-middleware",
        configureServer(server) {
          // Serve site/shared.js at /shared.js.
          // In production nginx serves the real file; this bridges local dev.
          server.middlewares.use("/shared.js", (_req, res) => {
            res.setHeader("Content-Type", "application/javascript");
            res.end(readFileSync(siteSharedJs, "utf-8"));
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
