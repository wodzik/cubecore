import { describe, expect, it } from "bun:test";
import { FRAMES, applyMoves, checks, fromCubies, invert, parseAlg, solvedState } from "@cubecore/core";
import { F2L_CASES, type F2LSlot, recognizeF2L } from "./index";

const SLOTS: F2LSlot[] = ["FR", "FL", "BL", "BR"];
const HOME = { FR: [4, 8], FL: [5, 9], BL: [6, 10], BR: [7, 11] } as const;

describe("F2L recognition", () => {
  it("every placement of a pair in the top layer or its slot is one of the 41 cases (or solved), for each slot", () => {
    for (const slot of SLOTS) {
      const [hc, he] = HOME[slot];
      const seen = new Set<string>();
      for (const cpos of [0, 1, 2, 3, hc]) for (let co = 0; co < 3; co++) for (const epos of [0, 1, 2, 3, he]) for (let eo = 0; eo < 2; eo++) {
        // Put the slot's corner / edge there (swapping with whatever was there), fix orientations by a spare piece.
        const cp = [0, 1, 2, 3, 4, 5, 6, 7], ep = Array.from({ length: 12 }, (_, i) => i);
        [cp[cpos], cp[hc]] = [cp[hc], cp[cpos]];
        [ep[epos], ep[he]] = [ep[he], ep[epos]];
        const cOri = new Array(8).fill(0), eOri = new Array(12).fill(0);
        cOri[cpos] = co;
        cOri[cpos === 0 ? 1 : 0] += (3 - co) % 3; // keep the twist sum 0 using a top corner
        cOri[cpos === 0 ? 1 : 0] %= 3;
        eOri[epos] = eo;
        eOri[epos === 0 ? 1 : 0] ^= eo;
        const s = fromCubies({ frame: FRAMES[0], cp, co: cOri, ep, eo: eOri });
        const r = recognizeF2L(s, slot);
        expect(r).not.toBeNull();
        seen.add(r === "solved" ? "solved" : r!.id);
      }
      expect(seen.size).toBe(42);
    }
  });

  it("pre-AUF + the slot's algorithm solves the pair, from any angle, keeping the cross", () => {
    for (const slot of SLOTS) {
      for (const kase of F2L_CASES) {
        for (const angle of ["", "U", "U2", "U'"]) {
          const s = applyMoves(solvedState(), [...invert(parseAlg(kase.algs[slot])), ...parseAlg(angle)]);
          const r = recognizeF2L(s, slot);
          expect(r !== "solved" && r?.id).toBe(kase.id);
          const after = applyMoves(s, `${(r as { preAuf: string }).preAuf} ${kase.algs[slot]}`);
          expect(recognizeF2L(after, slot)).toBe("solved");
          expect(checks.crossSolved(after)).toBe(true);
        }
      }
    }
  });
});
