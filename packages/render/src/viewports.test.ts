import { describe, expect, it } from "bun:test";
import { FACES, FACE_NORMAL } from "@cubecore/core";
import { backPosition, viewports } from "./viewports";

describe("back view", () => {
  it("lays out the views without overlap (side by side) or as a corner inset", () => {
    expect(viewports("none", 800, 600)).toEqual({ main: { x: 0, y: 0, w: 800, h: 600 }, back: null });
    const s = viewports("side-by-side", 801, 600);
    expect(s.main.w + s.back!.w).toBe(801);
    expect(s.back!.x).toBe(s.main.w);
    const t = viewports("top-right", 800, 600);
    expect(t.main).toEqual({ x: 0, y: 0, w: 800, h: 600 });
    expect(t.back!.x + t.back!.w).toBe(800);
    expect(t.back!.y + t.back!.h).toBe(600); // top edge (origin bottom-left)
  });

  it("the back camera sees exactly the faces the main camera doesn't", () => {
    const main: [number, number, number] = [3, 4, 5]; // sees U, R, F
    const back = backPosition(main);
    const sees = (p: readonly number[]) => FACES.filter((f) => FACE_NORMAL[f].reduce((d, c, i) => d + c * p[i], 0) > 0);
    expect(sees(main).sort()).toEqual(["F", "R", "U"]);
    expect(sees(back).sort()).toEqual(["B", "D", "L"]);
  });
});
