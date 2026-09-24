import { describe, expect, it } from "bun:test";
import { CUBIES, FACELETS, FRAMES, MethodTracker, applyMoves, maskStateAt, solvedState } from "@cubecore/core";
import { runSegments, stagesAt } from "@cubecore/core/testing";
import { CFOP, CFOP_MASKS, cfopMask } from "./index";

const S = solvedState();

// Cross, 4 pair inserts that only touch their own slot + U, OLL (Sune), PLL (T), AUF.
const SOLVE = ["F2 R' D L2", "R U R'", "L' U' L", "R' U' R", "L U L'", "R U R' U R U2 R'", "R U R' U' R' F R2 U' R' U' R U R' F'", "U"];

describe("CFOP", () => {
  it("finds every stage exactly where it happens, with the slots in physical terms", () => {
    const { tracker, ends } = runSegments(CFOP, SOLVE);
    expect(tracker.boundaries.map((b) => [b.stage, b.moveIndex])).toEqual([
      ["cross", ends[0]],
      ["f2l-1", ends[1]],
      ["f2l-2", ends[2]],
      ["f2l-3", ends[3]],
      ["f2l-4", ends[4]],
      ["oll", ends[5]],
      ["pll", ends[6]],
      ["auf", ends[7]],
    ]);
    expect(tracker.boundaries.slice(1, 5).map((b) => b.detail)).toEqual(["FR", "FL", "BR", "BL"]);
    expect(tracker.bottomFace).toBe("D");
    expect(tracker.boundaries[3].time).toBe((ends[3] - 1) * 100);
  });

  it("is orientation / colour neutral: the same solve on any of the 24 frames gives the same stages", () => {
    const reference = stagesAt(runSegments(CFOP, SOLVE).tracker);
    for (const frame of FRAMES) {
      const { tracker } = runSegments(CFOP, SOLVE, frame);
      expect(`${frame.id}: ${stagesAt(tracker)}`).toBe(`${frame.id}: ${reference}`);
      expect(tracker.bottomFace).toBe(frame.face.D); // the cross face is found, wherever it is
    }
  });

  it("stages already done in the scramble are reported at move 0, several on the same move", () => {
    // "R U R'" only disturbs the FR slot: cross and the other three pairs are done before any move.
    const t = new MethodTracker(CFOP, applyMoves(S, "R U R'"));
    expect(t.boundaries.map((b) => [b.stage, b.moveIndex, b.detail])).toEqual([
      ["cross", 0, undefined],
      ["f2l-1", 0, "FL"],
      ["f2l-2", 0, "BR"],
      ["f2l-3", 0, "BL"],
    ]);
    t.push("R U' R'");
    expect(t.boundaries.find((b) => b.stage === "f2l-4")).toEqual({ stage: "f2l-4", moveIndex: 3, detail: "FR" });
    expect(t.current.done).toBe(true);
  });
});

const countState = (mask: Uint8Array, state: string) => [...mask].filter((c) => ["regular", "dim", "ignored", "oriented", "invisible"][c] === state).length;

describe("CFOP masks", () => {
  it("cross: the 4 D-layer edges and the centres are regular, everything else ignored", () => {
    const m = cfopMask("cross");
    expect(countState(m, "regular")).toBe(4 * 2 + 6);
    const crossEdges = CUBIES.filter((c) => c.kind === "edge" && c.pos[1] === -1);
    for (const e of crossEdges) for (const f of e.facelets) expect(maskStateAt(m, S, f)).toBe("regular");
  });

  it("follows the pieces as they move", () => {
    const m = cfopMask("cross");
    const s = applyMoves(S, "R");
    // R takes DR up to FR: that edge is still "regular"; the edge now at DR (from BR) is ignored.
    const fr = CUBIES.find((c) => c.pos.join() === "1,0,1")!;
    const dr = CUBIES.find((c) => c.pos.join() === "1,-1,0")!;
    for (const f of fr.facelets) expect(maskStateAt(m, s, f)).toBe("regular");
    for (const f of dr.facelets) expect(maskStateAt(m, s, f)).toBe("ignored");
  });

  it("maps to any frame: the cross mask of a frame covers the edges around that frame's bottom face", () => {
    for (const frame of FRAMES) {
      const m = cfopMask("cross", frame);
      const bottom = frame.face.D;
      const expected = CUBIES.filter((c) => c.kind === "edge" && c.facelets.some((f) => FACELETS[f].face === bottom));
      for (const e of expected) for (const f of e.facelets) expect(maskStateAt(m, S, f)).toBe("regular");
      expect(countState(m, "regular")).toBe(14);
    }
  });

  it("OLL shows only the top-facing colour of last-layer pieces", () => {
    const m = cfopMask("oll");
    for (const f of FACELETS) {
      const inLL = f.pos[1] === 1 && !(f.pos[0] === 0 && f.pos[2] === 0);
      if (inLL) expect(maskStateAt(m, S, f.index)).toBe(f.face === "U" ? "regular" : "ignored");
    }
  });

  it("last-layer masks keep every centre in full colour", () => {
    for (const p of ["oll", "coll", "ocll", "cll", "ell", "pll"] as const) {
      const m = cfopMask(p);
      for (let face = 0; face < 6; face++) expect(`${p}:${face}:${maskStateAt(m, S, face * 9 + 4)}`).toBe(`${p}:${face}:regular`);
    }
  });

  it("every mask covers all 54 stickers", () => {
    for (const name of Object.keys(CFOP_MASKS) as (keyof typeof CFOP_MASKS)[]) expect(cfopMask(name).length).toBe(54);
  });
});
