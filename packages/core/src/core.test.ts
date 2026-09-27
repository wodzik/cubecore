import { describe, expect, it } from "bun:test";
import {
  CUBIES,
  FACELETS,
  applyMoves,
  colorAt,
  formatAlg,
  fromFaceletString,
  invert,
  isSolved,
  mirrorLR,
  moveCount,
  parseAlg,
  simplify,
  solvedState,
  statesEqual,
  toFaceletString,
  MOVE_FAMILIES,
} from "./index";

const S = solvedState();
const eq = (a: string, b: string) => statesEqual(applyMoves(S, a), applyMoves(S, b));

describe("geometry", () => {
  it("has 54 facelets on 26 cubies: 8 corners, 12 edges, 6 centres", () => {
    expect(FACELETS.length).toBe(54);
    const count = (k: string) => CUBIES.filter((c) => c.kind === k).length;
    expect([CUBIES.length, count("corner"), count("edge"), count("center")]).toEqual([26, 8, 12, 6]);
    for (const c of CUBIES) expect(c.facelets.length).toBe(c.kind === "corner" ? 3 : c.kind === "edge" ? 2 : 1);
  });
});

describe("moves", () => {
  it("every family has order 4 and X X' is the identity", () => {
    for (const f of MOVE_FAMILIES) {
      expect(`${f}: ${isSolved(applyMoves(S, `${f} ${f} ${f} ${f}`))}`).toBe(`${f}: true`);
      expect(`${f}: ${statesEqual(applyMoves(S, `${f} ${f}'`), S)}`).toBe(`${f}: true`);
      expect(`${f}: ${eq(`${f}2`, `${f} ${f}`)}`).toBe(`${f}: true`);
      expect(`${f}: ${statesEqual(applyMoves(S, f), S)}`).toBe(`${f}: false`);
    }
  });

  it("face turns go the standard way: R takes the front up, U takes the front to the left, F takes the top to the right", () => {
    // Facelet index f*9+i with faces U R F D L B.
    const afterR = applyMoves(S, "R");
    expect(colorAt(afterR, 0 * 9 + 8)).toBe(2); // U bottom-right now shows F's colour
    const afterU = applyMoves(S, "U");
    expect(colorAt(afterU, 4 * 9 + 0)).toBe(2); // L top-left now shows F's colour
    const afterF = applyMoves(S, "F");
    expect(colorAt(afterF, 1 * 9 + 0)).toBe(0); // R top-left (front column) now shows U's colour
  });

  it("slices, wide turns and rotations relate as expected", () => {
    expect(eq("x", "R M' L'")).toBe(true);
    expect(eq("y", "U E' D'")).toBe(true);
    expect(eq("z", "F S B'")).toBe(true);
    expect(eq("r", "R M'")).toBe(true);
    expect(eq("l", "L M")).toBe(true);
    expect(eq("u", "U E'")).toBe(true);
    expect(eq("d", "D E")).toBe(true);
    expect(eq("f", "F S")).toBe(true);
    expect(eq("b", "B S'")).toBe(true);
    expect(eq("Rw", "r")).toBe(true);
    expect(eq("Rw'", "r'")).toBe(true);
  });

  it("classic identities: sexy ×6, Sune ×6, T-perm ×2, 4 × (R U) … ×105", () => {
    expect(isSolved(applyMoves(S, "(R U R' U')6"))).toBe(true);
    expect(isSolved(applyMoves(S, "(R U R' U')3"))).toBe(false);
    expect(isSolved(applyMoves(S, "(R U R' U R U2 R')6"))).toBe(true);
    expect(isSolved(applyMoves(S, "(R U R' U' R' F R2 U' R' U' R U R' F')2"))).toBe(true);
    expect(isSolved(applyMoves(S, "(R U)105"))).toBe(true);
    expect(isSolved(applyMoves(S, "(R U)35"))).toBe(false);
  });

  it("superflip flips every edge in place and leaves corners solved", () => {
    const s = applyMoves(S, "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2");
    for (const c of CUBIES) {
      const ok = c.facelets.every((f) => s[f] === f);
      if (c.kind === "edge") {
        expect(ok).toBe(false);
        expect(c.facelets.map((f) => s[f]).sort()).toEqual([...c.facelets].sort()); // same piece, flipped
      } else expect(ok).toBe(true);
    }
  });

  it("a scramble followed by its inverse is solved", () => {
    const scramble = parseAlg("D2 F' L2 U R2 B' D L' F2 U' R B2 L D' F R' U2 B L2 D");
    expect(isSolved(applyMoves(applyMoves(S, scramble), invert(scramble)))).toBe(true);
  });
});

describe("notation", () => {
  it("parses and formats", () => {
    expect(formatAlg(parseAlg("R U R' U2 R2' F3 Rw' x y2 M' E S2"))).toBe("R U R' U2 R2' F3 r' x y2 M' E S2"); // the way to turn is kept as written
    const [r2p, f3] = [parseAlg("R2'")[0], parseAlg("F3")[0]];
    expect([r2p.amount, r2p.written, f3.amount, f3.written]).toEqual([2, -2, -1, 3]);
    expect(parseAlg("R2")[0].written).toBeUndefined();
    expect(formatAlg(parseAlg("R U’ F′"))).toBe("R U' F'");
    expect(formatAlg(parseAlg("(R U)2 R4 // comment\nU"))).toBe("R U R U U");
  });

  it("expands commutators and conjugates", () => {
    expect(formatAlg(parseAlg("[R, U]"))).toBe("R U R' U'");
    expect(formatAlg(parseAlg("[F: R U R' U']"))).toBe("F R U R' U' F'");
    expect(formatAlg(parseAlg("[R U R', D]2"))).toBe("R U R' D R U' R' D' R U R' D R U' R' D'");
  });

  it("rejects nonsense with a position", () => {
    expect(() => parseAlg("R U Q")).toThrow(/Unknown move "Q".*4/);
    expect(() => parseAlg("(R U")).toThrow();
    expect(() => parseAlg("[R U]")).toThrow();
  });

  it("inverts, simplifies, mirrors", () => {
    expect(formatAlg(invert(parseAlg("R U2 F'")))).toBe("F U2 R'");
    expect(formatAlg(simplify(parseAlg("R R U U' R' L L2 L")))).toBe("R");
    expect(formatAlg(mirrorLR(parseAlg("R U R' U' M x r")))).toBe("L' U' L U M x l'");
    // Mirroring twice is the identity; a mirrored sexy move still has order 6.
    const alg = parseAlg("R U R' F' r M2 E x y z'");
    expect(formatAlg(mirrorLR(mirrorLR(alg)))).toBe(formatAlg(alg));
    expect(isSolved(applyMoves(S, [...mirrorLR(parseAlg("(R U R' U')6"))]))).toBe(true);
  });

  it("counts moves in HTM / QTM / STM / ETM", () => {
    const alg = parseAlg("R U2 M' x r");
    expect(moveCount(alg, "htm")).toBe(5); // 1+1+2+0+1
    expect(moveCount(alg, "qtm")).toBe(6); // 1+2+2+0+1
    expect(moveCount(alg, "stm")).toBe(4); // 1+1+1+0+1
    expect(moveCount(alg, "etm")).toBe(5);
  });
});

describe("facelet strings", () => {
  it("round-trips any state and describes the solved cube", () => {
    expect(toFaceletString(S)).toBe("UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB");
    const s = applyMoves(S, "R U F' L2 D B' M y");
    expect(statesEqual(fromFaceletString(toFaceletString(s)), s)).toBe(true);
  });

  it("rejects colour strings that aren't a real cube", () => {
    expect(() => fromFaceletString("U".repeat(54))).toThrow();
    expect(() => fromFaceletString("UUU")).toThrow();
  });
});
