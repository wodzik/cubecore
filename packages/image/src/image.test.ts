import { describe, expect, it } from "bun:test";
import { FRAMES, applyMoves, buildMask, presetMask, solvedState } from "@cubecore/core";
import { SCHEMES, SvgCache, renderSvg, svgKey } from "./index";

const S = solvedState();
const count = (svg: string, needle: string) => svg.split(needle).length - 1;

describe("renderSvg", () => {
  it("draws the visible stickers of each view: iso 27, top 9 + 12 side strips, net 54", () => {
    expect(count(renderSvg(S, { view: "iso" }), "<path") - 3).toBe(27); // minus the 3 body faces
    expect(count(renderSvg(S, { view: "top" }), "<path")).toBe(21);
    expect(count(renderSvg(S, { view: "net" }), "<path")).toBe(54);
  });

  it("colours come from the scheme; masks grey out / hide stickers", () => {
    const svg = renderSvg(S, { view: "net" });
    for (const c of SCHEMES.western.faces) expect(count(svg, `fill="${c}"`)).toBe(9);
    const masked = renderSvg(S, { view: "net", mask: presetMask("cross") });
    expect(count(masked, `fill="${SCHEMES.western.ignored}"`)).toBe(54 - 14);
    const hidden = renderSvg(S, { view: "net", mask: buildMask(() => "invisible") });
    expect(count(hidden, "<path")).toBe(0);
  });

  it("is a standalone SVG with the requested width and a matching aspect ratio", () => {
    const svg = renderSvg(S, { view: "net", size: 240 });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('width="240" height="181"');
  });

  it("the frame option shows the cube from another orientation", () => {
    const frame = FRAMES.find((f) => f.face.U === "D")!; // canonical top = physical bottom
    const svg = renderSvg(S, { view: "top", frame });
    expect(count(svg, `fill="${SCHEMES.western.faces[3]}"`)).toBeGreaterThanOrEqual(9); // D colour on top
  });
});

describe("caching", () => {
  it("same input → same key and the same string; different state/options → different key", () => {
    const a = applyMoves(S, "R U");
    expect(svgKey(a, { view: "iso" })).toBe(svgKey(new Uint8Array(a), { view: "iso" }));
    expect(svgKey(a, { view: "iso" })).not.toBe(svgKey(applyMoves(S, "R U'"), { view: "iso" }));
    expect(svgKey(a, { view: "iso" })).not.toBe(svgKey(a, { view: "top" }));
    expect(svgKey(a, { view: "iso", mask: presetMask("oll") })).not.toBe(svgKey(a, { view: "iso" }));
    expect(renderSvg(a, { view: "top" })).toBe(renderSvg(a, { view: "top" }));
  });

  it("SvgCache returns cached strings and evicts the least recently used", () => {
    const cache = new SvgCache(2);
    const s1 = applyMoves(S, "R"), s2 = applyMoves(S, "U"), s3 = applyMoves(S, "F");
    const first = cache.get(s1);
    expect(cache.get(s1)).toBe(first);
    cache.get(s2);
    cache.get(s1); // s1 is now most recent
    cache.get(s3); // evicts s2
    expect(cache.size).toBe(2);
  });
});
