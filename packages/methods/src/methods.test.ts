import { describe, expect, it } from "bun:test";
import { isSolved, solvedState } from "@cubecore/core";
import { MASK_NAMES, METHODS, maskByName, methodById } from "./index";

const S = solvedState();

describe("all methods", () => {
  it("every method ends on a solved cube and is found by id", () => {
    for (const m of METHODS) {
      expect(m.stages.at(-1)!.done(S)).toBe(true);
      expect(methodById(m.id)).toBe(m);
    }
    expect(isSolved(S)).toBe(true);
  });

  it("every mask name gives a full 54-sticker mask; unknown names throw", () => {
    expect(MASK_NAMES).toContain("full");
    expect(MASK_NAMES).toContain("cfop:oll");
    expect(MASK_NAMES).toContain("roux:cmll");
    for (const name of MASK_NAMES) expect(maskByName(name).length).toBe(54);
    expect(() => maskByName("nope")).toThrow();
  });
});
