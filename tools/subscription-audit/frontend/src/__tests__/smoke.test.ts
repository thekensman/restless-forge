/**
 * Subscription Audit — smoke test. The UI logic lives in app.ts (data imported
 * from the shared data/ layer); real unit tests should follow when an
 * engine module is split out at launch prep.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Subscription Audit page", () => {
  it("parses and contains a main heading + module script entry", () => {
    const html = readFileSync(resolve(__dirname, "../index.html"), "utf-8");
    document.documentElement.innerHTML = html;
    expect(document.querySelector("h1")).not.toBeNull();
    expect(html).toContain('<script type="module" src="./app.ts">');
  });
});
