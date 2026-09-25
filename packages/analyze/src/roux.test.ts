import { describe, expect, it } from "bun:test";
import { applyMoves, solvedState } from "@cubecore/core";
import { analyzeRoux, rouxFollowsThrough } from "./index";

const SCRAMBLE = "D2 R2 F2 U' B2 U L2 D' F2 U2 R' B L' D' B2 U' F' R2 B' U";
const state = applyMoves(solvedState(), SCRAMBLE);

describe("Roux scramble analysis", () => {
  it("every side solves through: FB, SS, SB, CMLL (named), LSE (EO + UL/UR + L4E)", () => {
    const a = analyzeRoux(SCRAMBLE, { known: ["Sune Left Bar"] });
    expect(a.bySide).toHaveLength(6);
    for (const r of a.bySide) {
      expect(rouxFollowsThrough(state, r)).toBe(true);
      expect(r.frame.face.L).toBe(r.side);
      expect(r.steps.map((s) => s.step)).toEqual(["fb", "ss", "sb", "cmll", "lse"]);
      const lse = r.steps[4];
      if (lse.step === "lse") expect(lse.eo + lse.ulur + lse.l4e).toBe(lse.moves.length);
      const cm = r.steps[3];
      if (cm.step === "cmll" && cm.case !== "CMLL skip") expect(typeof cm.known).toBe("boolean");
    }
    expect(a.best.length).toBe(Math.min(...a.bySide.map((r) => r.length)));
  }, 180_000);
});
