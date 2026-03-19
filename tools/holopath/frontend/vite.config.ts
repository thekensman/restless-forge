import { defineConfig } from "vite";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteSharedJs = resolve(__dirname, "../../../site/shared.js");

export default defineConfig({
  root: "src",
  publicDir: "../public",
  base: "/tools/holopath/",
  appType: "mpa",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    plugins: [
      {
        name: "serve-site-shared-js",
        configureServer(server) {
          server.middlewares.use("/shared.js", (_req, res) => {
            res.setHeader("Content-Type", "application/javascript");
            res.end(readFileSync(siteSharedJs, "utf-8"));
          });
        },
      },
    ],
  },
});
