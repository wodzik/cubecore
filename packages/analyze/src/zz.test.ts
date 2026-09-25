import { describe, expect, it } from "bun:test";
import { applyMoves, checks, reframe, solvedState } from "@cubecore/core";
import { analyzeZZ, zzFollowsThrough } from "./index";

const SCRAMBLE = "D2 R2 F2 U' B2 U L2 D' F2 U2 R' B L' D' B2 U' F' R2 B' U";
const state = applyMoves(solvedState(), SCRAMBLE);

describe("ZZ scramble analysis", () => {
  it("EOCross, R U L pairs, OCLL + PLL — every colour solves through", () => {
    const z = analyzeZZ(SCRAMBLE);
    expect(z.byCross).toHaveLength(6);
    for (const a of z.byCross) {
      expect(zzFollowsThrough(state, a)).toBe(true);
      // After the EOCross every edge is oriented (as held)…
      let s = applyMoves(reframe(state, a.frame), a.steps[0].moves);
      expect(checks.crossSolved(s)).toBe(true);
      // …the pairs only turn R, U and L…
      for (const st of a.steps.filter((x) => x.step === "pair")) expect(st.moves.every((m) => "RUL".includes(m.family))).toBe(true);
      // …so the OLL is a corners-only case or a skip.
      const oll = a.steps.find((x) => x.step === "oll")!;
      expect(oll.step === "oll" && (oll.case === "OLL skip" || ["OLL 21", "OLL 22", "OLL 23", "OLL 24", "OLL 25", "OLL 26", "OLL 27"].includes(oll.case))).toBe(true);
      void s;
    }
  }, 300_000);
});
