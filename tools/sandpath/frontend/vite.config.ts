import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  publicDir: "../public",
  base: "/tools/sandpath/",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
