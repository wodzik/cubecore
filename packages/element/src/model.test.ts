import { describe, expect, it } from "bun:test";
import { applyMoves, formatAlg, invert, isSolved, parseAlg, solvedState, statesEqual } from "@cubecore/core";
import { CFOP } from "@cubecore/cfop";
import { recording } from "@cubecore/timeline";
import { formatTime, fraction, segmentText, stageMarkers, startMoves, stepTime, tempoRecording } from "./model";

describe("player model", () => {
  it("formats times like a timer", () => {
    expect(formatTime(0)).toBe("0.00");
    expect(formatTime(12345)).toBe("12.35");
    expect(formatTime(62340)).toBe("1:02.34");
  });

  it("plays an algorithm at a steady tempo", () => {
    const { recording: rec, interval } = tempoRecording("R U R' U'", 2);
    expect(interval).toBe(500);
    expect(rec.moves.map((m) => m.t)).toEqual([500, 1000, 1500, 2000]);
    expect(rec.totalMs).toBe(2000);
    expect(formatAlg(rec.moves.map((m) => m.move))).toBe("R U R' U'");
  });

  it("steps move by move, forwards and back", () => {
    const rec = recording("", [["R", 300], ["U", 700], ["R'", 1000]], 1200);
    expect(stepTime(rec, 0, 1)).toBe(300);
    expect(stepTime(rec, 300, 1)).toBe(700);
    expect(stepTime(rec, 1000, 1)).toBe(1200);
    expect(stepTime(rec, 1200, -1)).toBe(1000);
    expect(stepTime(rec, 500, -1)).toBe(300);
    expect(stepTime(rec, 300, -1)).toBe(0);
    expect(fraction(600, 1200)).toBe(0.5);
  });

  it("marks where the stages of a method end", () => {
    const solve = parseAlg("F2 R' D L2 R U R' L' U' L R' U' R L U L'");
    const rec = recording(formatAlg(invert(solve)), solve.map((m, i) => [formatAlg([m]), (i + 1) * 100] as [string, number]));
    const marks = stageMarkers(CFOP, rec);
    expect(marks[0]).toEqual({ time: 400, label: "Cross" });
    expect(marks.length).toBeGreaterThanOrEqual(5);
    expect(applyMoves).toBeDefined();
  });
});

describe("where an algorithm starts", () => {
  const alg = parseAlg("R U R' U R U2 R'");
  it("anchor start: from solved (plus setup); anchor end: the algorithm solves the cube", () => {
    expect(startMoves("", alg)).toEqual([]);
    const start = applyMoves(solvedState(), startMoves("", alg, "end"));
    expect(isSolved(applyMoves(start, alg))).toBe(true);
    // With a setup, "end" lands back on the setup state.
    const setup = "F2 D";
    const s2 = applyMoves(solvedState(), startMoves(setup, alg, "end"));
    expect(statesEqual(applyMoves(s2, alg), applyMoves(solvedState(), setup))).toBe(true);
  });
});

describe("segment tooltip text", () => {
  it("label, detail, time split into recognition and execution, moves", () => {
    expect(segmentText({ start: 1000, end: 4210, split: 1800, label: "F2L 2", detail: "FL", moves: 9 })).toBe("F2L 2 · FL · 3.21 s (recognition 0.80 · execution 2.41) · 9 moves");
    expect(segmentText({ start: 0, end: 1500, label: "Cross", moves: 1 })).toBe("Cross · 1.50 s · 1 move");
  });
});
