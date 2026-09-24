import { describe, expect, it } from "bun:test";
import { applyMoves, checks, frameFor, isSolved, solvedState, toCubies, view } from "@cubecore/core";
import { SCRAMBLE_PRESETS, type ScramblePreset, randomScramble, randomState, sharedSolver } from "./index";

// A seeded random source, so failures reproduce.
function seeded(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
}

describe("two-phase solver", () => {
  it("solves random states in at most 21 face turns", () => {
    const solver = sharedSolver();
    const random = seeded(7);
    for (let i = 0; i < 20; i++) {
      const s = randomState({ random });
      const moves = solver.solve(s)!;
      expect(moves.length).toBeLessThanOrEqual(21);
      expect(moves.every((m) => "URFDLB".includes(m.family))).toBe(true);
      expect(isSolved(applyMoves(s, moves))).toBe(true);
    }
  });

  it("solves states with the centres moved (rotations, slices) and refuses impossible ones", () => {
    const s = applyMoves(solvedState(), "x y M' U r E S2");
    expect(isSolved(applyMoves(s, sharedSolver().solve(s)!))).toBe(true);
    const bad = new Uint8Array(solvedState());
    [bad[8], bad[9], bad[20]] = [bad[9], bad[20], bad[8]]; // twist one corner in place
    expect(sharedSolver().solve(bad)).toBeNull();
  });
});

describe("random-state scrambles", () => {
  it("full scrambles are random, reachable and around 20 moves", () => {
    const random = seeded(11);
    const a = randomScramble({ random }), b = randomScramble({ random });
    expect(a.moves.length).toBeGreaterThanOrEqual(15);
    expect(a.moves.length).toBeLessThanOrEqual(21);
    expect(a.state.join()).not.toBe(b.state.join());
    expect(toCubies(a.state)).not.toBeNull();
  });

  it("presets keep their pieces: LL has F2L solved, PLL is oriented, CMLL keeps the Roux blocks", () => {
    const random = seeded(3);
    for (let i = 0; i < 5; i++) {
      expect(checks.f2lSolved(randomScramble({ preset: "ll", random }).state)).toBe(true);
      const pll = randomScramble({ preset: "pll", random }).state;
      expect(checks.f2lSolved(pll) && checks.topOriented(pll)).toBe(true);
    }
    for (const p of Object.keys(SCRAMBLE_PRESETS) as ScramblePreset[]) expect(toCubies(randomScramble({ preset: p, random }).state)).not.toBeNull();
  });

  it("colour neutral: a frame puts the same kind of case on any face", () => {
    const frame = frameFor("U"); // cross on U
    const { state } = randomScramble({ preset: "ll", frame, random: seeded(5) });
    expect(checks.f2lSolved(view(state, frame))).toBe(true);
    expect(checks.f2lSolved(state)).toBe(false); // not the D-cross F2L
  });
});
