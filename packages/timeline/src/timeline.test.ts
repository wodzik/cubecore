import { describe, expect, it } from "bun:test";
import { CFOP, formatAlg, formatMove, invert, parseAlg } from "@cubecore/core";
import { type ClockHost, ReplayClock, decodeRecording, encodeRecording, moveWindows, positionAt, recording, stageTimings } from "./index";

const SOLUTION = "F2 R' D L2 R U R' L' U' L R' U' R L U L' R U R' U R U2 R' R U R' U' R' F R2 U' R' U' R U R' F' U";
function solve(): ReturnType<typeof recording> {
  const moves = parseAlg(SOLUTION);
  // quarter-turn-ish rhythm with a 900 ms look before each stage start
  const stageStarts = new Set([0, 4, 7, 10, 13, 16, 23, 37]);
  let t = 0;
  const timed = moves.map((m, i) => {
    t += stageStarts.has(i) ? 900 : 120;
    return [formatMove(m), t] as [string, number];
  });
  return recording(formatAlg(invert(moves)), timed, t + 50);
}

describe("recording", () => {
  it("builds from strings and rejects time going backwards", () => {
    const r = recording("R U", [["R", 100], ["U'", 250]], 300);
    expect(r.moves.map((m) => [formatMove(m.move), m.t])).toEqual([["R", 100], ["U'", 250]]);
    expect(() => recording("", [["R", 200], ["U", 100]])).toThrow();
    expect(() => recording("", [["R U", 1]])).toThrow();
  });
});

describe("codec", () => {
  it("round-trips every move family, the scramble, times to 10 ms and the total", () => {
    const r = recording("R U2 F' x M' r2 E S' y2 z b", [["M", 95], ["r'", 204], ["x2", 204], ["U", 1234], ["d", 4001]], 4100);
    const back = decodeRecording(encodeRecording(r))!;
    expect(formatAlg(back.scramble)).toBe(formatAlg(r.scramble));
    expect(back.moves.map((m) => formatMove(m.move))).toEqual(r.moves.map((m) => formatMove(m.move)));
    back.moves.forEach((m, i) => expect(Math.abs(m.t - r.moves[i].t)).toBeLessThanOrEqual(5));
    expect(back.totalMs).toBe(4100);
  });

  it("is compact and URL-safe: 38 timed moves + a 38-move scramble fit in ~135 characters", () => {
    const enc = encodeRecording(solve());
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
    // 76 moves × 6 bits + one varint per time delta.
    expect(enc.length).toBeLessThan(150);
  });

  it("rejects garbage, every truncation and trailing bytes", () => {
    const enc = encodeRecording(solve());
    for (const bad of ["", "!", "A", "AAAA", "not a recording"]) expect(decodeRecording(bad)).toBeNull();
    for (let i = 0; i < enc.length - 1; i++) expect(decodeRecording(enc.slice(0, i))).toBeNull();
    expect(decodeRecording(enc + "AA")).toBeNull();
  });
});

describe("replay position", () => {
  const r = recording("", [["R", 1000], ["U", 1050], ["R'", 2000]], 2100);

  it("each move ends at its recorded time, lasts at most maxAnimMs and never overlaps the previous one", () => {
    expect(moveWindows(r, { maxAnimMs: 150 })).toEqual([[850, 1000], [1000, 1050], [1850, 2000]]);
  });

  it("reports applied moves and the one animating", () => {
    expect(positionAt(r, 0)).toEqual({ applied: 0 });
    expect(positionAt(r, 925)).toEqual({ applied: 0, active: { index: 0, progress: 0.5 } });
    expect(positionAt(r, 1000)).toEqual({ applied: 1 });
    expect(positionAt(r, 1025)).toEqual({ applied: 1, active: { index: 1, progress: 0.5 } });
    expect(positionAt(r, 1500)).toEqual({ applied: 2 });
    expect(positionAt(r, 9999)).toEqual({ applied: 3 });
  });
});

describe("ReplayClock", () => {
  function fakeHost() {
    let now = 0;
    let pending: (() => void) | null = null;
    const host: ClockHost = { now: () => now, frame: (cb) => ((pending = cb), () => (pending = null)) };
    const advance = (ms: number) => {
      now += ms;
      const cb = pending;
      pending = null;
      cb?.();
    };
    return { host, advance };
  }
  const r = recording("", [["R", 1000], ["U", 2000]], 3000);

  it("plays in real time, honours rate, pauses and seeks", () => {
    const { host, advance } = fakeHost();
    const clock = new ReplayClock(r, {}, host);
    const seen: number[] = [];
    clock.onChange((_, pos) => seen.push(pos.applied));
    clock.play();
    advance(1000);
    expect(clock.currentTime).toBe(1000);
    expect(seen.at(-1)).toBe(1);
    clock.rate = 2;
    advance(500); // 1000 ms of recording
    expect(clock.currentTime).toBe(2000);
    clock.pause();
    advance(5000);
    expect(clock.currentTime).toBe(2000);
    clock.seekToMove(0);
    expect(clock.currentTime).toBe(1000);
    clock.seek(99999);
    expect(clock.currentTime).toBe(3000);
  });

  it("stops at the end and restarts from 0 on play", () => {
    const { host, advance } = fakeHost();
    const clock = new ReplayClock(r, {}, host);
    clock.play();
    advance(10000);
    expect(clock.currentTime).toBe(3000);
    expect(clock.isPlaying).toBe(false);
    clock.play();
    expect(clock.currentTime).toBe(0);
  });
});

describe("stage timings", () => {
  it("splits a CFOP solve into stages with recognition and execution", () => {
    const t = stageTimings(CFOP, solve());
    expect(t.stages.map((s) => [s.stage, s.moveCount])).toEqual([
      ["cross", 4], ["f2l-1", 3], ["f2l-2", 3], ["f2l-3", 3], ["f2l-4", 3], ["oll", 7], ["pll", 14], ["auf", 1],
    ]);
    // Each stage starts with a 900 ms look; the first move itself is ~120 ms of it.
    for (const s of t.stages) expect(s.recognitionMs).toBe(780);
    for (const s of t.stages) expect(s.recognitionMs + s.executionMs).toBe(s.totalMs);
    expect(t.stages.at(-1)!.endMs).toBe(solve().moves.at(-1)!.t);
    expect(t.fluency!).toBeGreaterThan(0);
    expect(t.fluency!).toBeLessThan(1);
    expect(t.bottomFace).toBe("D");
  });
});
