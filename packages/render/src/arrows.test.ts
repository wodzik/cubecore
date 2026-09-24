import { describe, expect, it } from "bun:test";
import { Vector3 } from "three";
import { arrowCentre, arrowSpan, arrowStrips, buildArrows, pathPoint } from "./arrows";

describe("turn arrows", () => {
  it("hover just above the faces, round over the edges", () => {
    const [u, v] = pathPoint(0); // middle of side 0
    expect(u).toBeCloseTo(1.8);
    expect(v).toBeCloseTo(0);
    const [cu, cv] = pathPoint(0.5); // over the edge
    expect(Math.hypot(cu - 1.5, cv - 1.5)).toBeCloseTo(0.3);
    const [bu, bv] = pathPoint(1); // next side, counter-clockwise
    expect(bu).toBeCloseTo(0);
    expect(bv).toBeCloseTo(1.8);
  });

  it("single: over the face seen best; double: over the two seen best", () => {
    const eye = new Vector3(3, 4, 5); // mostly F, then R (U layer: e1 = z, e2 = x)
    expect(arrowCentre({ axis: 1, layers: [1], quarters: -1 }, eye)).toBe(0); // over F
    expect(arrowCentre({ axis: 1, layers: [1], quarters: 2 }, eye)).toBe(0.5); // over F and R
  });

  it("stays on the faces in view, direction from the sign", () => {
    expect(arrowSpan(-1, 0)).toEqual({ from: 0.4, to: -0.4 });
    const d = arrowSpan(2, 0.5);
    expect(d.from).toBeCloseTo(-0.4);
    expect(d.to).toBeCloseTo(1.4);
  });

  it("as many heads as quarter turns; one mesh per layer", () => {
    expect(arrowStrips(1, 0)).toHaveLength(2);
    expect(arrowStrips(-2, 0.5)).toHaveLength(3);
    expect(arrowStrips(3, 0.5)).toHaveLength(4);
    expect(buildArrows([{ axis: 0, layers: [1, 0], quarters: -1 }], [0]).children).toHaveLength(2); // wide r
  });
});
