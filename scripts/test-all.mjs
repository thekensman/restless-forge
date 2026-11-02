/**
 * Runs every discovered tool's test suite sequentially, then each restored
 * game's own tests (`tests` in games/games.json, run with node from the game's
 * folder with "." as the argument, the way the game's README runs them).
 * Replaces the hand-maintained && chain in package.json.
 * Exits non-zero on the first failure (same semantics as the old chain).
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { discoverTools } from "./tools.mjs";
import { GAMES_DIR, loadGames } from "./games.mjs";

const tools = discoverTools();
const games = loadGames();
console.log(`Running test suites for ${tools.length} tools and ${games.length} game(s)...\n`);

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

for (const g of games) {
  for (const test of g.tests) {
    console.log(`── games/${g.slug}: ${test} ──`);
    const res = spawnSync(process.execPath, [test, "."], { cwd: join(GAMES_DIR, g.slug), stdio: "inherit" });
    if (res.status !== 0) {
      console.error(`\n✗ games/${g.slug} ${test} failed`);
      process.exit(res.status ?? 1);
    }
  }
}
console.log(`\n✓ all ${tools.length} tool suites and ${games.length} game suite(s) green`);
