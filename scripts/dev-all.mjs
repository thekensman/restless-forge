/**
 * Starts the site proxy plus every discovered tool's dev server.
 * Replaces the hand-maintained concurrently list in package.json.
 */
import concurrently from "concurrently";
import { discoverTools } from "./tools.mjs";

const tools = discoverTools();
const commands = [
  { command: "vite", name: "rf", prefixColor: "cyan" },
  ...tools.map((t, i) => ({
    command: `npm run dev --prefix tools/${t.name}/frontend`,
    name: t.name,
    prefixColor: ["yellow", "magenta", "green", "blue", "red", "white"][i % 6],
  })),
];

console.log(`Starting site proxy + ${tools.length} tool dev servers...`);
const { result } = concurrently(commands, { killOthers: ["failure"] });
result.catch(() => process.exit(1));
