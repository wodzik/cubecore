import { describe, expect, it } from "bun:test";
import { SequenceTracker, applyMoves, formatAlg, parseAlg, solvedState, toFaceTurns } from "./index";

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
});
