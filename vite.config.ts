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
      "/tools/tattoosafe": {
        target: "http://localhost:5175",
        changeOrigin: true,
        ws: true,
      },
      "/tools/stitchtrace": {
        target: "http://localhost:5176",
        changeOrigin: true,
        ws: true,
      },
      "/tools/plotpath": {
        target: "http://localhost:5177",
        changeOrigin: true,
        ws: true,
      },
      "/tools/cncfeed": {
        target: "http://localhost:5178",
        changeOrigin: true,
        ws: true,
      },
      "/tools/printplate": {
        target: "http://localhost:5179",
        changeOrigin: true,
        ws: true,
      },
      "/tools/gerberpeek": {
        target: "http://localhost:5180",
        changeOrigin: true,
        ws: true,
      },
      "/tools/knotguide": {
        target: "http://localhost:5181",
        changeOrigin: true,
        ws: true,
      },
      "/tools/lensmatch": {
        target: "http://localhost:5182",
        changeOrigin: true,
        ws: true,
      },
      "/tools/petdose": {
        target: "http://localhost:5183",
        changeOrigin: true,
        ws: true,
      },
      "/tools/cookscale": {
        target: "http://localhost:5184",
        changeOrigin: true,
        ws: true,
      },
      "/tools/pixelgrid": {
        target: "http://localhost:5185",
        changeOrigin: true,
        ws: true,
      },
      "/tools/wavecarve": {
        target: "http://localhost:5186",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
