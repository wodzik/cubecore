import { describe, expect, it } from "bun:test";
import { DNF, ao, bestAo, mo, sessionStats, trimCount } from "./stats";

describe("solve statistics", () => {
  it("WCA averages: best and worst dropped, DNF counts as worst", () => {
    expect(ao([10, 12, 11, 30, 9], 5)).toBe(11);
    expect(ao([10, 12, 11, DNF, 9], 5)).toBe(11);
    expect(ao([10, DNF, 11, DNF, 9], 5)).toBe(DNF);
    expect(ao([1, 2, 3], 5)).toBeNull();
    expect([trimCount(5), trimCount(12), trimCount(50), trimCount(100)]).toEqual([1, 1, 3, 5]);
  });

  it("mo3, best rolling average, a session summary", () => {
    expect(mo([9, 10, 11, 12], 3)).toBe(11);
    expect(mo([9, DNF, 11], 3)).toBe(DNF);
    expect(bestAo([20, 20, 20, 20, 20, 10, 10, 10, 10], 5)).toBe(10);
    const s = sessionStats([12, 10, DNF, 11, 13]);
    expect([s.count, s.finished, s.best, s.worst, s.ao5]).toEqual([5, 4, 10, 13, 12]);
  });
});
