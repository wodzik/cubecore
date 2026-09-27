import { describe, expect, it } from "bun:test";
import { runSegments } from "@cubecore/core/testing";
import { LBL } from "./index";

describe("LBL", () => {
  it("cross, four corners, four edges, two orientation halves, corner and edge permutation", () => {
    const { tracker } = runSegments(LBL, [
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
