import { describe, expect, it } from "bun:test";
import { FACES, FRAMES, applyMoves, colorAt, parseAlg, solvedState, transformMoves, view } from "./index";

const S = solvedState();

describe("frames", () => {
  it("there are 24 distinct orientations, each a permutation of the 54 facelets", () => {
    expect(FRAMES.length).toBe(24);
    expect(new Set(FRAMES.map((f) => `${f.face.U}${f.face.F}`)).size).toBe(24);
    for (const f of FRAMES) expect(new Set(f.map).size).toBe(54);
  });

  it("transformMoves does the same thing seen from another frame", () => {
    const alg = parseAlg("R U R' F' r M2 E x y' z2 S d' b");
    const canonical = applyMoves(S, alg);
    for (const frame of FRAMES) {
      const physical = applyMoves(S, transformMoves(alg, frame));
      const seen = view(physical, frame);
      // colour classes are relabelled by the frame (physical colours of the canonical faces)
      const relabel = (c: number) => FACES.indexOf(frame.face[FACES[c]]);
      for (let i = 0; i < 54; i++) expect(colorAt(seen, i)).toBe(relabel(colorAt(canonical, i)));
    }
  });
});
