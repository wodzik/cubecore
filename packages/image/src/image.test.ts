import { describe, expect, it } from "bun:test";
import { FRAMES, applyMoves, buildMask, presetMask, solvedState, spinsAfter } from "@cubecore/core";
import { SKINS, type Skin } from "@cubecore/skin";
import { SvgCache, renderSvg, svgKey } from "./index";

const STD = SKINS.standard;

const S = solvedState();
const count = (svg: string, needle: string) => svg.split(needle).length - 1;

describe("renderSvg", () => {
  it("draws the visible stickers of each view: iso 27, top 9 + 12 side strips, net 54", () => {
    // Tiles plus one body square per drawn face.
    expect(count(renderSvg(S, { view: "iso" }), "<path") - 3).toBe(27);
    expect(count(renderSvg(S, { view: "top" }), "<path") - 1).toBe(21);
    expect(count(renderSvg(S, { view: "net" }), "<path") - 6).toBe(54);
  });

  it("colours come from the skin; masks grey out / hide stickers", () => {
    const svg = renderSvg(S, { view: "net" });
    for (const c of STD.stickers.colors) expect(count(svg, `fill="${c}"`)).toBe(9);
    for (const c of SKINS.gan.stickers.colors) expect(count(renderSvg(S, { view: "net", skin: SKINS.gan }), `fill="${c}"`)).toBe(9);
    const masked = renderSvg(S, { view: "net", mask: presetMask("cross") });
    expect(count(masked, `fill="${STD.mask.ignored}"`)).toBe(54 - 14);
    const hidden = renderSvg(S, { view: "net", mask: buildMask(() => "invisible") });
    expect(count(hidden, "<path")).toBe(6); // bodies only
  });

  it("is a standalone SVG with the requested width and a matching aspect ratio", () => {
    const svg = renderSvg(S, { view: "net", size: 240 });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    const [, , w, h] = svg.match(/viewBox="([^"]+)"/)![1].split(" ").map(Number);
    expect(svg).toContain(`width="240" height="${Math.round((240 * h) / w)}"`);
    expect(h / w).toBeCloseTo(0.75, 1);
  });

  it("the frame option shows the cube from another orientation", () => {
    const frame = FRAMES.find((f) => f.face.U === "D")!; // canonical top = physical bottom
    const svg = renderSvg(S, { view: "top", frame });
    expect(count(svg, `fill="${STD.stickers.colors[3]}"`)).toBeGreaterThanOrEqual(9); // D colour on top
  });

  it("uses the skin's tile shapes and custom SVG tile outlines", () => {
    // Round centres vs square corners give different outlines.
    expect(renderSvg(S, { skin: SKINS.gan })).not.toBe(renderSvg(S, { skin: { ...SKINS.gan, stickers: { ...SKINS.gan.stickers, shape: undefined } } }));
    const custom: Skin = { ...STD, stickers: { ...STD.stickers, paths: { center: "M0.5,0 L1,0.5 L0.5,1 L0,0.5 Z" } } };
    const svg = renderSvg(S, { view: "net", skin: custom });
    expect(count(svg, 'd="M0.5,0 L1,0.5 L0.5,1 L0,0.5 Z" transform="matrix(')).toBe(6);
  });

  it("draws the logo on its sticker, turned by the centre's spin", () => {
    const skin: Skin = { ...STD, logo: { sticker: 4, image: "logo.png", size: 0.7 } };
    const upright = renderSvg(S, { view: "top", skin });
    expect(count(upright, '<image href="logo.png"')).toBe(1);
    // After U the U centre has turned: the logo turns with it; after U4 it is back.
    const turned = renderSvg(applyMoves(S, "U"), { view: "top", skin, spins: spinsAfter(S, "U") });
    expect(turned).not.toBe(upright);
    expect(renderSvg(S, { view: "top", skin, spins: spinsAfter(S, "U U U U") })).toBe(upright);
    // Not drawn when its face isn't in the picture.
    expect(count(renderSvg(applyMoves(S, "x2"), { view: "top", skin }), "<image")).toBe(0);
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
