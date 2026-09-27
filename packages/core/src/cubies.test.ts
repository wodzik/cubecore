import { describe, expect, it } from "bun:test";
import {
  CORNER_FACELETS,
  CUBIE_OF_FACELET,
  EDGE_FACELETS,
  FACELETS,
  applyMoves,
  decodeState,
  encodeState,
  fromBase64Url,
  fromCubies,
  isSolvable,
  solvedState,
  statesEqual,
  toBase64Url,
  toCubies,
} from "./index";

const S = solvedState();
const SCRAMBLES = ["", "R", "R U R' U'", "F2 R' D L2 R U R' L' U' L R' U' R L U L'", "M' U M U2 x y' r' D2 b", "D2 F' L2 U R2 B' D L' F2 U' R B2 L D' F R' U2 B L2 D"];

describe("pieces", () => {
  it("the Kociemba facelet tables name real pieces (each group is one cubie)", () => {
    for (const g of [...CORNER_FACELETS, ...EDGE_FACELETS]) expect(new Set(g.map((f) => CUBIE_OF_FACELET[f])).size).toBe(1);
    expect(CORNER_FACELETS.every(([ud]) => FACELETS[ud].face === "U" || FACELETS[ud].face === "D")).toBe(true);
  });

  it("solved = identity; states round-trip through pieces, rotations and slices included", () => {
    const c = toCubies(S)!;
    expect(c.cp).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(c.eo.every((x) => x === 0) && c.co.every((x) => x === 0)).toBe(true);
    for (const scr of SCRAMBLES) {
      const s = applyMoves(S, scr);
      const cs = toCubies(s)!;
      expect(isSolvable(cs)).toBe(true);
      expect(statesEqual(fromCubies(cs), s)).toBe(true);
    }
  });

  it("a twisted corner is recognised as unsolvable", () => {
    const c = toCubies(S)!;
    c.co[0] = 1;
    expect(isSolvable(c)).toBe(false);
  });
});

describe("state codec", () => {
  it("any state in 15 characters, and back", () => {
    for (const scr of SCRAMBLES) {
      const s = applyMoves(S, scr);
      const code = encodeState(s)!;
      expect(code.length).toBe(15);
      expect(statesEqual(decodeState(code)!, s)).toBe(true);
    }
  });

  it("strict: garbage, wrong version, trailing bytes and impossible states are rejected", () => {
    expect(decodeState("")).toBeNull();
    expect(decodeState("!!!")).toBeNull();
    const code = encodeState(applyMoves(S, "R U"))!;
    const bytes = fromBase64Url(code)!;
    bytes[0] = 2; // unknown version
    expect(decodeState(toBase64Url(bytes))).toBeNull();
    expect(decodeState(`${code}AAAA`)).toBeNull();
    const twisted = toCubies(S)!;
    twisted.cp = [1, 0, 2, 3, 4, 5, 6, 7]; // a single corner swap: odd parity, edges even
    expect(encodeState(fromCubies(twisted))).toBeNull();
  });
});

describe("facelet strings", () => {
  it("round-trip, solved is UUUUUUUUURRR…, and any letters work as long as centres differ", async () => {
    const { faceletsOf, stateFromFacelets } = await import("./index");
    expect(faceletsOf(S)).toBe("U".repeat(9) + "R".repeat(9) + "F".repeat(9) + "D".repeat(9) + "L".repeat(9) + "B".repeat(9));
    for (const scr of SCRAMBLES.filter((x) => !/[xyzMESrludfb]/.test(x))) {
      const s = applyMoves(S, scr);
      expect(statesEqual(stateFromFacelets(faceletsOf(s))!, s)).toBe(true);
      const colours = faceletsOf(s).replace(/[URFDLB]/g, (c) => "wrgyob"["URFDLB".indexOf(c)]);
      expect(statesEqual(stateFromFacelets(colours)!, s)).toBe(true);
    }
    expect(stateFromFacelets("U".repeat(54))).toBeNull();
    const twisted = faceletsOf(S).split("");
    [twisted[8], twisted[9], twisted[20]] = [twisted[9], twisted[20], twisted[8]];
    expect(stateFromFacelets(twisted.join(""))).toBeNull();
  });
});
