import { describe, expect, it } from "bun:test";
import { applyMoves, relativeState, reframe, solvedState, statesEqual } from "@cubecore/core";
import { analyzeCross, analyzeScramble, followsThrough } from "./index";

const SCRAMBLE = "D2 R2 F2 U' B2 U L2 D' F2 U2 R' B L' D' B2 U' F' R2 B' U";
const state = applyMoves(solvedState(), SCRAMBLE);

describe("scramble analysis", () => {
  it("the rotation holds the cube with the cross face on the bottom (matches the frame the steps are written in)", () => {
    for (const face of ["D", "U", "F", "B", "L", "R"] as const) {
      const a = analyzeCross(state, face, { crosses: [face] });
      expect(a.frame.face.D).toBe(face);
      // Rotating the cube and reading it as held = the renamed state the steps are for.
      const turned = applyMoves(state, a.rotation);
      const rot = applyMoves(solvedState(), a.rotation);
      expect(statesEqual(relativeState(turned, rot), reframe(state, a.frame))).toBe(true);
    }
  }, 120_000); // the first analysis builds the F2L tables

  it("optimal F2L: every cross colour solves through; best pair order; last layer cases", () => {
    const a = analyzeScramble(SCRAMBLE);
    expect(a.byCross).toHaveLength(6);
    for (const c of a.byCross) expect(followsThrough(state, c)).toBe(true);
    const best = a.best;
    expect(best.steps[0].step).toBe("cross");
    expect(best.pairOrder).toHaveLength(4);
    expect(best.steps.some((s) => s.step === "oll")).toBe(true);
    expect(best.length).toBe(Math.min(...a.byCross.map((c) => c.length)));
  });

  it("by algorithms, from XCross, with the known cases marked", () => {
    const a = analyzeScramble(SCRAMBLE, { f2l: "algorithms", start: "xcross", crosses: ["D", "U"], known: ["OLL 27", "T", "F2L 1"] });
    for (const c of a.byCross) {
      expect(followsThrough(state, c)).toBe(true);
      expect(c.steps[0].step === "cross" && c.steps[0].slots?.length).toBe(1);
      expect(c.pairOrder).toHaveLength(3);
      for (const st of c.steps) if (st.step === "oll" && st.case !== "OLL skip") expect(typeof st.known).toBe("boolean");
    }
  });

  it("face turns only — ready for a smart cube", () => {
    const c = analyzeScramble(SCRAMBLE, { crosses: ["D"], f2l: "algorithms" }).best;
    for (const st of c.steps) expect(st.moves.every((m) => "URFDLB".includes(m.family))).toBe(true);
  });
});
