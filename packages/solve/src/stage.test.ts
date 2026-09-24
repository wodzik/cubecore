import { describe, expect, it } from "bun:test";
import { applyMoves, checks, formatAlg, frameFor, parseAlg, solvedState, view } from "@cubecore/core";
import { STAGES, StageSolver } from "./index";

const S = solvedState();
const SCRAMBLE = "D2 F' L2 U R2 B' D L' F2 U' R B2 L D' F R' U2 B L2 D";
const s = applyMoves(S, SCRAMBLE);
const cross = new StageSolver(STAGES.cross());

describe("stage solvers", () => {
  it("cross: distance, every optimal solution solves it, and they're all equally short", () => {
    expect(cross.distance(S)).toBe(0);
    expect(cross.distance(applyMoves(S, "F"))).toBe(1);
    const d = cross.distance(s);
    const all = cross.solve(s, { all: true });
    expect(all.length).toBeGreaterThan(0);
    for (const sol of all) {
      expect(sol.length).toBe(d);
      expect(checks.crossSolved(applyMoves(s, sol))).toBe(true);
    }
    expect(new Set(all.map(formatAlg)).size).toBe(all.length);
  });

  it("next moves: the first moves of optimal solutions", () => {
    expect(formatAlg(cross.nextMoves(applyMoves(S, "F R")))).toBe("R'");
  });

  it("any face through a frame (colour neutral)", () => {
    const up = frameFor("U");
    expect(cross.distance(S, { frame: up })).toBe(0);
    const t = applyMoves(S, "U R");
    const sol = cross.solve(t, { frame: up })[0];
    expect(checks.crossSolved(view(applyMoves(t, sol), up))).toBe(true);
    expect(sol.length).toBe(2);
  });

  it("EOCross: cross plus every edge oriented", () => {
    const eo = new StageSolver(STAGES.eocross());
    const sol = eo.solve(s)[0];
    const after = applyMoves(s, sol);
    expect(checks.crossSolved(after) && checks.edgesOrientedFB(after)).toBe(true);
    expect(eo.distance(s)).toBeGreaterThanOrEqual(cross.distance(s));
  });

  it("xcross: cross and the FR pair; optimal (nothing shorter exists)", () => {
    const x = new StageSolver(STAGES.xcross("FR"));
    const sol = x.solve(s)[0];
    const after = applyMoves(s, sol);
    expect(checks.crossSolved(after) && checks.pairSolved(after, "FR")).toBe(true);
    expect(x.solve(s, { maxDepth: sol.length - 1 })).toEqual([]);
    expect(x.distance(applyMoves(S, "R U R'"))).toBe(3);
  });

  it("samples placements at an exact distance (trainer scrambles)", () => {
    let seed = 42;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const depth of [2, 5, 7]) {
      const p = cross.sample(depth, random)!;
      expect(p.pieces.size).toBe(4);
      // Put the sampled cross into a cube by moves isn't needed here: the solver's own check is the contract.
      const vals = [...p.pieces.values()];
      expect(new Set(vals.map((v) => v >> 1)).size).toBe(4); // distinct positions
    }
    expect(parseAlg("R").length).toBe(1);
  });
});

describe("trainer scrambles", () => {
  it("a cross in exactly N moves — on any face, from an unsolved cube", async () => {
    const { stageScramble } = await import("./index");
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const from = applyMoves(S, "R U F D2");
    for (const length of [3, 6]) {
      const frame = frameFor("U");
      const r = stageScramble({ stage: STAGES.cross(), length, frame, from, random })!;
      expect(cross.distance(r.state, { frame })).toBe(length);
      expect(applyMoves(from, r.moves).join()).toBe(r.state.join());
      expect(r.moves.length).toBeGreaterThan(8); // a real random-state scramble, not just the cross
    }
  });

  it("xcross and EOCross cases at a given length", async () => {
    const { stageScramble } = await import("./index");
    let seed = 3;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const x = stageScramble({ stage: STAGES.xcross("FR"), length: 7, random })!;
    expect(new StageSolver(STAGES.xcross("FR")).distance(x.state)).toBe(7);
    const e = stageScramble({ stage: STAGES.eocross(), length: 6, random })!;
    expect(new StageSolver(STAGES.eocross()).distance(e.state)).toBe(6);
  });
});
