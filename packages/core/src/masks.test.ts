import { describe, expect, it } from "bun:test";
import { CUBIES, FACELETS, FRAMES, MASK_PRESETS, applyMoves, buildMask, maskStateAt, presetMask, solvedState } from "./index";

const S = solvedState();
const countState = (mask: Uint8Array, state: string) => [...mask].filter((c) => ["regular", "dim", "ignored", "oriented", "invisible"][c] === state).length;

describe("masks", () => {
  it("first layer: its 21 stickers and the other centres are regular", () => {
    const m = presetMask("first-layer");
    expect(countState(m, "regular")).toBe(21 + 5);
    for (const f of FACELETS) if (f.pos[1] === -1) expect(maskStateAt(m, S, f.index)).toBe("regular");
  });

  it("follows the pieces as they move", () => {
    const m = presetMask("first-layer");
    const s = applyMoves(S, "R");
    // R lifts the DFR corner to UFR: still regular up there; the UBR corner comes down to DBR and stays ignored.
    const ufr = CUBIES.find((c) => c.pos.join() === "1,1,1")!;
    const dbr = CUBIES.find((c) => c.pos.join() === "1,-1,-1")!;
    for (const f of ufr.facelets) expect(maskStateAt(m, s, f)).toBe("regular");
    for (const f of dbr.facelets) expect(maskStateAt(m, s, f)).toBe("ignored");
  });

  it("maps to any frame: a frame's first layer is the layer on that frame's bottom face", () => {
    for (const frame of FRAMES) {
      const m = presetMask("first-layer", frame);
      const bottom = frame.face.D;
      const layer = CUBIES.filter((c) => c.facelets.some((f) => FACELETS[f].face === bottom));
      for (const c of layer) for (const f of c.facelets) expect(maskStateAt(m, S, f)).toBe("regular");
      expect(countState(m, "regular")).toBe(26);
    }
  });

  it("custom rules via buildMask; every preset is a full 54-sticker mask", () => {
    const edgesOnly = buildMask((f, c) => (c.kind === "edge" ? "regular" : "invisible"));
    expect(countState(edgesOnly, "regular")).toBe(24);
    for (const p of MASK_PRESETS) expect(presetMask(p).length).toBe(54);
  });
});
