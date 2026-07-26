import { defineToolConfig } from "../../vite-tool-config.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineToolConfig({
  base: "/tools/rise-and-rhyme",
  port: 5198,
  dir: __dirname,
  // Cloud-assisted tool: forward /api to the local backend so single-tool
  // dev (this server) works like the root :8080 proxy and prod nginx.
  // Run the backend with: cd backend && uvicorn main:app --reload
  proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } },
});
