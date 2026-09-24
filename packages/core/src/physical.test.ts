import { describe, expect, it } from "bun:test";
import { FRAMES, IDENTITY_FRAME, MoveCollapser, OrientationTracker, applyMoves, collapseMoves, formatAlg, parseAlg, solvedState, statesEqual, toFaceTurns, view } from "./index";

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

describe("move log (smart cube → written moves)", () => {
  const run = (text: string, gaps = 50, options?: ConstructorParameters<typeof MoveCollapser>[0]) => {
    const log = new MoveCollapser(options);
    parseAlg(text).forEach((m, i) => log.push(m, i * gaps));
    return formatAlg(log.moves.map((m) => m.move));
  };

  it("doubles become half turns; nothing that happened is cancelled", () => {
    expect(run("R R")).toBe("R2");
    expect(run("R R R")).toBe("R2 R");
    expect(run("R R R'")).toBe("R2 R'");
    expect(run("R R'")).toBe("R R'");
    expect(run("U' U' F F F F")).toBe("U2 F2 F2");
  });

  it("opposite faces turned together the same way are a slice, in either order", () => {
    expect(run("R L'")).toBe("M");
    expect(run("L' R")).toBe("M");
    expect(run("R' L")).toBe("M'");
    expect(run("U D'")).toBe("E");
    expect(run("F' B")).toBe("S");
    expect(run("R L")).toBe("R L"); // same direction of each face = not a slice
    expect(run("R L' R L'")).toBe("M2");
    expect(run("R2 L2")).toBe("M2");
  });

  it("slices only when the two turns come together; windows are adjustable", () => {
    expect(run("R L'", 1000)).toBe("R L'");
    expect(run("R L'", 1000, { sliceWindowMs: Infinity })).toBe("M");
    expect(run("R R", 1000, { repeatWindowMs: 300 })).toBe("R R");
  });

  it("changes are reported as 'drop n from the end, append these' — and match the log", () => {
    const log = new MoveCollapser();
    const shown: string[] = [];
    parseAlg("R U U L' R L'").forEach((m, i) => {
      const { removed, added } = log.push(m, i * 50);
      shown.splice(shown.length - removed, removed, ...added.map((a) => formatAlg([a.move])));
    });
    expect(shown.join(" ")).toBe(formatAlg(log.moves.map((m) => m.move)));
    expect(shown.join(" ")).toBe("R U2 M L'");
    // Without times everything counts as together; with times R2 … L2 a second apart stay two moves.
    expect(formatAlg(collapseMoves(parseAlg("R R L' L'")))).toBe("M2");
    expect(formatAlg(collapseMoves(parseAlg("R R L' L'"), [0, 50, 1000, 1050]))).toBe("R2 L2");
  });
});
