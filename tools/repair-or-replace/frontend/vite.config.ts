import { defineToolConfig } from "../../vite-tool-config.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineToolConfig({
  base: "/tools/repair-or-replace",
  port: 5190,
  dir: __dirname,
});
