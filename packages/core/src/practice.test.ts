import { describe, expect, it } from "bun:test";
import { PracticeTracker, applyMoves, invert, parseAlg, solvedState } from "./index";

const SUNE = "R U R' U R U2 R'";
const caseState = () => applyMoves(solvedState(), invert(parseAlg(SUNE)));
const feed = (t: PracticeTracker, moves: string, t0 = 0) => parseAlg(moves).map((m, i) => t.push(m, t0 + i * 200)).at(-1)!;

describe("practising an algorithm", () => {
  it("dots until done (reveal 'done'), all shown ('all'), dots to the end ('none')", () => {
    const t = new PracticeTracker(SUNE, caseState());
    expect(t.progress.practice.tokens.every((x) => !x.visible)).toBe(true);
    feed(t, "R U");
    expect(t.progress.practice.tokens.map((x) => x.visible)).toEqual([true, true, false, false, false, false, false]);
    expect(t.setReveal("all").practice.tokens.every((x) => x.visible)).toBe(true);
    expect(t.setReveal("none").practice.tokens.every((x) => !x.visible)).toBe(true);
  });

  it("a hint shows the next move; a slip counts a mistake and shows it too", () => {
    const t = new PracticeTracker(SUNE, caseState(), { reveal: "none" });
    expect(t.hint().practice.tokens[0].visible).toBe(true);
    feed(t, "R");
    let p = feed(t, "F");
    expect(p.practice.mistakes).toBe(1);
    expect(p.practice.tokens[1].visible).toBe(true); // the move that should have come
    p = feed(t, "F' U R' U R U2 R'");
    expect(p.complete).toBe(true);
    expect(p.practice.mistakes).toBe(1);
    expect(p.practice.differentAlg).toBe(false);
  });

  it("time and TPS; another algorithm that solves the case counts, flagged", () => {
    const t = new PracticeTracker(SUNE, caseState());
    const p = feed(t, "R U R' U R U U R'", 1000); // U2 as two quarters: still the written algorithm
    expect(p.complete && !p.practice.differentAlg).toBe(true);
    expect(p.practice.elapsedMs).toBe(1400);
    expect(Math.round(p.practice.tps * 10) / 10).toBe(5.7);
    // Reaching the end from off the written path = solved another way (here F' F2 instead of F).
    const d = new PracticeTracker("F", applyMoves(solvedState(), "F'"));
    const r = feed(d, "F' F2");
    expect(r.complete).toBe(true);
    expect(r.practice.differentAlg).toBe(true);
  });
});
