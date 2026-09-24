import { describe, expect, it } from "bun:test";
import { FRAMES } from "@cubecore/core";
import { runSegments, stagesAt } from "@cubecore/core/testing";
import { ROUX } from "./index";

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
});
