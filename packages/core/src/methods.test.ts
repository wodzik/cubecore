import { describe, expect, it } from "bun:test";
import {
  CFOP,
  FACES,
  FRAMES,
  LBL,
  type Method,
  MethodTracker,
  PETRUS,
  ROUX,
  ZZ,
  applyMoves,
  colorAt,
  formatAlg,
  invert,
  isSolved,
  parseAlg,
  solvedState,
  transformMoves,
  view,
} from "./index";

const S = solvedState();

describe("frames", () => {
  it("there are 24 distinct orientations, each a permutation of the 54 facelets", () => {
    expect(FRAMES.length).toBe(24);
    expect(new Set(FRAMES.map((f) => `${f.face.U}${f.face.F}`)).size).toBe(24);
    for (const f of FRAMES) expect(new Set(f.map).size).toBe(54);
  });

  it("transformMoves does the same thing seen from another frame", () => {
    const alg = parseAlg("R U R' F' r M2 E x y' z2 S d' b");
    const canonical = applyMoves(S, alg);
    for (const frame of FRAMES) {
      const physical = applyMoves(S, transformMoves(alg, frame));
      const seen = view(physical, frame);
      // colour classes are relabelled by the frame (physical colours of the canonical faces)
      const relabel = (c: number) => FACES.indexOf(frame.face[FACES[c]]);
      for (let i = 0; i < 54; i++) expect(colorAt(seen, i)).toBe(relabel(colorAt(canonical, i)));
    }
  });
});

/**
 * A solve built backwards: `segments` are the solver's steps; the scramble is
 * their inverse, so after segment k exactly the first k stages are done —
 * provided later segments don't disturb earlier stages (true for the algs used).
 */
function run(method: Method, segments: string[], frame = FRAMES[0]) {
  const moves = segments.map((s) => transformMoves(parseAlg(s), frame));
  const all = moves.flat();
  const tracker = new MethodTracker(method, applyMoves(S, invert(all)));
  all.forEach((m, i) => tracker.push(m, i * 100));
  const ends = moves.map((_, k) => moves.slice(0, k + 1).flat().length);
  return { tracker, ends, total: all.length };
}

// CFOP: cross, 4 pair inserts that only touch their own slot + U, OLL (Sune), PLL (T), AUF.
const CFOP_SOLVE = ["F2 R' D L2", "R U R'", "L' U' L", "R' U' R", "L U L'", "R U R' U R U2 R'", "R U R' U' R' F R2 U' R' U' R U R' F'", "U"];

describe("CFOP", () => {
  it("finds every stage exactly where it happens, with the slots in physical terms", () => {
    const { tracker, ends } = run(CFOP, CFOP_SOLVE);
    expect(tracker.boundaries.map((b) => [b.stage, b.moveIndex])).toEqual([
      ["cross", ends[0]],
      ["f2l-1", ends[1]],
      ["f2l-2", ends[2]],
      ["f2l-3", ends[3]],
      ["f2l-4", ends[4]],
      ["oll", ends[5]],
      ["pll", ends[6]],
      ["auf", ends[7]],
    ]);
    expect(tracker.boundaries.slice(1, 5).map((b) => b.detail)).toEqual(["FR", "FL", "BR", "BL"]);
    expect(tracker.bottomFace).toBe("D");
    expect(tracker.boundaries[3].time).toBe((ends[3] - 1) * 100);
  });

  it("is orientation / colour neutral: the same solve on any of the 24 frames gives the same stages", () => {
    const reference = run(CFOP, CFOP_SOLVE).tracker.boundaries.map((b) => `${b.stage}@${b.moveIndex}`);
    for (const frame of FRAMES) {
      const { tracker } = run(CFOP, CFOP_SOLVE, frame);
      expect(`${frame.id}: ${tracker.boundaries.map((b) => `${b.stage}@${b.moveIndex}`).join(" ")}`).toBe(`${frame.id}: ${reference.join(" ")}`);
      expect(tracker.bottomFace).toBe(frame.face.D); // the cross face is found, wherever it is
    }
  });

  it("stages already done in the scramble are reported at move 0, several on the same move", () => {
    // "R U R'" only disturbs the FR slot: cross and the other three pairs are done before any move.
    const t = new MethodTracker(CFOP, applyMoves(S, "R U R'"));
    expect(t.boundaries.map((b) => [b.stage, b.moveIndex, b.detail])).toEqual([
      ["cross", 0, undefined],
      ["f2l-1", 0, "FL"],
      ["f2l-2", 0, "BR"],
      ["f2l-3", 0, "BL"],
    ]);
    t.push("R U' R'");
    expect(t.boundaries.find((b) => b.stage === "f2l-4")).toEqual({ stage: "f2l-4", moveIndex: 3, detail: "FR" });
    expect(t.current.done).toBe(true);
  });
});

describe("LBL", () => {
  it("cross, four corners, four edges, two orientation halves, corner and edge permutation", () => {
    const { tracker } = run(LBL, [
      "F2 R' D L2",
      "R U R' U'", "L' U' L U", "R' U' R U", "L U L' U'",
      "U R U' R' U' F' U F", "U' L' U L U F U' F'", "U' R' U R U B U' B'", "U L U' L' U' B' U B",
      "F R U R' U' F'", "R U R' U R U2 R'",
      "R' F R' B2 R F' R' B2 R2", "R U' R U R U R U' R' U' R2", "U",
    ]);
    expect(tracker.boundaries.map((b) => b.stage)).toEqual(LBL.stages.map((s) => s.id));
    expect(tracker.boundaries.find((b) => b.stage === "oll-1")!.detail).toBe("edges");
  });
});

describe("Roux", () => {
  it("first block, second block, CMLL, EO, UL/UR, L4E — with M slices moving the centres", () => {
    const segments = ["F' U2 L' D R2", "R U R' r' U' R2", "R U R' U R U2 R'", "M' U M", "U M2 U'", "M2 U2 M2 U2"];
    const { tracker, ends, total } = run(ROUX, segments);
    const got = tracker.boundaries.map((b) => b.stage);
    expect(got).toEqual(ROUX.stages.map((s) => s.id));
    // Each stage is reached no later than the end of its own segment, in order.
    tracker.boundaries.forEach((b, i) => expect(b.moveIndex).toBeLessThanOrEqual(ends[i]));
    expect(tracker.boundaries[1].moveIndex).toBe(ends[1]);
    expect(tracker.boundaries.at(-1)!.moveIndex).toBe(total);
  });

  it("a block that appears by accident elsewhere doesn't hijack the analysis", () => {
    // With this first segment, some other orientation shows a finished first block one move
    // early — the real one (same place as before) must still win.
    const segments = ["F' U2 R2 D L'", "R U R' r' U' R2", "R U R' U R U2 R'", "M' U M", "U M2 U'", "M2 U2 M2 U2"];
    const { tracker, ends } = run(ROUX, segments);
    expect(tracker.boundaries.map((b) => b.stage)).toEqual(ROUX.stages.map((s) => s.id));
    expect(tracker.boundaries[1].moveIndex).toBe(ends[1]);
    expect(tracker.boundaries[2].moveIndex).toBe(ends[2]);
  });

  it("orientation neutral too", () => {
    const segments = ["F' U2 R2 D L'", "R U R' r' U' R2", "R U R' U R U2 R'", "M' U M", "U M2 U'", "M2 U2 M2 U2"];
    const reference = run(ROUX, segments).tracker.boundaries.map((b) => `${b.stage}@${b.moveIndex}`).join(" ");
    for (const frame of FRAMES) expect(run(ROUX, segments, frame).tracker.boundaries.map((b) => `${b.stage}@${b.moveIndex}`).join(" ")).toBe(reference);
  });
});

describe("ZZ", () => {
  it("EOLine, two blocks (either order), last layer", () => {
    const { tracker } = run(ZZ, ["F B' D L2 R U2", "L U L' U' L2", "R U R' U2 R' U' R", "R U R' U R U2 R'", "R U R' U' R' F R2 U' R' U' R U R' F'", "U2"]);
    expect(tracker.boundaries.map((b) => b.stage)).toEqual(ZZ.stages.map((s) => s.id));
    expect(tracker.boundaries[1].detail).toBe("left");
  });
});

describe("Petrus", () => {
  it("2×2×2, 2×2×3, EO, F2L, last layer", () => {
    const { tracker } = run(PETRUS, ["D F2 L U' B", "F' R2 F2", "F R U R' U' F'", "R U R' U R U' R'", "R U R' U R U2 R'", "R U R' U' R' F R2 U' R' U' R U R' F'", "U'"]);
    expect(tracker.boundaries.map((b) => b.stage)).toEqual(PETRUS.stages.map((s) => s.id));
  });
});

describe("sanity", () => {
  it("every method ends on a solved cube", () => {
    for (const m of [CFOP, LBL, ROUX, ZZ, PETRUS]) expect(m.stages.at(-1)!.done(S)).toBe(true);
    expect(isSolved(S)).toBe(true);
    expect(formatAlg(invert(parseAlg("R U")))).toBe("U' R'");
  });
});
