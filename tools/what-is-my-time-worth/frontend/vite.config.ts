import { defineConfig } from "vite";
export default defineConfig({
  root: "src",
  publicDir: "../public",
  base: "/tools/what-is-my-time-worth/",
  build: { outDir: "../dist", emptyOutDir: true },
  server: { port: 3000 },
});
