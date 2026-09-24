import { describe, expect, it } from "bun:test";
import { applyMoves, formatAlg, invert, parseAlg } from "@cubecore/core";
import { CFOP } from "@cubecore/cfop";
import { recording } from "@cubecore/timeline";
import { formatTime, fraction, stageMarkers, stepTime, tempoRecording } from "./model";

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
