/**
 * Runs every discovered tool's test suite sequentially.
 * Replaces the hand-maintained && chain in package.json.
 * Exits non-zero on the first failure (same semantics as the old chain).
 */
import { spawnSync } from "node:child_process";
import { discoverTools } from "./tools.mjs";

const tools = discoverTools();
console.log(`Running test suites for ${tools.length} tools...\n`);

for (const t of tools) {
  console.log(`── ${t.name} ──`);
  const res = spawnSync("npm", ["test", "--prefix", `tools/${t.name}/frontend`], {
    stdio: "inherit",
  });
  if (res.status !== 0) {
    console.error(`\n✗ ${t.name} tests failed`);
    process.exit(res.status ?? 1);
  }
}
console.log(`\n✓ all ${tools.length} tool suites green`);
