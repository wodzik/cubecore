/**
 * Parity with cubing.js (dev dependency only): the same moves must give the
 * same pieces in the same places with the same orientations.
 */
import { describe, expect, it } from "bun:test";
import { cube3x3x3 } from "cubing/puzzles";
import { type Move, applyMoves, formatAlg, solvedState, toCubies } from "./index";

const MOVES_FOR_PARITY: Move[] = (["U", "R", "F", "D", "L", "B"] as const).flatMap((family) => ([1, 2, -1] as const).map((amount) => ({ family, amount })));

// Our (Kociemba) order → cubing.js orbit order.
const CORNERS = ["URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB"]; // ours
const CUBING_CORNERS = ["URF", "UBR", "ULB", "UFL", "DFR", "DLF", "DBL", "DRB"];
const EDGES = ["UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR"]; // ours
const CUBING_EDGES = ["UF", "UR", "UB", "UL", "DF", "DR", "DB", "DL", "FR", "FL", "BR", "BL"];

function random(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

describe("parity with cubing.js kpuzzle", () => {
  it("face-turn sequences give the same pieces and orientations", async () => {
    const kpuzzle = await cube3x3x3.kpuzzle();
    const rnd = random(12345);
    for (let n = 0; n < 40; n++) {
      const moves = Array.from({ length: 25 }, () => MOVES_FOR_PARITY[Math.floor(rnd() * MOVES_FOR_PARITY.length)]);
      const alg = formatAlg(moves);
      const ours = toCubies(applyMoves(solvedState(), moves))!;
      const theirs = kpuzzle.defaultPattern().applyAlg(alg).patternData;
      for (let slot = 0; slot < 8; slot++) {
        const i = CORNERS.indexOf(CUBING_CORNERS[slot]);
        expect(`${alg} corner ${CUBING_CORNERS[slot]}: ${CUBING_CORNERS[theirs.CORNERS.pieces[slot]]}/${theirs.CORNERS.orientation[slot]}`).toBe(
          `${alg} corner ${CUBING_CORNERS[slot]}: ${CORNERS[ours.cp[i]]}/${ours.co[i]}`,
        );
      }
      for (let slot = 0; slot < 12; slot++) {
        const i = EDGES.indexOf(CUBING_EDGES[slot]);
        expect(`${alg} edge ${CUBING_EDGES[slot]}: ${CUBING_EDGES[theirs.EDGES.pieces[slot]]}/${theirs.EDGES.orientation[slot]}`).toBe(
          `${alg} edge ${CUBING_EDGES[slot]}: ${EDGES[ours.ep[i]]}/${ours.eo[i]}`,
        );
      }
    }
  });
});
