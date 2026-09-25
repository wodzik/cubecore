import { describe, expect, it } from "bun:test";
import { FRAMES, applyMoves, solvedState, toCubies } from "@cubecore/core";
import { CFOP_TRAINERS } from "../../cfop/src/index";
import { ROUX_TRAINERS } from "../../roux/src/index";
import { ZZ_TRAINERS } from "../../zz/src/index";
import { stageScramble, stageSolver } from "./index";

const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

describe("trainer stages", () => {
  it("free pair: done when the pair is one insert away (17 goal states)", () => {
    const pair = stageSolver(CFOP_TRAINERS.pair("FR"));
    const d = (alg: string) => pair.distance(applyMoves(solvedState(), alg));
    expect(d("")).toBe(0);
    expect(d("R U R'")).toBe(0); // extracted: formed pair, one insert away
    expect(d("F' U' F U2")).toBe(0); // …with an AUF
    expect(d("R U R' D")).toBeGreaterThan(0); // cross broken
    const r = stageScramble({ stage: CFOP_TRAINERS.pair("FR"), length: 4, random: seeded(3) });
    expect(r && pair.distance(r.state)).toBe(4);
  });

  it("first block / first square: any bottom colour on L (x-neutral)", () => {
    const fb = stageSolver(ROUX_TRAINERS.fb());
    expect(fb.distance(applyMoves(solvedState(), "M' U M"))).toBe(0); // the block is still there
    // B breaks the D-bottom block (BL, DBL) but not the F-bottom one (FL, UL, DL, UFL, DLF).
    const afterB = applyMoves(solvedState(), "B");
    expect(fb.distance(afterB)).toBe(0);
    expect(stageSolver({ ...ROUX_TRAINERS.fb(), name: "roux-fb-fixed", neutral: undefined }).distance(afterB)).toBe(1);
    const scrambled = applyMoves(solvedState(), "R U F' L2 D B R' U2 F");
    const best = fb.distance(scrambled);
    const [sol] = fb.solve(scrambled);
    expect(sol.length).toBe(best);
    expect(fb.distance(applyMoves(scrambled, sol))).toBe(0);
    const r = stageScramble({ stage: ROUX_TRAINERS.fs("front"), length: 3, random: seeded(5) });
    expect(r && stageSolver(ROUX_TRAINERS.fs("front")).distance(r.state)).toBe(3);
  });

  it("FBDR keeps a first square, second square keeps the first block", () => {
    const home = (s: Uint8Array, edges: number[], corners: number[]) => {
      const c = toCubies(s)!;
      return edges.every((e) => c.ep[e] === e && c.eo[e] === 0) && corners.every((k) => c.cp[k] === k && c.co[k] === 0);
    };
    const fbdr = stageScramble({ stage: ROUX_TRAINERS.fbdr("front"), length: 5, random: seeded(7) })!;
    expect(home(fbdr.state, [6, 9], [5])).toBe(true); // DL, FL, DLF
    expect(stageSolver(ROUX_TRAINERS.fbdr("front")).distance(fbdr.state)).toBe(5);
    const ss = stageScramble({ stage: ROUX_TRAINERS.ss("back"), length: 6, random: seeded(9) })!;
    expect(home(ss.state, [6, 9, 10], [5, 6])).toBe(true); // the first block
    expect(stageSolver(ROUX_TRAINERS.ss("back")).distance(ss.state)).toBe(6);
  });

  it("EOCross level 10 exists (a user's scramble) and is found by the solver", () => {
    const eo = stageSolver(ZZ_TRAINERS.eocross());
    // act's EOCross (cross on U, F/B axis) of this scramble takes exactly 10.
    const s = applyMoves(solvedState(), "R B L' D F U' D R' B' R2 B2 R2 U F2 B2 U D F R2");
    const crossOnU = FRAMES.find((f) => f.face.D === "U" && f.face.F === "F")!;
    expect(eo.distance(s, { frame: crossOnU })).toBe(10);
  });
});

describe("EOLR (last six edges, M / U)", async () => {
  const { lseSolver } = await import("./lse");
  const { toFaceTurns } = await import("@cubecore/core");
  const eolr = lseSolver(ROUX_TRAINERS.eolr());

  it("exact table from the 16 goal states", () => {
    expect(eolr.maxDepth).toBeGreaterThanOrEqual(8);
    expect(eolr.distance(applyMoves(solvedState(), "U' M2"))).toBe(0); // a goal: UL / UR ready for the insertion
    expect(eolr.distance(solvedState())).toBe(2); // solved LSE is two moves past it
    expect(eolr.distance(applyMoves(solvedState(), "R U R'"))).toBe(-1); // blocks broken: not an LSE state
  });

  it("reads a smart cube's face turns (M arrives as R L' with the centres fixed)", () => {
    const alg = "M' U M U2 M' U' M";
    const withM = applyMoves(solvedState(), alg);
    const faceTurnsOnly = applyMoves(solvedState(), toFaceTurns(alg).moves);
    expect(eolr.distance(faceTurnsOnly)).toBe(eolr.distance(withM));
  });

  it("solutions and trainer cases", () => {
    const r = stageScramble({ stage: ROUX_TRAINERS.eolr(), length: 6, random: seeded(11) })!;
    expect(eolr.distance(r.state)).toBe(6);
    const [sol] = eolr.solve(r.state);
    expect(sol.length).toBe(6);
    expect(sol.every((m) => m.family === "M" || m.family === "U")).toBe(true);
    expect(eolr.distance(applyMoves(r.state, sol))).toBe(0);
  });
});

describe("EOCross level 10 from the offline cases", () => {
  it("a trainer case at 10", () => {
    const r = stageScramble({ stage: ZZ_TRAINERS.eocross(), length: 10, random: seeded(13) });
    expect(r && stageSolver(ZZ_TRAINERS.eocross()).distance(r.state)).toBe(10);
  });
});
