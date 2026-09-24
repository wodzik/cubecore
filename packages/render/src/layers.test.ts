import { describe, expect, it } from "bun:test";
import { FACELETS, MOVE_FAMILIES, faceletAt, movePermutation, rotate, type Amount } from "@cubecore/core";
import { layerTurn } from "./layers";

describe("layerTurn", () => {
  it("rotating a move's layer by its full angle lands every sticker exactly where the move puts it", () => {
    for (const family of MOVE_FAMILIES) {
      for (const amount of [1, 2, -1] as Amount[]) {
        const move = { family, amount };
        const turn = layerTurn(move);
        const quarters = Math.round(turn.angle / (Math.PI / 2));
        const perm = movePermutation(move);
        for (const f of FACELETS) {
          const dest = turn.turns(f.pos) ? faceletAt(rotate(f.pos, turn.axis, quarters), rotate(f.normal, turn.axis, quarters)) : f.index;
          expect(`${family}${amount} ${f.index}→${dest}: ${perm[dest]}`).toBe(`${family}${amount} ${f.index}→${dest}: ${f.index}`);
        }
      }
    }
  });
});
