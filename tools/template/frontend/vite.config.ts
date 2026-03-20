import { defineToolConfig } from "../../vite-tool-config.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// TODO: Replace TOOL_NAME with your tool's directory name (e.g. "my-tool")
//       Replace PORT with an unused port (WIMTW=3000, HoloPath=5173, SandPath=5174)
export default defineToolConfig({
  base: "/tools/TOOL_NAME",
  port: PORT,
  dir: __dirname,
});
