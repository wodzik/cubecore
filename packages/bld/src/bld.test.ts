import { describe, expect, it } from "bun:test";
import { applyMoves, formatAlg, invert, isSolved, parseAlg, solvedState } from "@cubecore/core";
import { CORNER_POSITIONS, EDGE_POSITIONS, RUWIX, SPEFFZ, asHeld, formatMemo, memo, swapToTarget } from "./index";

const randomAlg = (n: number, seed: number) => {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  return Array.from({ length: n }, () => "URFDLB"[Math.floor(rnd() * 6)] + ["", "'", "2"][Math.floor(rnd() * 3)]).join(" ");
};

describe("letter schemes", () => {
  it("24 letters each, as in the pictures", () => {
    for (const s of [RUWIX, SPEFFZ]) {
      expect(new Set(Object.values(s.edges)).size).toBe(24);
      expect(new Set(Object.values(s.corners)).size).toBe(24);
    }
    expect([RUWIX.corners[0], RUWIX.edges[1], RUWIX.corners[2], RUWIX.edges[5]]).toEqual(["A", "A", "B", "B"]); // U face
    expect(RUWIX.corners[18]).toBe("E"); // F top-left (ruwix: U, F, R, B, L, D)
    expect(SPEFFZ.corners[18]).toBe("I"); // Speffz: U, L, F, R, B, D
  });
});

describe("memo", () => {
  it("the ruwix.com example (scrambled in WCA orientation, solved yellow top / orange front)", () => {
    const state = applyMoves(solvedState(), "R2 B2 D R2 D' U' R2 F2 L2 B2 D2 F U2 R' F U' L2 B L F2 U x2 y'");
    const m = memo(state);
    expect(m.edges.join("")).toBe("HVPUEFTXDWAM");
    expect(m.corners.join("")).toBe("WUOIRJ");
    expect(formatMemo(m.edges)).toBe("HV PU EF TX DW AM");
  });

  it("doing every letter's swap solves the cube (random scrambles, cycle breaks, flips, twists)", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const state = asHeld(applyMoves(solvedState(), randomAlg(25, seed)));
      const m = memo(state);
      let s = state;
      for (const t of m.edgeTargets) s = swapToTarget(s, "edge", t);
      for (const t of m.cornerTargets) s = swapToTarget(s, "corner", t);
      expect(EDGE_POSITIONS.every((p) => s[p] === p) && CORNER_POSITIONS.every((p) => s[p] === p)).toBe(true);
      expect(m.parity).toBe(m.cornerTargets.length % 2 === 1);
    }
  });

  it("flipped edges and twisted corners in place", () => {
    // Superflip-ish: two edges flipped in place → both stickers of each.
    const flip2 = applyMoves(solvedState(), "M' U M' U M' U M' U2 M' U M' U M' U M'"); // flips UF and UB
    const m = memo(flip2);
    expect(m.edges.length).toBe(4);
    expect(m.corners).toEqual([]);
    expect(isSolved(solvedState())).toBe(true);
    void formatAlg; void invert; void parseAlg;
  });
});

describe("BldTracker", () => {
  it("follows the swaps letter by letter, parity included, and spots a wrong letter", async () => {
    const { BldTracker } = await import("./tracker");
    const T = parseAlg("R U R' U' R' F R2 U' R' U' R U R' F'"); // swaps UR (buffer) and UL (target: RUWIX edge D at facelet 3)
    const start = applyMoves(solvedState(), T); // a cube where only UR/UL are swapped (plus UFR/UBR corners)
    const t = new BldTracker(start);
    expect(t.memo.edges).toEqual(["D"]); // one letter → parity
    expect(t.memo.parity).toBe(true);
    let p = t.progress;
    for (const m of T) p = t.push(m);
    expect(p.done).toBe(1); // edge D done; parity due (the T-perm swapped two corners)
    expect(p.steps[1].kind).toBe("parity");
    for (const m of T) p = t.push(m); // anything that puts the corners back as they were counts for parity
    expect(p.done).toBe(2);
    expect(p.steps[2].kind).toBe("corner");
  });

  it("a wrong target is reported", async () => {
    const { BldTracker } = await import("./tracker");
    const T = parseAlg("R U R' U' R' F R2 U' R' U' R U R' F'");
    const start = applyMoves(solvedState(), "L2 " + formatAlg(T) + " L2"); // buffer ↔ DL (letter by L2 setup)
    const t = new BldTracker(start);
    let p = t.progress;
    for (const m of T) p = t.push(m); // did the UL swap instead
    expect(p.wrong?.got).toBe("D");
    expect(p.done).toBe(0);
  });

  it("memo as held (yellow on top) from a smart cube's own frame", async () => {
    const { BldTracker } = await import("./tracker");
    const scr = "R2 B2 D R2 D' U' R2 F2 L2 B2 D2 F U2 R' F U' L2 B L F2 U";
    const t = new BldTracker(applyMoves(solvedState(), scr), { rotation: "x2 y'" });
    expect(t.memo.edges.join("")).toBe("HVPUEFTXDWAM");
  });
});

describe("letterSkin", () => {
  it("a letter per corner / edge sticker; held letters and upright turns", async () => {
    const { letterSkin } = await import("./skin");
    const skin = letterSkin({ decals: [] } as never);
    expect(skin.decals).toHaveLength(48);
    expect(skin.decals!.every((d) => d.rotate === 0)).toBe(true);
    const held = letterSkin({ decals: [] } as never, { rotation: "x2" }); // D on top: the D stickers carry U letters
    const onD = held.decals!.find((d) => d.select.stickers![0] === 27)!; // D top-left (as the D face is drawn)
    expect(onD.image).toContain(">");
    expect(held.decals!.some((d) => d.rotate !== 0)).toBe(true);
  });
});
