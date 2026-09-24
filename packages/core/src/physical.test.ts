import { describe, expect, it } from "bun:test";
import { FRAMES, IDENTITY_FRAME, MoveCollapser, OrientationTracker, applyMoves, collapseRepeats, formatAlg, parseAlg, solvedState, statesEqual, toFaceTurns, view } from "./index";

const S = solvedState();

describe("face turns a smart cube reports", () => {
  it("wide moves, slices and rotations become face turns plus a change of grip", () => {
    expect(formatAlg(toFaceTurns("r U").moves)).toBe("L F");
    expect(formatAlg(toFaceTurns("R U R'").moves)).toBe("R U R'");
    expect(formatAlg(toFaceTurns("x U").moves)).toBe("F");
    expect(toFaceTurns("M").moves.map((m) => m.family).sort()).toEqual(["L", "R"]);
    expect(formatAlg(toFaceTurns("M2 U2 M2").moves)).toBe("L2 R2 D2 L2 R2");
    expect(toFaceTurns("y y' x x'").frame).toBe(IDENTITY_FRAME);
  });

  it("face turns seen through the final grip are exactly the algorithm's result — for any algorithm", () => {
    const algs = ["r U R' U' M", "x' R2 D2 R' U' R D2 R' U R'", "M' U M U2 M' U M", "f R U R' U' f' y2 u' R", "S E M' z y' b d l", "Rw U Rw' U' L' U2 x"];
    for (const text of algs) {
      const alg = parseAlg(text);
      const { moves, frame } = toFaceTurns(alg);
      expect(`${text}: ${statesEqual(view(applyMoves(S, moves), frame), applyMoves(S, alg))}`).toBe(`${text}: true`);
    }
  });

  it("the tracker knows where the centres are after an algorithm with slices (Roux LSE)", () => {
    const t = new OrientationTracker();
    t.push("M' U M");
    expect(t.centers.U).toBe("U"); // M' then M: back where it was
    t.push("M");
    expect(t.centers.U).toBe("B"); // M brings B up
    expect(t.centers.F).toBe("U");
    expect(FRAMES).toContain(t.frame);
  });
});

describe("collapseRepeats", () => {
  it("merges identical consecutive turns only; R R' stays", () => {
    expect(formatAlg(collapseRepeats(parseAlg("R R U U U F F F F D")))).toBe("R2 U' D");
    expect(formatAlg(collapseRepeats(parseAlg("R R' R")))).toBe("R R' R");
  });
});

describe("MoveCollapser (live log)", () => {
  it("R, R → R2 as they arrive; four turns vanish; R R' stays; times follow the latest turn", () => {
    const log = new MoveCollapser();
    const push = (m: string, t: number) => log.push(parseAlg(m)[0], t);
    expect([push("R", 0), push("R", 100), push("U'", 200), push("U'", 300), push("U'", 400), push("F", 500), push("F'", 600)]).toEqual([
      "append", "merge", "append", "merge", "merge", "append", "append",
    ]);
    expect(formatAlg(log.moves.map((m) => m.move))).toBe("R2 U F F'");
    expect(log.moves[0].time).toBe(100);
    for (let t = 0; t < 4; t++) push("D", 1000 + t);
    expect(formatAlg(log.moves.map((m) => m.move))).toBe("R2 U F F'");
  });

  it("an optional time window keeps slow repeats apart", () => {
    const log = new MoveCollapser(300);
    log.push(parseAlg("R")[0], 0);
    log.push(parseAlg("R")[0], 1000);
    expect(formatAlg(log.moves.map((m) => m.move))).toBe("R R");
  });
});
