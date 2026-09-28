import { describe, expect, it } from "bun:test";
import { FRAMES, IDENTITY_FRAME, MethodTracker, type Move, applyMoves, solvedState, toFaceTurns } from "@cubecore/core";
import { runSegments, stagesAt } from "@cubecore/core/testing";
import { ROUX, lseEo } from "./index";

describe("Roux", () => {
  it("first block, second block, CMLL, EO, UL/UR, L4E — with M slices moving the centres", () => {
    const segments = ["F' U2 L' D R2", "R U R' r' U' R2", "R U R' U R U2 R'", "M' U M", "U M2 U'", "M2 U2 M2 U2"];
    const { tracker, ends, total } = runSegments(ROUX, segments);
    expect(tracker.boundaries.map((b) => b.stage)).toEqual(ROUX.stages.map((s) => s.id));
    // Each stage is reached no later than the end of its own segment, in order.
    tracker.boundaries.forEach((b, i) => expect(b.moveIndex).toBeLessThanOrEqual(ends[i]));
    expect(tracker.boundaries[1].moveIndex).toBe(ends[1]);
    expect(tracker.boundaries.at(-1)!.moveIndex).toBe(total);
  });

  it("a block that appears by accident elsewhere doesn't hijack the analysis", () => {
    // With this first segment, some other orientation shows a finished first block one move
    // early — the real one (same place as before) must still win.
    const segments = ["F' U2 R2 D L'", "R U R' r' U' R2", "R U R' U R U2 R'", "M' U M", "U M2 U'", "M2 U2 M2 U2"];
    const { tracker, ends } = runSegments(ROUX, segments);
    expect(tracker.boundaries.map((b) => b.stage)).toEqual(ROUX.stages.map((s) => s.id));
    expect(tracker.boundaries[1].moveIndex).toBe(ends[1]);
    expect(tracker.boundaries[2].moveIndex).toBe(ends[2]);
  });

  it("orientation neutral too", () => {
    const segments = ["F' U2 R2 D L'", "R U R' r' U' R2", "R U R' U R U2 R'", "M' U M", "U M2 U'", "M2 U2 M2 U2"];
    const reference = stagesAt(runSegments(ROUX, segments).tracker);
    for (const frame of FRAMES) expect(stagesAt(runSegments(ROUX, segments, frame).tracker)).toBe(reference);
  });

  it("LSE edge orientation holds with the M slice a quarter off (the centres say where U / D are)", () => {
    for (const a of ["M", "M'", "M2", "U M'", "M U2 M'"]) expect(lseEo(applyMoves(solvedState(), a))).toBe(true);
    for (const a of ["M' U M", "M' U M M"]) expect(lseEo(applyMoves(solvedState(), a))).toBe(false); // four flipped, whatever the slice
  });
});

describe("Roux as a smart cube reports it (face turns relative to the centres)", () => {
  // reco.nz/solve/12811 — M turns come in as R L' with the centres still: the blocks sit a quarter or two off.
  const scramble = "F D L' D2 F2 R' F' R2 U' L2 F2 B2 D2 F2 L2 F' L' B2";
  const lines: [string, string][] = [
    ["y x'", "inspection"],
    ["U2' B2 U' B M2' U' F", "fb"],
    ["R' M' U' R' U R U2 R U'", "sb"],
    ["R' R' U R U R' U R U' R' U R", "sb"],
    ["U U' R' U2 R' D' R U2 R' D R2", "cmll"],
    ["U M' U M' U2 M U2 M'", "lse"],
    ["U' M' U2 M2' U2 M", "lse"],
  ];
  it("every stage lands in its own line", () => {
    const ranges: Record<string, [number, number]> = {};
    let n = 0;
    const faceTurns: Move[] = [];
    let frame = IDENTITY_FRAME;
    for (const [alg, stage] of lines) {
      const r = toFaceTurns(alg, frame);
      frame = r.frame;
      const first = n;
      faceTurns.push(...r.moves);
      n += r.moves.length;
      ranges[stage] = [ranges[stage]?.[0] ?? first, n];
    }
    const t = new MethodTracker(ROUX, applyMoves(solvedState(), scramble));
    for (const m of faceTurns) t.push(m);
    const at = Object.fromEntries(t.boundaries.map((b) => [b.stage, b.moveIndex]));
    for (const [stage, key] of [["fb", "fb"], ["sb", "sb"], ["cmll", "cmll"], ["l4e", "lse"]] as const) {
      const [lo, hi] = ranges[key];
      expect(`${stage} at ${at[stage]} in ${lo + 1}..${hi}: ${at[stage] > lo && at[stage] <= hi}`).toBe(`${stage} at ${at[stage]} in ${lo + 1}..${hi}: true`);
    }
    // Details as colours: whatever floor the smart cube thinks it's on.
    const detail = Object.fromEntries(t.boundaries.map((b) => [b.stage, b.detail]));
    expect(detail.fb?.length).toBe(2);
    expect(detail.fb?.[0]).toBe(detail.sb?.[0]);
    expect(detail.l4e).toBe(detail.fb?.[0]);
  });
});
