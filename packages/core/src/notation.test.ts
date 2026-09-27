import { describe, expect, it } from "bun:test";
import { formatAlg, parseAlg, parseAlgDocument } from "./index";

describe("algorithm documents", () => {
  it("pauses and comments are part of the text, not moves", () => {
    const text = "R U . R' // insert\nU' . . F";
    expect(formatAlg(parseAlg(text))).toBe("R U R' U' F");
    const doc = parseAlgDocument(text);
    expect(doc.pausesBefore).toEqual([0, 0, 1, 0, 2]);
    expect(doc.comments).toEqual([{ start: 9, end: 18, text: "insert" }]);
  });

  it("every move knows where it was written — repeats and commutator inverses point at the original", () => {
    const text = "(R U)2 [F, D]";
    const doc = parseAlgDocument(text);
    expect(formatAlg(doc.moves)).toBe("R U R U F D F' D'");
    const at = doc.sources.map((s) => text.slice(s.start, s.end));
    expect(at).toEqual(["R", "U", "R", "U", "F", "D", "F", "D"]);
  });
});
