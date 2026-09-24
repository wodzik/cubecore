import { describe, expect, it } from "bun:test";
import * as THREE from "three";
import { defineFeature, featureDef, imageUrl, kindOfSticker, selectedStickers, selects } from "./index";

describe("sticker selectors", () => {
  it("home faces, piece kinds and explicit stickers — all conditions must hold", () => {
    expect(selectedStickers({}).length).toBe(54);
    expect(selectedStickers({ faces: ["D"] })).toEqual([27, 28, 29, 30, 31, 32, 33, 34, 35]);
    expect(selectedStickers({ faces: ["D"], kinds: ["center"] })).toEqual([31]);
    expect(selectedStickers({ kinds: ["center"] })).toEqual([4, 13, 22, 31, 40, 49]);
    expect(selectedStickers({ kinds: ["corner"] }).length).toBe(24);
    expect(selects({ stickers: [4], faces: ["R"] }, 4)).toBe(false);
    expect([0, 1, 4].map(kindOfSticker)).toEqual(["corner", "edge", "center"]);
  });
});

describe("features", () => {
  it("built-ins draw in 3D and SVG; apps register their own the same way", () => {
    const holes = featureDef("holes")!;
    const obj = holes.build3d!({ three: THREE, side: 0.95, thickness: 0.04, params: { at: [[0, 0], [0.5, 0]] } });
    expect(obj.children.length).toBe(2);
    expect(holes.svg!({ side: 0.95, thickness: 0.04, params: { at: [[0, 0]] } })).toContain('cx="0.5" cy="0.5"');
    expect(featureDef("slot")!.svg!({ side: 1, thickness: 0, params: { width: 0.4, height: 0.1 } })).toContain('width="0.4"');

    defineFeature({ type: "star", svg: () => '<path d="M0.5 0.1 L0.6 0.9 Z"/>' });
    expect(featureDef("star")!.svg!({ side: 1, thickness: 0, params: {} })).toContain("M0.5 0.1");
  });
});

describe("decal images", () => {
  it("SVG strings become data: URLs with an intrinsic size; URLs pass through", () => {
    expect(decodeURIComponent(imageUrl('<svg viewBox="0 0 1 1"/>'))).toContain('<svg width="512" height="512" viewBox');
    expect(decodeURIComponent(imageUrl('<svg width="10" height="10"/>'))).toContain('<svg width="10" height="10"/>');
    expect(imageUrl("/logo.png")).toBe("/logo.png");
  });
});

describe("themes", async () => {
  const { SKINS, themed, hintColor, stickerColor } = await import("./index");
  it("light pages get lighter masked greys and a visible white back sticker; dark keeps the preset", () => {
    const light = themed(SKINS.standard, "light");
    expect(light.mask.ignored).not.toBe(SKINS.standard.mask.ignored);
    expect(themed(SKINS.standard, "dark")).toBe(SKINS.standard);
    expect(hintColor(light, 0, "regular")).not.toBe("#ffffff");
    expect(hintColor(SKINS.standard, 0, "regular")).toBe(stickerColor(SKINS.standard, 0, "regular"));
    expect(hintColor(light, 0, "ignored")).toBe(light.mask.ignored);
  });
});
