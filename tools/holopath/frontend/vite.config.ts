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

        // Resolve directory requests to their index.html from publicDir
        server.middlewares.use((req, _res, next) => {
          if (req.url?.startsWith(base)) {
            const sub = req.url.slice(base.length).split("?")[0];
            const dir = sub.endsWith("/") ? sub : sub + "/";
            if (dir !== "/") {
              const idx = resolve(publicDir, `.${dir}index.html`);
              if (existsSync(idx)) req.url = base + dir + "index.html";
            }
          }
          next();
        });
      },
    },
  ],
});
