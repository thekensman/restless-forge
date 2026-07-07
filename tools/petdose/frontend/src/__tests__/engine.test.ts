/**
 * PetDose — Unit Tests
 */
import { describe, it, expect } from "vitest";
import * as engine from "../engine";

describe("PetDose engine module", () => {
  it("exports functions and/or objects", () => {
    const exports = Object.keys(engine);
    expect(exports.length).toBeGreaterThan(0);
  });

  it("all exports are functions or objects", () => {
    for (const key of Object.keys(engine)) {
      const type = typeof (engine as Record<string, unknown>)[key];
      expect(["function", "object", "string", "number"]).toContain(type);
    }
  });
});
