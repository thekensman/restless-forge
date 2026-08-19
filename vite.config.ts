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
import { defineConfig } from "vite";
import { discoverTools } from "./scripts/tools.mjs";

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

export default defineConfig({
  root: "site",
  server: {
    port: 8080,
    proxy,
  },
});
