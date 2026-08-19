import { defineToolConfig } from "../../vite-tool-config.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Placeholders:
//   forgedoc — URL directory name (e.g. "my-tool"). Must match the dir name.
//   5194 — Unused dev-server port. Reserved: 3000, 5173, 5174.
//                   Use 5175, 5176, ... for new tools.
export default defineToolConfig({
  base: "/tools/forgedoc",
  port: 5194,
  dir: __dirname,
});
