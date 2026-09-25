import { describe, expect, it } from "bun:test";
import { Vector3 } from "three";
import { arrowCentre, arrowSpan, arrowStrips, buildArrows, moveArrows, pathPoint } from "./arrows";

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

  it("over the face seen best, leaning towards the next one seen best", () => {
    const eye = new Vector3(3, 4, 5); // mostly F, then R (U layer: e1 = z, e2 = x)
    expect(arrowCentre({ axis: 1, layers: [1], quarters: -1 }, eye)).toBe(0.25);
    expect(arrowCentre({ axis: 1, layers: [1], quarters: 2 }, eye)).toBe(0.25);
  });

  it("one length for every turn; direction from the sign", () => {
    const [a, b] = [arrowSpan(-1, 0), arrowSpan(3, 0)];
    expect(a.from - a.to).toBeCloseTo(b.to - b.from);
    expect(a.from).toBeGreaterThan(a.to);
  });

  it("circle: an arc clear of the corners", () => {
    const [u, v] = pathPoint(0.5, "circle");
    expect(Math.hypot(u, v)).toBeGreaterThan(1.5 * Math.SQRT2);
  });

  it("as many heads as quarter turns; one mesh per layer", () => {
    expect(arrowStrips(1, 0)).toHaveLength(2);
    expect(arrowStrips(-2, 0.5)).toHaveLength(3);
    expect(arrowStrips(3, 0.5)).toHaveLength(4);
    expect(buildArrows([{ axis: 0, layers: [1, 0], quarters: -1 }], [0]).children).toHaveLength(4); // wide r: 2 layers × 2 opposite arrows
  });

  it("two arrows on opposite sides travel the way they point", () => {
    const g = buildArrows([{ axis: 1, layers: [1], quarters: 1 }], [0]);
    const tip = (i: number) => {
      const p = (g.children[i] as import("three").Mesh).geometry.getAttribute("position");
      return [p.getX(p.count - 1), p.getY(p.count - 1)];
    };
    const [a0, b0] = [tip(0), tip(1)];
    expect(a0[0]).toBeCloseTo(-b0[0]); // point-symmetric: opposite sides
    expect(a0[1]).toBeCloseTo(-b0[1]);
    moveArrows(g, 0.25);
    const a1 = tip(0);
    const turned = Math.atan2(a1[1], a1[0]) - Math.atan2(a0[1], a0[0]);
    expect((turned + 2 * Math.PI) % (2 * Math.PI)).toBeLessThan(Math.PI); // counter-clockwise (quarters > 0)
  });
});
