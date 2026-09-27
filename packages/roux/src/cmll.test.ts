import { describe, expect, it } from "bun:test";
import { FRAMES, MethodTracker, applyMoves, fromCubies, invert, parseAlg, solvedState } from "@cubecore/core";
import { CMLL_CASES, ROUX, cmll, cmllCaseState, recognizeCmll } from "./index";

const perms = (n: number): number[][] => (n === 1 ? [[0]] : perms(n - 1).flatMap((p) => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)])));

describe("CMLL recognition", () => {
  it("every corner arrangement is exactly one case (648 → 42 + skip)", () => {
    const seen = new Set<string>();
    for (const cp of perms(4)) {
      for (let c = 0; c < 27; c++) {
        const co = [c % 3, ((c / 3) | 0) % 3, ((c / 9) | 0) % 3];
        co.push((3 - (co[0] + co[1] + co[2]) % 3) % 3);
        // Edges don't matter to CMLL (they're LSE); a corner-only odd permutation is fine for recognition.
        const s = fromCubies({ frame: FRAMES[0], cp: [...cp, 4, 5, 6, 7], co: [...co, 0, 0, 0, 0], ep: Array.from({ length: 12 }, (_, i) => i), eo: new Array(12).fill(0) });
        seen.add(recognizeCmll(s)?.id ?? "skip");
      }
    }
    expect(seen.size).toBe(43);
  });

  it("pre-AUF + the case's algorithm solves the corners, from any angle, with the M slice off", () => {
    for (const kase of CMLL_CASES) {
      for (const angle of ["", "U", "U2", "U'"]) {
        for (const m of ["", "M'", "M2"]) {
          const s = applyMoves(solvedState(), [...invert(parseAlg(kase.alg)), ...parseAlg(`${m} ${angle}`)]);
          const r = recognizeCmll(s)!;
          expect(r.id).toBe(kase.id);
          expect(cmll(applyMoves(s, `${r.preAuf} ${kase.alg}`))).toBe(true);
        }
      }
    }
  });

  it("a cube to practise a case on", () => {
    const { toCubies, isSolvable } = require("@cubecore/core");
    for (const kase of CMLL_CASES) {
      const s = cmllCaseState(kase.id);
      expect(isSolvable(toCubies(s))).toBe(true); // a real, solvable cube
      expect(recognizeCmll(s)!.id).toBe(kase.id);
    }
  });

  it("which CMLL came up after the second block, in a solve", () => {
    const kase = CMLL_CASES.find((c) => c.id === "Sune Left Bar")!;
    const t = new MethodTracker(ROUX, applyMoves(solvedState(), invert(parseAlg(kase.alg))));
    expect(t.current.next).toBe("cmll");
    expect(t.current.case).toBe("Sune Left Bar");
  });
});
