import { describe, expect, it } from "bun:test";
import { AlgMatcher, effectKey } from "./algMatch";
import { formatMove } from "./moves";
import { toFaceTurns } from "./physical";

describe("algorithms by what they do", () => {
  it("one effect however it's written: M' = r R' = R' L = L R'; U U = U2'; rotations don't count", () => {
    expect(effectKey("M'")).toBe(effectKey("r R'"));
    expect(effectKey("M'")).toBe(effectKey("R' L"));
    expect(effectKey("R' L")).toBe(effectKey("L R'"));
    expect(effectKey("U U")).toBe(effectKey("U2'"));
    expect(effectKey("y R U R' y'")).toBe(effectKey("B U B'"));
    expect(effectKey("R U")).not.toBe(effectKey("U R"));
  });

  it("finds the algorithm at the end of a solve's moves, the setup before it, and the AUFs", () => {
    const m = new AlgMatcher<string>();
    m.add("R U R' U' R' F R2 U' R' U' R U R' F'", "T");
    m.add("(R U R' U) R U2 R'", "Sune");
    // A setup (F2 D), an AUF, then Sune — with a slip corrected on the way (U2 U' for its U).
    const r = m.matchSuffix("F2 D U R U R' U2 U' R U2 R'");
    expect(r).toEqual({ data: "Sune", start: 2, preAuf: "U", postAuf: "" });
    expect(m.matchSuffix("R U R' U' R' F R2 U' R' U' R U R' F' U2")).toEqual({ data: "T", start: 0, preAuf: "", postAuf: "U2" });
    expect(m.matchSuffix("R U2 L")).toBeNull();
  });

  it("a slice done as a smart cube reports it, or written another way, matches the algorithm written with M", () => {
    const m = new AlgMatcher<string>();
    m.add("r U R' U' M2 U R U' R' U' M'", "OLL 20");
    const reported = toFaceTurns("r U R' U' M2 U R U' R' U' M'").moves.map(formatMove).join(" ");
    expect(m.match(reported)?.data).toBe("OLL 20");
    expect(m.match("r U R' U' r2 R2 U R U' R' U' r R'")?.data).toBe("OLL 20");
  });
});
