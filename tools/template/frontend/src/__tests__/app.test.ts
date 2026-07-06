/**
 * __TOOL_LABEL__ — smoke test.
 * Replace with real tests as the tool grows; this keeps `npm test`
 * meaningful from the moment the tool is scaffolded.
 */

import { describe, it, expect } from "vitest";

describe("__TOOL_LABEL__ scaffold", () => {
  it("runs in a DOM environment", () => {
    document.body.innerHTML = '<div id="__TOOL_PREFIX__-header"></div>';
    expect(document.getElementById("__TOOL_PREFIX__-header")).not.toBeNull();
  });
});
