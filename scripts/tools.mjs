/**
 * Tool discovery — single source of truth for "what tools exist".
 * A tool is any tools/<name>/frontend/ directory (template excluded).
 * Its dev port and base path are read from the tool's own vite.config.ts,
 * so nothing at the repo root needs editing when a tool is added.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function discoverTools() {
  const toolsDir = join(ROOT, "tools");
  return readdirSync(toolsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "template")
    .map((e) => {
      const frontend = join(toolsDir, e.name, "frontend");
      const viteConfig = join(frontend, "vite.config.ts");
      if (!existsSync(viteConfig)) return null;
      const src = readFileSync(viteConfig, "utf-8");
      const port = Number(/port:\s*(\d+)/.exec(src)?.[1]);
      const base = /base:\s*"([^"]+)"/.exec(src)?.[1];
      if (!port || !base) return null;
      return { name: e.name, frontend, port, base };
    })
    .filter(Boolean);
}
