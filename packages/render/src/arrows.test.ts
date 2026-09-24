import { describe, expect, it } from "bun:test";
import { Vector3 } from "three";
import { ARROW_RADIUS, arrowShapes, arrowSpan, buildArrows, facingAngle } from "./arrows";

describe("turn arrows", () => {
  it("float clear of the cube's corners", () => {
    expect(ARROW_RADIUS).toBeGreaterThan(1.5 * Math.SQRT2 + 0.2);
  });

  it("face the camera", () => {
    expect(facingAngle(1, new Vector3(1, 1, 1))).toBeCloseTo(Math.PI / 4); // U layer from the URF corner (e1 = z, e2 = x)
    expect(facingAngle(1, new Vector3(0, 1, 5))).toBeCloseTo(0); // straight at F
    expect(facingAngle(1, new Vector3(0, 5, 0))).toBeCloseTo(Math.PI / 4); // down the axis
  });

  it("double = a longer arc; the direction follows the sign", () => {
    const s = arrowSpan(-1, 0);
    expect(s.from).toBeGreaterThan(s.to);
    const d = arrowSpan(2, 0);
    expect(d.to - d.from).toBeGreaterThan(s.from - s.to);
  });

  it("one head for a single turn, two for a double; one mesh per layer", () => {
    expect(arrowShapes(1, 0)).toHaveLength(2); // ribbon + head
    expect(arrowShapes(-2, 0)).toHaveLength(3); // ribbon + 2 heads
    expect(buildArrows([{ axis: 0, layers: [1, 0], quarters: -1 }], [0]).children).toHaveLength(2); // wide r
  });
});
