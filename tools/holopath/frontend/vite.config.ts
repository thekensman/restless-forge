import { defineConfig } from "vite";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteSharedJs = resolve(__dirname, "../../../site/shared.js");
const publicDir = resolve(__dirname, "../public");
const base = "/tools/holopath";

export default defineConfig({
  root: "src",
  publicDir: "../public",
  base: `${base}/`,
  appType: "mpa",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: { port: 5173 },
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
        // See WIMTW vite.config.ts for full explanation.
        server.middlewares.use((req, res, next) => {
          let urlPath = (req.url ?? "/").split("?")[0];

          if (urlPath.startsWith(base + "/")) urlPath = urlPath.slice(base.length);

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
