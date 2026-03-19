// Root dev server — serves site/ at / and proxies tool dev servers.
// Usage: npm run dev (starts all tool servers + this server concurrently)
//
// URLs while running:
//   http://localhost:8080/                           → site/index.html (RF landing)
//   http://localhost:8080/about                      → site/about.html
//   http://localhost:8080/tools/                     → site/tools/index.html
//   http://localhost:8080/tools/what-is-my-time-worth/ → proxied to :3000
//   http://localhost:8080/tools/holopath/            → proxied to :5173
//   http://localhost:8080/tools/sandpath/            → proxied to :5174
import { defineConfig } from "vite";

export default defineConfig({
  root: "site",
  server: {
    port: 8080,
    proxy: {
      "/tools/what-is-my-time-worth": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true,
      },
      "/tools/holopath": {
        target: "http://localhost:5173",
        changeOrigin: true,
        ws: true,
      },
      "/tools/sandpath": {
        target: "http://localhost:5174",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
