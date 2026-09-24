import { describe, expect, it } from "bun:test";
import { spinsAfter } from "./centers";
import { solvedState } from "./state";

const S = solvedState();
const U = 0, R = 1, F = 2;

describe("centre spins", () => {
  it("a clockwise face turn spins its centre clockwise (3 CCW quarters); four bring it back", () => {
    expect(spinsAfter(S, "U")[U]).toBe(3);
    expect(spinsAfter(S, "U'")[U]).toBe(1);
    expect(spinsAfter(S, "U2")[U]).toBe(2);
    expect(spinsAfter(S, "U U U U")[U]).toBe(0);
    expect(spinsAfter(S, "R U R' U'")[F]).toBe(0);
  });

  it("other layers leave a centre alone", () => {
    expect(Array.from(spinsAfter(S, "R U"))).toEqual([3, 3, 0, 0, 0, 0]);
  });

  it("rotations carry centres to other faces with the right spin", () => {
    // x: U centre goes to B; its up (−z on U, towards B) becomes −y — on B "up" is +y, so spin 2.
    expect(spinsAfter(S, "x")[U]).toBe(2);
    // x x' is nothing; x4 is nothing.
    expect(Array.from(spinsAfter(S, "x x'"))).toEqual([0, 0, 0, 0, 0, 0]);
    expect(Array.from(spinsAfter(S, "x x x x"))).toEqual([0, 0, 0, 0, 0, 0]);
    // y spins U clockwise like U does.
    expect(spinsAfter(S, "y")[U]).toBe(3);
    expect(spinsAfter(S, "y")[R]).toBe(0);
  });

  it("slice moves carry centres too, and M4 is nothing", () => {
    expect(Array.from(spinsAfter(S, "M M M M"))).toEqual([0, 0, 0, 0, 0, 0]);
    expect(spinsAfter(S, "E")[F]).toBe(0);
  });
});
