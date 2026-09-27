import { describe, expect, it } from "bun:test";
import { runSegments } from "@cubecore/core/testing";
import { PETRUS } from "./index";

describe("Petrus", () => {
  it("2×2×2, 2×2×3, EO, F2L, last layer", () => {
    const { tracker } = runSegments(PETRUS, ["D F2 L U' B", "F' R2 F2", "F R U R' U' F'", "R U R' U R U' R'", "R U R' U R U2 R'", "R U R' U' R' F R2 U' R' U' R U R' F'", "U'"]);
    expect(tracker.boundaries.map((b) => b.stage)).toEqual(PETRUS.stages.map((s) => s.id));
  });
});
