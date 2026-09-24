import { describe, expect, it } from "bun:test";
import { Vector3 } from "three";
import { arrowSpan, buildArrows, facingT, loopPoint } from "./arrows";

describe("turn arrows", () => {
  it("the loop runs just above the faces, round over the edges", () => {
    const [u, v] = loopPoint(0);
    expect(u).toBeCloseTo(1.72);
    expect(v).toBeCloseTo(0);
    const [cu, cv] = loopPoint(0.5); // the corner
    expect(Math.hypot(cu - 1.5, cv - 1.5)).toBeCloseTo(0.22);
    const [bu, bv] = loopPoint(1); // next side, counter-clockwise
    expect(bu).toBeCloseTo(0);
    expect(bv).toBeCloseTo(1.72);
    expect(loopPoint(-1)[1]).toBeCloseTo(-1.72);
  });

  it("faces the camera: a corner or the middle of a side", () => {
    expect(facingT(1, new Vector3(1, 1, 1))).toBe(0.5); // U layer seen from the URF corner
    expect(facingT(1, new Vector3(0, 1, 5))).toBe(0); // straight at F (e1 = z for the y axis)
    expect(facingT(1, new Vector3(0, 5, 0))).toBe(0.5); // down the axis
  });

  it("single = a quarter of the way round, double = half; the direction follows the sign", () => {
    expect(arrowSpan(-1, 0.5)).toEqual({ from: 1, to: 0 });
    expect(arrowSpan(1, 0.5)).toEqual({ from: 0, to: 1 });
    expect(arrowSpan(2, 0.5)).toEqual({ from: -0.5, to: 1.5 });
  });

  it("one arrow per layer, two heads for a double", () => {
    const count = (quarters: 1 | 2, layers: number[], outline: string | null) =>
      buildArrows([{ axis: 0, layers, quarters }], [0.5], { outline }).children.length;
    expect(count(1, [1], null)).toBe(2); // shaft + head
    expect(count(2, [1], null)).toBe(3); // shaft + 2 heads
    expect(count(1, [1, 0], null)).toBe(4); // wide: two arrows
    expect(count(1, [1], "#000")).toBe(4); // with outlines
  });
});
