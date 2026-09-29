import { describe, expect, it } from "bun:test";
import { SequenceTracker, applyMoves, formatAlg, parseAlg, solvedState, toFaceTurns, turnArrow } from "./index";

const S = solvedState();
const feed = (t: SequenceTracker, moves: string) => parseAlg(moves).map((m) => t.push(m)).at(-1)!;

describe("following a scramble", () => {
  it("counts moves, half turns done as quarters either way, and completes", () => {
    const t = new SequenceTracker("R U2 F'", S);
    expect(t.progress.tokens).toEqual(["current", "todo", "todo"]);
    let p = feed(t, "R U");
    expect(p.done).toBe(1);
    expect(p.partial).toBe(true);
    expect(p.tokens).toEqual(["done", "partial", "todo"]);
    p = feed(t, "U F'");
    expect(p.complete).toBe(true);
    const back = new SequenceTracker("R U2", S);
    expect(feed(back, "R U' U'").complete).toBe(true); // U2 as U' U'
  });

  it("opposite faces in the other order are fine", () => {
    const t = new SequenceTracker("R L' U", S);
    const p = feed(t, "L'");
    expect(p.undo).toEqual([]);
    expect(feed(t, "R U").complete).toBe(true);
  });

  it("moves on one axis in any order, interleaved: R2 L2 done as L R L R — no undo, both half done show partial, the arrows finish them", () => {
    const t = new SequenceTracker("F R2 L2 U", S);
    feed(t, "F");
    let p = feed(t, "L");
    expect(p.undo).toEqual([]);
    expect(p.tokens).toEqual(["done", "current", "partial", "todo"]);
    expect(t.nextTurn?.kind).toBe("finish");
    expect(t.nextTurn?.arrows).toEqual([turnArrow({ family: "L", amount: 1 })]);
    p = feed(t, "R");
    expect(p.undo).toEqual([]);
    expect(p.tokens).toEqual(["done", "partial", "partial", "todo"]);
    expect(t.nextTurn?.arrows.length).toBe(2); // the rest of both
    p = feed(t, "L");
    expect(p.tokens).toEqual(["done", "partial", "done", "todo"]);
    expect(t.nextTurn?.arrows).toEqual([turnArrow({ family: "R", amount: 1 })]);
    p = feed(t, "R");
    expect(p.tokens).toEqual(["done", "done", "done", "current"]);
    expect(p.done).toBe(3);
    expect(t.nextTurn?.kind).toBe("next");
    expect(feed(t, "U").complete).toBe(true);
    expect(t.nextTurn).toBeNull();
    // Either way round, and the second face first in full.
    const u = new SequenceTracker("R2 L2", S);
    expect(feed(u, "R' L2").tokens).toEqual(["partial", "done"]);
    expect(feed(u, "R'").complete).toBe(true);
    const v = new SequenceTracker("U D'", S);
    expect(feed(v, "D'").tokens).toEqual(["current", "done"]);
    expect(v.nextTurn?.kind).toBe("next");
  });

  it("another face in the middle of a half turn is a slip: undo it, then finish the half turn", () => {
    const t = new SequenceTracker("L2 U2", S);
    let p = feed(t, "L U");
    expect(formatAlg(p.undo)).toBe("U'");
    expect(p.wrongWay).toBe(false);
    expect(t.nextTurn?.kind).toBe("undo");
    p = feed(t, "U'");
    expect(p.undo).toEqual([]);
    expect(p.tokens).toEqual(["partial", "todo"]);
    expect(t.nextTurn?.kind).toBe("finish");
    expect(feed(t, "L U2").complete).toBe(true);
  });

  it("a face of the axis still to do, turned the wrong way, is no slip either", () => {
    const t = new SequenceTracker("R L", S);
    const p = feed(t, "L'");
    expect(p.wrongWay).toBe(true);
    expect(p.tokens).toEqual(["current", "wrong-way"]);
    expect(t.nextTurn?.kind).toBe("wrong-way");
    expect(feed(t, "L2 R").complete).toBe(true);
  });

  it("a slip gives the undo; fixing it puts the cube back on track", () => {
    const t = new SequenceTracker("R U F", S);
    feed(t, "R");
    let p = feed(t, "F");
    expect(formatAlg(p.undo)).toBe("F'");
    expect(p.done).toBe(1);
    p = feed(t, "U");
    expect(formatAlg(p.undo)).toBe("U' F'");
    p = feed(t, "U' F'");
    expect(p.undo).toEqual([]);
    expect(feed(t, "U F").complete).toBe(true);
  });

  it("a long slip asks for a reset", () => {
    const t = new SequenceTracker("R", S, { maxCorrection: 3 });
    expect(feed(t, "U F D B").needsReset).toBe(true);
  });

  it("algorithms with slices and rotations are followed as the face turns the cube reports", () => {
    const t = new SequenceTracker("M' U M", applyMoves(S, "R"));
    // M' = R' L + x: the cube reports R' and L (any order), then the U of the rotated grip, …
    const p = feed(t, "L R'");
    expect(p.tokens[0]).toBe("done");
    expect(t.steps.length).toBe(5);
  });

  it("starts from how the cube is held (after an algorithm with a net rotation)", () => {
    // After M' (net x) the holder's U is the cube's F: the next "U" is reported as F.
    const { frame } = toFaceTurns("M'");
    const t = new SequenceTracker("U R", S, { frame });
    expect(t.steps.map((s) => formatAlg([s.move]))).toEqual(["F", "R"]);
    expect(feed(t, "F R").complete).toBe(true);
  });

  it("the move due turned the wrong way is no slip: that move shows it, turning on (or back) fixes it", () => {
    const t = new SequenceTracker("R U F", S);
    feed(t, "R");
    let p = feed(t, "U'");
    expect(p.wrongWay).toBe(true);
    expect(p.tokens).toEqual(["done", "wrong-way", "todo"]);
    expect(t.nextTurn?.kind).toBe("wrong-way");
    // U' instead of U: two quarter turns the way U goes to where it should be.
    expect(t.nextTurn?.arrows[0].quarters).toBe(-2 * Math.sign(turnArrow({ family: "U", amount: -1 }).quarters));
    p = feed(t, "U U"); // on round the right way
    expect(p.wrongWay).toBe(false);
    expect(p.tokens).toEqual(["done", "done", "current"]);
    const other = new SequenceTracker("R U F", S);
    p = feed(other, "L");
    expect(p.wrongWay).toBe(false); // another face: a real slip
    expect(p.undo.length).toBe(1);
  });
});
