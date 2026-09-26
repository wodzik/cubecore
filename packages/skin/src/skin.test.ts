import { describe, expect, it } from "bun:test";
import { SKINS, withStickers } from "./skin";

describe("withStickers", () => {
  it("turns a stickerless brand into a stickered cube: black plastic platforms, the brand's stickers lying on them", () => {
    const s = withStickers(SKINS.moyu, "thin");
    expect(s.body).toBe(SKINS.moyu.stickerSet!.body!); // MoYu's dark grey plastic
    expect(withStickers(SKINS.standard).body).toBe("#222222"); // the default
    expect(s.pieces?.colored).toBeFalsy(); // black plastic under the tiles
    expect(s.stickers.overlay?.size).toBe(SKINS.moyu.stickerSet!.size);
    expect(s.stickers.overlay?.shape).toEqual(SKINS.moyu.stickerSet!.shape);
    expect(s.stickers.overlay?.margin).toBe(SKINS.moyu.stickerSet!.margin);
    expect(s.stickers.colors).toEqual(SKINS.moyu.stickers.colors);
  });

  it("raised stickers stand out more than thin ones, a flat print hardly at all", () => {
    const t = (style: "raised" | "thin" | "flat") => withStickers(SKINS.gan, style).stickers.overlay!.thickness;
    expect(t("raised")).toBeGreaterThan(t("thin"));
    expect(t("thin")).toBeGreaterThan(t("flat"));
    expect(withStickers(SKINS.gan, "flat").stickers.overlay!.bevel).toBe(0);
  });

  it("uses the skin's own shapes when it has no sticker set", () => {
    expect(withStickers(SKINS.standard).stickers.overlay!.size).toBeLessThanOrEqual(SKINS.standard.stickers.size);
    expect(withStickers(SKINS.stickerless).stickers.overlay!.size).toBeLessThan(SKINS.stickerless.stickers.size);
  });
});

describe("stickered skins", () => {
  it("QiYi's round and square cubes differ only in how round the body is", () => {
    const r = SKINS.qiyiStickersRounded.stickers, q = SKINS.qiyiStickersSquare.stickers;
    expect(r.edgeRadius!).toBeGreaterThan(q.edgeRadius!);
    expect(r.cornerRound!).toBeGreaterThan(q.cornerRound!);
    expect({ ...q.overlay, cornerRound: 0, edgeRadius: 0 }).toEqual({ ...r.overlay, cornerRound: 0, edgeRadius: 0 });
    for (const s of [SKINS.qiyiStickersRounded, SKINS.qiyiStickersSquare]) expect(s.body).toBe("#2e2e2e"); // QiYi's plastic
    expect(q.colors).toEqual(SKINS.qiyiSC.stickers.colors);
  });
});
