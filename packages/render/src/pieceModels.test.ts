import { describe, expect, it } from "bun:test";
import { CUBIES, FACELETS } from "@cubecore/core";
import { CANONICAL, PLACEMENTS, stickerFaceOf } from "./pieceModels";

describe("piece model placement", () => {
  it("every cubie gets a rotation that carries its kind's canonical piece onto it", () => {
    expect(PLACEMENTS.length).toBe(26);
    for (const p of PLACEMENTS) {
      const c = CANONICAL[p.kind].pos;
      const moved = p.rotation.map((row) => row[0] * c[0] + row[1] * c[1] + row[2] * c[2] + 0); // + 0: no -0
      expect(moved).toEqual([...p.cubie.pos]);
    }
  });

  it("the model's stickers cover exactly the cubie's facelets, one each", () => {
    for (const p of PLACEMENTS) {
      const got = Object.values(p.stickers).sort((a, b) => a! - b!);
      expect(got).toEqual([...p.cubie.facelets].sort((a, b) => a - b));
    }
    // The canonical corner sits on UFR as itself.
    const ufr = PLACEMENTS.find((p) => p.cubie.pos.join() === "1,1,1")!;
    expect(FACELETS[ufr.stickers.U!].face).toBe("U");
    expect(FACELETS[ufr.stickers.R!].face).toBe("R");
    expect(CUBIES.length).toBe(26);
  });

  it("sticker materials are recognised by name", () => {
    expect([stickerFaceOf("sticker-U"), stickerFaceOf("Sticker-f"), stickerFaceOf("body"), stickerFaceOf(undefined)]).toEqual(["U", "F", null, null]);
  });
});
