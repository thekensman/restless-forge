/**
 * PromptDrop — smoke test.
 * Replace with real tests as the tool grows; this keeps `npm test`
 * meaningful from the moment the tool is scaffolded.
 */

import { describe, it, expect } from "vitest";

describe("PromptDrop scaffold", () => {
  it("runs in a DOM environment", () => {
    document.body.innerHTML = '<div id="pdr-header"></div>';
    expect(document.getElementById("pdr-header")).not.toBeNull();
  });
});
