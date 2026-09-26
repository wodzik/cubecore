import { describe, expect, it } from "bun:test";
import { SKINS, withStickers } from "./skin";

describe("withStickers", () => {
  it("turns a stickerless brand into a stickered cube: black body, the brand's stickers, not wrapped round the edges", () => {
    const s = withStickers(SKINS.moyu, "thin");
    expect(s.body).toBe("#161616");
    expect(s.pieces).toBeUndefined();
    expect(s.stickers.size).toBe(SKINS.moyu.stickerSet!.size);
    expect(s.stickers.shape).toEqual(SKINS.moyu.stickerSet!.shape);
    expect(s.stickers.fillOuter).toBe(false);
    expect(s.stickers.colors).toEqual(SKINS.moyu.stickers.colors);
  });

  it("raised stickers stand out more than thin ones, a flat print hardly at all", () => {
    const t = (style: "raised" | "thin" | "flat") => withStickers(SKINS.gan356m, style).stickers.thickness!;
    expect(t("raised")).toBeGreaterThan(t("thin"));
    expect(t("thin")).toBeGreaterThan(t("flat"));
    expect(withStickers(SKINS.gan356m, "flat").stickers.bevel).toBe(0);
  });

  it("uses the skin's own shapes when it has no sticker set", () => {
    const s = withStickers(SKINS.standard);
    expect(s.stickers.size).toBeLessThanOrEqual(SKINS.standard.stickers.size);
    expect(withStickers(SKINS.stickerless).stickers.size).toBeLessThan(SKINS.stickerless.stickers.size);
  });
});

describe("stickered skins", () => {
  it("QiYi's round cube is rounder than its square one, both black with QiYi's colours", () => {
    expect(SKINS.qiyiStickersRounded.cubieRadius).toBeGreaterThan(SKINS.qiyiStickersSquare.cubieRadius);
    for (const s of [SKINS.qiyiStickersRounded, SKINS.qiyiStickersSquare, SKINS.ganStickers, SKINS.moyuStickers]) {
      expect(s.body).toBe("#161616");
      expect(s.stickers.fillOuter).toBe(false);
    }
    expect(SKINS.qiyiStickersSquare.stickers.colors).toEqual(SKINS.qiyiSC.stickers.colors);
  });
});
