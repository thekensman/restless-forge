import { defineToolConfig } from "../../vite-tool-config.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineToolConfig({
  base: "/tools/pet-cost",
  port: 5189,
  dir: __dirname,
});
