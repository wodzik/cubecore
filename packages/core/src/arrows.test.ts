import { describe, expect, it } from "bun:test";
import { turnArrow } from "./arrows";
import { parseAlg } from "./notation";
import { PracticeTracker } from "./practice";
import { SequenceTracker } from "./sequence";
import { solvedState } from "./state";

const mv = (s: string) => parseAlg(s)[0];

describe("turnArrow", () => {
  it("face, wide, slice and rotation layers; direction and half turns", () => {
    expect(turnArrow(mv("R"))).toEqual({ axis: 0, layers: [1], quarters: -1 });
    expect(turnArrow(mv("R'"))).toEqual({ axis: 0, layers: [1], quarters: 1 });
    expect(turnArrow(mv("U2"))).toEqual({ axis: 1, layers: [1], quarters: -2 });
    expect(turnArrow(mv("r"))).toEqual({ axis: 0, layers: [1, 0], quarters: -1 });
    expect(turnArrow(mv("M"))).toEqual({ axis: 0, layers: [0], quarters: 1 });
    expect(turnArrow(mv("y")).layers).toEqual([-1, 0, 1]);
    // The way it's written: R2' the other way than R2, R3 three quarters clockwise.
    expect(turnArrow(mv("R2")).quarters).toBe(-2);
    expect(turnArrow(mv("R2'")).quarters).toBe(2);
    expect(turnArrow(mv("R3")).quarters).toBe(-3);
  });
});

describe("nextTurn", () => {
  it("a wide move keeps both layers; after x the U turn is on the physical F", () => {
    const t = new SequenceTracker("r U", solvedState());
    expect(t.nextTurn).toEqual({ kind: "next", arrows: [{ axis: 0, layers: [1, 0], quarters: -1 }], token: 0 });
    t.push(mv("L")); // what the cube reports for r
    // Held x now: the written U is the physical F face (+z, clockwise = -1 about +z).
    expect(t.nextTurn!.arrows).toEqual([{ axis: 2, layers: [1], quarters: -1 }]);
    t.push(mv("F"));
    expect(t.nextTurn).toBeNull();
  });

  it("the rest of a half turn, the way it was started", () => {
    const t = new SequenceTracker("U2", solvedState());
    expect(t.nextTurn!.arrows[0].quarters).toBe(-2);
    t.push(mv("U'"));
    expect(t.nextTurn!.arrows).toEqual([{ axis: 1, layers: [1], quarters: 1 }]);
  });

  it("after a slip: the undo move", () => {
    const t = new SequenceTracker("R U", solvedState());
    t.push(mv("R"));
    t.push(mv("F"));
    expect(t.nextTurn).toEqual({ kind: "undo", arrows: [{ axis: 2, layers: [1], quarters: 1 }], token: null });
  });

  it("practice hides the arrow of a hidden move until a hint", () => {
    const t = new PracticeTracker("R U", solvedState(), { reveal: "none" });
    expect(t.nextTurn).toBeNull();
    t.hint();
    expect(t.nextTurn!.token).toBe(0);
    expect(new PracticeTracker("R U", solvedState(), { reveal: "all" }).nextTurn!.token).toBe(0);
  });
});
