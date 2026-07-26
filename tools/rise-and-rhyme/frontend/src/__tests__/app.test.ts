/**
 * Rise & Rhyme — smoke test.
 * Replace with real tests as the tool grows; this keeps `npm test`
 * meaningful from the moment the tool is scaffolded.
 */

import { describe, it, expect } from "vitest";

describe("Rise & Rhyme scaffold", () => {
  it("runs in a DOM environment", () => {
    document.body.innerHTML = '<div id="rar-header"></div>';
    expect(document.getElementById("rar-header")).not.toBeNull();
  });
});
