/**
 * Rise & Rhyme — DOM contract between app.ts and index.html.
 *
 * app.ts reaches into the page through `$("some-id")`, which THROWS when the
 * element is missing. Every one of those calls sits in init(), so a single
 * stale id doesn't just break its own button — it aborts the rest of the
 * wire-up, including `setInterval(tick)`. That is the whole alarm: the tool
 * looks fine, and then never rings.
 *
 * That is exactly what shipped — a button renamed in app.ts but not in the
 * HTML, plus two elements sharing one id (getElementById returns only the
 * first, so the second is unreachable however correct the name looks). Neither
 * is visible in a type check; both are caught here.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Resolved from the vitest root (the tool's frontend/), not import.meta.url,
// which the jsdom environment rewrites to a document-relative URL.
const read = (name: string) => readFileSync(resolve(process.cwd(), "src", name), "utf8");

const APP = read("app.ts");
const HTML = read("index.html");

/** Ids app.ts demands at runtime, from its literal `$("…")` calls. */
const referencedIds = [...APP.matchAll(/\$\("([\w-]+)"\)/g)].map((m) => m[1]);

/** Every id="…" the page actually declares, in document order. */
const declaredIds = [...HTML.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]);

describe("app.ts ↔ index.html id contract", () => {
  it("references at least the buttons we expect (guards the regex itself)", () => {
    expect(referencedIds).toContain("rar-save");
    expect(referencedIds).toContain("rar-check");
    expect(referencedIds.length).toBeGreaterThan(5);
  });

  it("declares every id app.ts looks up", () => {
    const missing = referencedIds.filter((id) => !declaredIds.includes(id));
    expect(missing, `app.ts calls $("…") for ids absent from index.html`).toEqual([]);
  });

  it("declares no id twice", () => {
    const seen = new Set<string>();
    const duplicated = declaredIds.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
    expect(duplicated, "getElementById silently returns only the first match").toEqual([]);
  });

  it("wires the song-preview button", () => {
    expect(APP).toMatch(/\$\("rar-play"\)\.addEventListener\("click"/);
  });

  it("arms the scheduling loop before any lookup that can throw", () => {
    // The alarm is the one thing that must survive a DOM wiring bug, so
    // setInterval has to come before the first $() call in init().
    const loop = APP.indexOf("setInterval(");
    const firstLookup = APP.indexOf('$("rar-save")');
    expect(loop).toBeGreaterThan(-1);
    expect(firstLookup).toBeGreaterThan(-1);
    expect(loop).toBeLessThan(firstLookup);
  });
});
