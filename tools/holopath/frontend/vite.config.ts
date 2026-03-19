import { defineConfig } from "vite";
import { readFileSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, relative, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, "src");
const siteSharedJs = resolve(__dirname, "../../../site/shared.js");

// Recursively find all HTML entry points under src/ for the MPA build.
// Vite requires explicit inputs so it knows which HTML files to process.
function htmlInputs(dir: string): Record<string, string> {
  const inputs: Record<string, string> = {};
  function scan(d: string) {
    for (const entry of readdirSync(d)) {
      const full = resolve(d, entry);
      if (statSync(full).isDirectory()) {
        scan(full);
      } else if (entry.endsWith(".html")) {
        const key = relative(dir, full)
          .replace(/\\/g, "/")
          .replace(/\.html$/, "")
          .replace(/\//g, "_") || "index";
        inputs[key] = full;
      }
    }
  }
  scan(dir);
  return inputs;
}

export default defineConfig({
  root: "src",
  publicDir: "../public",
  base: "/tools/holopath/",
  appType: "mpa",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: { input: htmlInputs(srcDir) },
  },
  server: { port: 5173 },
  plugins: [
    {
      name: "dev-shared-js",
      configureServer(server) {
        // Serve site/shared.js at /shared.js for local dev.
        // In production, nginx serves the real file at this path.
        server.middlewares.use("/shared.js", (_req, res) => {
          res.setHeader("Content-Type", "application/javascript");
          res.end(readFileSync(siteSharedJs, "utf-8"));
        });
      },
    },
  ],
});
