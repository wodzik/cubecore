import { describe, expect, it } from "bun:test";
import { CUBIES, FACELETS, FRAMES, MASK_PRESETS, applyMoves, maskStateAt, presetMask, solvedState } from "./index";

const S = solvedState();
const countState = (mask: Uint8Array, state: string) => [...mask].filter((c) => ["regular", "dim", "ignored", "oriented", "invisible"][c] === state).length;

describe("masks", () => {
  it("cross mask: the 4 D-layer edges and the centres are regular, everything else ignored", () => {
    const m = presetMask("cross");
    expect(countState(m, "regular")).toBe(4 * 2 + 6);
    const crossEdges = CUBIES.filter((c) => c.kind === "edge" && c.pos[1] === -1);
    for (const e of crossEdges) for (const f of e.facelets) expect(maskStateAt(m, S, f)).toBe("regular");
  });

  it("follows the pieces as they move", () => {
    const m = presetMask("cross");
    const s = applyMoves(S, "R");
    // R takes the bottom to the front: the DR edge is now at FR and still "regular"; the edge now at DR (from BR) is ignored.
    const br = CUBIES.find((c) => c.pos.join() === "1,0,1")!;
    const dr = CUBIES.find((c) => c.pos.join() === "1,-1,0")!;
    for (const f of br.facelets) expect(maskStateAt(m, s, f)).toBe("regular");
    for (const f of dr.facelets) expect(maskStateAt(m, s, f)).toBe("ignored");
  });

  it("maps to any frame: the cross mask of a frame covers the edges around that frame's bottom face", () => {
    for (const frame of FRAMES) {
      const m = presetMask("cross", frame);
      const bottom = frame.face.D;
      const expected = CUBIES.filter((c) => c.kind === "edge" && c.facelets.some((f) => FACELETS[f].face === bottom));
      for (const e of expected) for (const f of e.facelets) expect(maskStateAt(m, S, f)).toBe("regular");
      expect(countState(m, "regular")).toBe(14);
    }
  });

  it("OLL mask shows only the top-facing colour of last-layer pieces", () => {
    const m = presetMask("oll");
    for (const f of FACELETS) {
      const inLL = f.pos[1] === 1 && !(f.pos[0] === 0 && f.pos[2] === 0);
      const st = maskStateAt(m, S, f.index);
      if (inLL) expect(st).toBe(f.face === "U" ? "regular" : "ignored");
    }
  });

  it("every preset is a full 54-sticker mask", () => {
    for (const p of MASK_PRESETS) expect(presetMask(p).length).toBe(54);
  });
});
