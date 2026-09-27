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

describe("choosing a frame (colour neutral)", () => {
  it("by faces, and by centre colours — also after rotations", async () => {
    const { frameFor, frameForColors } = await import("./index");
    expect(frameFor("U").face.D).toBe("U");
    expect(frameFor("F", "R").face.F).toBe("R");
    // Yellow (colour class D) is on top after x2: "cross on yellow" is then the physical U face.
    const s = applyMoves(solvedState(), "x2");
    expect(frameForColors(s, "D").face.D).toBe("U");
    expect(frameForColors(solvedState(), 3, 2).face.F).toBe("F");
  });
});

describe("reframe", () => {
  it("a solved cube is the identity in every frame; moves done in a frame reframe to the canonical ones", async () => {
    const { reframe, statesEqual } = await import("./index");
    const alg = parseAlg("R U R' F2 D' L");
    for (const frame of FRAMES) {
      expect(statesEqual(reframe(solvedState(), frame), solvedState())).toBe(true);
      expect(statesEqual(reframe(applyMoves(solvedState(), transformMoves(alg, frame)), frame), applyMoves(solvedState(), alg))).toBe(true);
    }
  });
});
