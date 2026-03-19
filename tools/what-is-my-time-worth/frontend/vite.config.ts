import { defineConfig } from "vite";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteSharedJs = resolve(__dirname, "../../../site/shared.js");
const publicDir = resolve(__dirname, "../public");
const base = "/tools/what-is-my-time-worth";

export default defineConfig({
  root: "src",
  publicDir: "../public",
  base: `${base}/`,
  appType: "mpa",
  build: { outDir: "../dist", emptyOutDir: true },
  server: { port: 3000 },
  plugins: [
    {
      name: "dev-middleware",
      configureServer(server) {
        // Serve site/shared.js at /shared.js
        server.middlewares.use("/shared.js", (_req, res) => {
          res.setHeader("Content-Type", "application/javascript");
          res.end(readFileSync(siteSharedJs, "utf-8"));
        });

        // Resolve directory requests to their publicDir index.html.
        //
        // Vite's baseMiddleware strips the base path before plugin middlewares
        // run, so req.url is already base-stripped (e.g. "/about/" not
        // "/tools/what-is-my-time-worth/about/"). Vite's sirv is also
        // configured with extensions:[] so it won't do dir-index resolution
        // on its own. We serve the file directly to bypass both issues.
        server.middlewares.use((req, res, next) => {
          let urlPath = (req.url ?? "/").split("?")[0];

          // Strip base prefix in case it hasn't been stripped yet (e.g. direct
          // access without going through Vite's baseMiddleware).
          if (urlPath.startsWith(base + "/")) urlPath = urlPath.slice(base.length);

          // Only act on directory-style requests (trailing slash, non-root).
          if (!urlPath.endsWith("/") || urlPath === "/") { next(); return; }

          const idx = resolve(publicDir, urlPath.slice(1) + "index.html");
          if (existsSync(idx)) {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(readFileSync(idx, "utf-8"));
            return;
          }
          next();
        });
      },
    },
  ],
});
