/**
 * Side Hustle Reality — smoke test. The tool is a single self-contained HTML page;
 * real unit tests should follow once its logic is extracted to modules.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Side Hustle Reality page", () => {
  it("parses and contains a main heading + inline script", () => {
    const html = readFileSync(resolve(__dirname, "../index.html"), "utf-8");
    document.documentElement.innerHTML = html;
    expect(document.querySelector("h1")).not.toBeNull();
    expect(html).toContain("<script");
  });
});
