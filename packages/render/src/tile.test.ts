import { describe, expect, it } from "bun:test";
import { roundedOutline, stickerLayout, stickerlessOutline } from "@cubecore/skin";
import { dedupe, tileSolid } from "./tile";

const SHAPE = { corner: { inner: 0.34, outer: 0.07 }, edge: { inner: 0.3, outer: 0.07 }, center: 0.36 };
const PROFILE = { thickness: 0.035, bevel: 0.024, segments: 4, sink: 0.02 };

const zs = (p: Float32Array) => Array.from({ length: p.length / 3 }, (_, i) => p[i * 3 + 2]);
const extent = (p: Float32Array, axis: 0 | 1, z: number) => {
  let max = -Infinity;
  for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i + 2] - z) < 1e-6) max = Math.max(max, p[i + axis]);
  return max;
};

describe("tile solids", () => {
  it("span from −sink to the thickness, the top cap facing straight up", () => {
    const s = tileSolid(roundedOutline(0.9, [0.2, 0.2, 0.2, 0.2]), PROFILE, null);
    const z = zs(s.positions);
    expect(Math.min(...z)).toBeCloseTo(-0.02);
    expect(Math.max(...z)).toBeCloseTo(0.035);
    for (let i = s.topStart; i < s.positions.length / 3; i++) expect([s.normals[i * 3], s.normals[i * 3 + 1], s.normals[i * 3 + 2]]).toEqual([0, 0, 1]);
  });

  it("the bevel pulls the top in by its radius; normals are unit length and point outwards", () => {
    const s = tileSolid(roundedOutline(0.9, [0.2, 0.2, 0.2, 0.2]), PROFILE, null);
    expect(extent(s.positions, 0, 0.035)).toBeCloseTo(0.45 - 0.024, 3);
    expect(extent(s.positions, 0, -0.02)).toBeCloseTo(0.45, 3);
    for (let i = 0; i < s.topStart; i++) {
      const [x, y, z] = [s.normals[i * 3], s.normals[i * 3 + 1], s.normals[i * 3 + 2]];
      expect(Math.hypot(x, y, z)).toBeCloseTo(1);
      expect(x * s.positions[i * 3] + y * s.positions[i * 3 + 1]).toBeGreaterThan(-1e-9); // outwards (tile centred on 0)
    }
  });

  it("stickerless: outer sides are mitred to the cube edge (45°), inner sides bevelled", () => {
    // A corner tile at u = v = +1: +x and +y are the cube's outer edges.
    const layout = { ...stickerLayout(8, SHAPE), u: 1, v: 1 };
    const edge = 0.4945;
    const s = tileSolid(stickerlessOutline(layout, 0.94 * 0.985, edge), PROFILE, { u: 1, v: 1, edge, ramp: 0.14 });
    // Outer side: reaches edge + z at every height (the mitre plane x = edge + z).
    expect(extent(s.positions, 0, 0.035)).toBeCloseTo(edge + 0.035, 4);
    expect(extent(s.positions, 0, -0.02)).toBeCloseTo(edge - 0.02, 4);
    // Inner side (−x): pulled in by the bevel at the top.
    let minTop = Infinity;
    for (let i = 0; i < s.positions.length; i += 3) if (Math.abs(s.positions[i + 2] - 0.035) < 1e-6) minTop = Math.min(minTop, s.positions[i]);
    expect(minTop).toBeCloseTo(-(0.94 * 0.985) / 2 + 0.024, 3);
  });

  it("no bevel: a straight wall; duplicate outline points are dropped", () => {
    const s = tileSolid(roundedOutline(0.9, [0, 0, 0, 0]), { ...PROFILE, bevel: 0 }, null);
    expect(dedupe(roundedOutline(0.9, [0, 0, 0, 0])).length).toBe(4);
    expect(s.topRing.length).toBe(4);
    expect(extent(s.positions, 0, 0.035)).toBeCloseTo(0.45);
  });

  it("edgeRadius rounds the cube edge: the top ends R short of the mitre, the round meets it at 45°", () => {
    const layout = { ...stickerLayout(8, SHAPE), u: 1, v: 1 };
    const edge = 0.4945, R = 0.05;
    const s = tileSolid(stickerlessOutline(layout, 0.94 * 0.985, edge), { ...PROFILE, edgeRadius: R }, { u: 1, v: 1, edge, ramp: 0.14 });
    // Flat top reaches edge + t − R; where the round meets the mitre plane x − edge = z.
    expect(extent(s.positions, 0, 0.035)).toBeCloseTo(edge + 0.035 - R, 4);
    const meet = 0.035 - R * (1 - Math.SQRT1_2);
    expect(extent(s.positions, 0, meet)).toBeCloseTo(edge + meet, 4);
  });
});
