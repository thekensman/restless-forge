#!/usr/bin/env node
/* fetch-ar-assets.mjs — puts Full AR's runtime and models in public/ar/.
 *
 * TattooSafe's opt-in body tracking (MediaPipe Tasks Vision) loads a WASM
 * runtime and two models in the visitor's browser. They are served from this
 * site, never a third-party CDN, so a visitor's request reaches nobody else.
 * public/ar/ is generated (gitignored) before every dev and build run:
 *
 *   - The WASM runtime is copied from node_modules, which npm verified against
 *     package-lock.json. It must be the version src/ar-assets.json names,
 *     because that is the path the browser asks for.
 *   - Each model is downloaded from its pinned upstream URL and checked
 *     against the SHA-256 in src/ar-assets.json. If upstream is unreachable or
 *     serves different bytes, the copy already live on restless-forge.dev
 *     (same file name, which carries the hash) is used instead, under the
 *     same check.
 *
 * Fails when a model can be had from neither source: deploys rsync with
 * --delete, so shipping without the models would also delete the live
 * copies that serve as the fallback.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "src/ar-assets.json"), "utf8"));
const out = join(root, "public/ar");
const MIRROR = "https://restless-forge.dev/tools/tattoosafe/ar/models/";
// FilesetResolver picks the SIMD build when the browser supports it, else the
// fallback. The *_module_internal variants are only for useModule=true.
const WASM_FILES = [
  "vision_wasm_internal.js", "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm",
];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
function fail(msg) {
  console.error(`fetch-ar-assets: ${msg}`);
  process.exit(1);
}

// ── Runtime ──
const pkgDir = join(root, "node_modules/@mediapipe/tasks-vision");
if (!existsSync(pkgDir)) fail("node_modules/@mediapipe/tasks-vision is missing; run npm ci first.");
const installed = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;
if (installed !== manifest.tasksVision) {
  fail(`node_modules has @mediapipe/tasks-vision ${installed}, but src/ar-assets.json names ` +
    `${manifest.tasksVision}. Change them together.`);
}
const wasmDirName = `wasm-${installed}`;
mkdirSync(join(out, wasmDirName), { recursive: true });
for (const f of WASM_FILES) copyFileSync(join(pkgDir, "wasm", f), join(out, wasmDirName, f));

// ── Models ──
const modelsDir = join(out, "models");
mkdirSync(modelsDir, { recursive: true });
for (const m of Object.values(manifest.models)) {
  const dest = join(modelsDir, m.file);
  if (existsSync(dest) && sha256(readFileSync(dest)) === m.sha256) continue;
  const tried = [];
  let got = null;
  for (const url of [m.url, MIRROR + m.file]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) { tried.push(`${url}: HTTP ${res.status}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      const hash = sha256(buf);
      if (hash !== m.sha256) { tried.push(`${url}: sha256 ${hash}, want ${m.sha256}`); continue; }
      got = buf;
      console.log(`fetch-ar-assets: ${m.file} (${(buf.length / 1e6).toFixed(1)} MB) from ${url}`);
      break;
    } catch (e) {
      tried.push(`${url}: ${e.cause?.code ?? e.message}`);
    }
  }
  if (!got) fail(`could not get ${m.file} with the pinned hash:\n  ${tried.join("\n  ")}`);
  writeFileSync(`${dest}.tmp`, got);
  renameSync(`${dest}.tmp`, dest);
}

// ── Drop what the manifest no longer names (old runtimes, replaced models) ──
for (const e of readdirSync(out)) {
  if (e !== wasmDirName && e !== "models") rmSync(join(out, e), { recursive: true, force: true });
}
const wanted = new Set(Object.values(manifest.models).map((m) => m.file));
for (const e of readdirSync(modelsDir)) {
  if (!wanted.has(e)) rmSync(join(modelsDir, e), { force: true });
}
