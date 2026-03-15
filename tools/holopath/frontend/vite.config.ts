import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  publicDir: "../public",
  base: "/tools/holopath/",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
