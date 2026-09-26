import { describe, expect, it } from "bun:test";
import { FACELETS } from "@cubecore/core";
import { FACE_BASIS, reachEdge, roundedOutline, stickerLayout, stickerlessOutline } from "./shapes";

const SHAPE = { corner: { inner: 0.4, outer: 0.05 }, edge: { inner: 0.3, outer: 0.05 }, center: 0.45 };
const LOCAL = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
const z = (v: number[]) => v.map((x) => x + 0); // -0 → 0
const cross = (a: number[], b: number[]) => z([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]);

describe("sticker layout", () => {
  it("face bases are right-handed: a × b = outward normal", () => {
    for (const { a, b, n } of Object.values(FACE_BASIS)) expect(cross([...a], [...b])).toEqual([...n]);
  });

  it("classifies 8 corner, 12·… edge and 6 centre tiles per the right counts (24 / 24 / 6)", () => {
    const kinds = FACELETS.map((f) => stickerLayout(f.index, SHAPE).kind);
    expect(kinds.filter((k) => k === "corner").length).toBe(24);
    expect(kinds.filter((k) => k === "edge").length).toBe(24);
    expect(kinds.filter((k) => k === "center").length).toBe(6);
  });

  it("the rounded (inner) corners point at the face centre, on every face", () => {
    for (const f of FACELETS) {
      const L = stickerLayout(f.index, SHAPE);
      L.radii.forEach((r, i) => {
        const [sx, sy] = LOCAL[i];
        // Moving from the tile towards (sx, sy) gets closer to the centre ⇔ that corner is inner.
        const towardsCentre = L.kind === "center" ? true : (L.u === 0 || sx === -Math.sign(L.u)) && (L.v === 0 || sy === -Math.sign(L.v));
        const expected = L.kind === "center" ? SHAPE.center : towardsCentre ? (L.kind === "corner" ? 0.4 : 0.3) : 0.05;
        expect(`${f.index}/${i}: ${r}`).toBe(`${f.index}/${i}: ${expected}`);
      });
    }
  });

  it("custom paths are rotated so their 'towards the centre' side faces the centre", () => {
    for (const f of FACELETS) {
      const L = stickerLayout(f.index, SHAPE);
      if (L.kind === "center") continue;
      let d = L.kind === "corner" ? [1, -1] : [0, -1];
      for (let q = 0; q < L.pathQuarters; q++) d = [-d[1], d[0]];
      expect(z(d)).toEqual(z([-Math.sign(L.u), -Math.sign(L.v)]));
    }
  });

  it("outlines stay inside the tile and hug each corner's radius", () => {
    const pts = roundedOutline(1, [0.5, 0.1, 0.1, 0], 8);
    for (const [x, y] of pts) expect(Math.max(Math.abs(x), Math.abs(y))).toBeLessThanOrEqual(0.5 + 1e-9);
    // square corner (radius 0) reaches the exact corner point
    expect(pts.some(([x, y]) => Math.abs(x - 0.5) < 1e-9 && Math.abs(y + 0.5) < 1e-9)).toBe(true);
    // fully rounded corner never reaches (0.5, 0.5)
    expect(pts.some(([x, y]) => x > 0.49 && y > 0.49)).toBe(false);
  });
});

describe("stickerlessOutline", () => {
  it("runs outer sides to the cube edge (no seam between a piece's faces), keeps inner gaps", () => {
    for (const f of FACELETS) {
      const layout = stickerLayout(f.index, SHAPE);
      const pts = stickerlessOutline(layout, 0.9, 0.52);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      expect(Math.max(...xs)).toBeCloseTo(layout.u === 1 ? 0.52 : 0.45);
      expect(Math.min(...xs)).toBeCloseTo(layout.u === -1 ? -0.52 : -0.45);
      expect(Math.max(...ys)).toBeCloseTo(layout.v === 1 ? 0.52 : 0.45);
      expect(Math.min(...ys)).toBeCloseTo(layout.v === -1 ? -0.52 : -0.45);
      // A cube-corner tile is sharp at the cube corner.
      if (layout.kind === "corner") expect(pts.some(([x, y]) => x === 0.52 * layout.u && y === 0.52 * layout.v)).toBe(true);
    }
  });
});

describe("per-kind tiles", async () => {
  const { SKINS, tileSize, tileThickness } = await import("./skin");
  it("gan: a smaller, thicker centre cap; the rest as usual", () => {
    const s = SKINS.gan;
    expect(tileSize(s, "center")).toBeLessThan(tileSize(s, "edge"));
    expect(tileThickness(s, "center")).toBeGreaterThan(tileThickness(s, "corner"));
    expect(tileSize(SKINS.standard, "center")).toBe(SKINS.standard.stickers.size);
  });
});

describe("reachEdge", () => {
  it("stretches a path outline's outer sides to the cube edge, inner sides stay", () => {
    // A corner tile: find one whose outer sides are −x and +y.
    const fi = FACELETS.findIndex((_, i) => {
      const L = stickerLayout(i, SHAPE);
      return L.kind === "corner" && L.u === -1 && L.v === 1;
    });
    const layout = stickerLayout(fi, SHAPE);
    const square: [number, number][] = [[0.45, 0.45], [-0.45, 0.45], [-0.45, -0.45], [0.45, -0.45]];
    const out = reachEdge(square, layout, 0.45, 0.5);
    expect(Math.min(...out.map(([x]) => x))).toBeCloseTo(-0.5); // outer −x
    expect(Math.max(...out.map(([, y]) => y))).toBeCloseTo(0.5); // outer +y
    expect(Math.max(...out.map(([x]) => x))).toBeCloseTo(0.45); // inner sides untouched
    expect(Math.min(...out.map(([, y]) => y))).toBeCloseTo(-0.45);
  });
});
