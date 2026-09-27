import { describe, expect, it } from "bun:test";
import { FRAMES, applyMoves, checks, fromCubies, invert, parseAlg, solvedState } from "@cubecore/core";
import { OLL_CASES, PLL_CASES, recognizeLastLayer, recognizeOll, recognizePll } from "./cases";

const perms = (n: number): number[][] => (n === 1 ? [[0]] : perms(n - 1).flatMap((p) => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)])));
const parity = (p: number[]) => p.reduce((acc, v, i) => acc + p.slice(i + 1).filter((w) => w < v).length, 0) % 2;
const rest = <T>(ll: T[], home: (i: number) => T, n: number) => [...ll, ...Array.from({ length: n - 4 }, (_, i) => home(i + 4))];

describe("OLL / PLL recognition", () => {
  it("every last-layer orientation is exactly one OLL case (216 → 57 + skip)", () => {
    const seen = new Set<string>();
    for (let c = 0; c < 81; c++) {
      const co = [c % 3, ((c / 3) | 0) % 3, ((c / 9) | 0) % 3, ((c / 27) | 0) % 3];
      if (co.reduce((a, b) => a + b, 0) % 3) continue;
      for (let e = 0; e < 16; e++) {
        const eo = [0, 1, 2, 3].map((i) => (e >> i) & 1);
        if (eo.reduce((a, b) => a + b, 0) % 2) continue;
        const s = fromCubies({ frame: FRAMES[0], cp: [0, 1, 2, 3, 4, 5, 6, 7], co: rest(co, () => 0, 8), ep: Array.from({ length: 12 }, (_, i) => i), eo: rest(eo, () => 0, 12) });
        seen.add(recognizeOll(s)?.id ?? "skip");
      }
    }
    expect(seen.size).toBe(58);
  });

  it("every last-layer permutation is exactly one PLL case (288 → 21 + skip)", () => {
    const seen = new Set<string>();
    for (const cp of perms(4)) for (const ep of perms(4)) {
      if (parity(cp) !== parity(ep)) continue;
      const s = fromCubies({ frame: FRAMES[0], cp: rest(cp, (i) => i, 8), co: new Array(8).fill(0), ep: rest(ep, (i) => i, 12), eo: new Array(12).fill(0) });
      seen.add(recognizePll(s)?.id ?? "skip");
    }
    expect(seen.size).toBe(22);
  });

  it("pre-AUF + the case's algorithm does the job, from any angle", () => {
    for (const kase of OLL_CASES) {
      for (const angle of ["", "U", "U2", "U'"]) {
        const s = applyMoves(solvedState(), [...invert(parseAlg(kase.alg)), ...parseAlg(angle)]);
        const m = recognizeOll(s)!;
        expect(m.id).toBe(kase.id);
        expect(checks.topOriented(applyMoves(s, `${m.preAuf} ${kase.alg}`))).toBe(true);
      }
    }
    for (const kase of PLL_CASES) {
      for (const angle of ["", "U", "U2", "U'"]) {
        const s = applyMoves(solvedState(), [...parseAlg(angle), ...invert(parseAlg(kase.alg)), ...parseAlg(angle)]);
        const m = recognizePll(s)!;
        expect(m.id).toBe(kase.id);
        expect(checks.solvedUpToAuf(applyMoves(s, `${m.preAuf} ${kase.alg}`))).toBe(true);
      }
    }
  });

  it("colour neutral: last layer on any face", () => {
    const t = PLL_CASES.find((c) => c.id === "T")!;
    const s = applyMoves(solvedState(), [...invert(parseAlg(t.alg)), ...parseAlg("x2 y")]); // held upside down: last layer on D
    // As a smart cube sees it (centres fixed): the same case, the last layer on the physical D.
    const r = recognizeLastLayer(s)!;
    expect(r.pll && r.pll !== "skip" && r.pll.id).toBe("T");
    const sune = applyMoves(solvedState(), "R U R' U R U2 R'");
    const found = recognizeLastLayer(applyMoves(sune, "z"))!; // last layer on a side
    expect(found.oll !== "skip" && found.oll.group).toBe("OCLL");
  });
});

describe("which case came up, in a solve", async () => {
  const { MethodTracker, toFaceTurns } = await import("@cubecore/core");
  const { CFOP } = await import("./index");

  it("OLL after F2L and PLL after OLL, colour neutral", () => {
    const sune = "R U R' U R U2 R'";
    const tperm = PLL_CASES.find((c) => c.id === "T")!.alg;
    // The cube as a smart cube reports it: face turns only, last layer on D (held upside down: x2).
    const caseState = applyMoves(solvedState(), toFaceTurns(parseAlg(`x2 ${formatInv(tperm)} ${formatInv(sune)}`)).moves);
    const t = new MethodTracker(CFOP, caseState);
    expect(t.current.next).toBe("oll");
    expect(t.current.case).toBe("OLL 27");
    for (const m of toFaceTurns(parseAlg(`x2 ${sune}`)).moves) t.push(m);
    const oll = t.boundaries.find((b) => b.stage === "oll")!;
    expect(oll.case).toBe("OLL 27");
    expect(t.current.case).toBe("T");
    for (const m of toFaceTurns(parseAlg(`x2 ${tperm}`)).moves) t.push(m);
    expect(t.boundaries.find((b) => b.stage === "pll")!.case).toBe("T");
  });
});

function formatInv(alg: string): string {
  return invert(parseAlg(alg)).map((m) => m.family + (m.amount === 2 ? "2" : m.amount === -1 ? "'" : "")).join(" ");
}
