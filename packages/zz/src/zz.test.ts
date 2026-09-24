import { describe, expect, it } from "bun:test";
import { runSegments } from "@cubecore/core/testing";
import { ZZ } from "./index";

describe("ZZ", () => {
  it("EOLine, two blocks (either order), last layer", () => {
    const { tracker } = runSegments(ZZ, ["F B' D L2 R U2", "L U L' U' L2", "R U R' U2 R' U' R", "R U R' U R U2 R'", "R U R' U' R' F R2 U' R' U' R U R' F'", "U2"]);
    expect(tracker.boundaries.map((b) => b.stage)).toEqual(ZZ.stages.map((s) => s.id));
    expect(tracker.boundaries[1].detail).toBe("left");
  });
});
