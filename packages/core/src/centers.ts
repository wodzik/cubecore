/**
 * Centre spin — the one thing a facelet permutation can't express. After U the
 * U centre is still at facelet 4, but it has turned a quarter; a logo or an
 * arrow drawn on it has to turn too. Supercube-style puzzles (and pictures
 * with a brand logo) need it; solving never does.
 *
 * `CenterSpins[c]` belongs to the centre whose home face is `c` (U R F D L B)
 * and counts counter-clockwise quarter turns (seen from outside) of that
 * centre relative to `FACE_BASIS` of the face it currently sits on: spin 0 =
 * the sticker's "up" points along that face's `b` axis.
 */

import { FACE_BASIS, FACELETS, type Face, type Vec3, faceOfNormal, rotate } from "./geometry";
import { FAMILY, type Move } from "./moves";
import { parseAlg } from "./notation";
import { type State, applyMove } from "./state";

export type CenterSpins = Uint8Array;

export const solvedSpins = (): CenterSpins => new Uint8Array(6);

const eq = (p: Vec3, q: Vec3) => p[0] === q[0] && p[1] === q[1] && p[2] === q[2];

/** `v` turned `q` CCW quarters about the outward normal of `face`. */
function aboutNormal(v: Vec3, face: Face, q: number): Vec3 {
  const n = FACE_BASIS[face].n;
  const axis = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
  return rotate(v, axis, q * (n[axis] as number));
}

/** Direction the centre's "up" points when it sits on `face` with spin `spin`. */
export function centerUp(face: Face, spin: number): Vec3 {
  return aboutNormal(FACE_BASIS[face].b, face, spin);
}

/** Spins after `move` is applied to `state` (the state BEFORE the move). */
export function advanceSpins(spins: CenterSpins, state: State, move: Move): CenterSpins {
  const def = FAMILY[move.family];
  const quarters = def.q * (move.amount === -1 ? -1 : move.amount === 2 ? 2 : 1);
  const out = new Uint8Array(spins);
  for (let c = 0; c < 6; c++) {
    const f = FACELETS[state.indexOf(c * 9 + 4)];
    if (!def.layers.includes(f.pos[def.axis])) continue;
    const up = rotate(centerUp(f.face, spins[c]), def.axis, quarters);
    const face = faceOfNormal(rotate(f.normal, def.axis, quarters));
    for (let k = 0; k < 4; k++) if (eq(centerUp(face, k), up)) out[c] = k;
  }
  return out;
}

/** Spins after a sequence of moves from `start` (whose spins default to 0). */
export function spinsAfter(start: State, moves: readonly Move[] | string, spins: CenterSpins = solvedSpins()): CenterSpins {
  let s = start;
  let out = spins;
  for (const m of typeof moves === "string" ? parseAlg(moves) : moves) {
    out = advanceSpins(out, s, m);
    s = applyMove(s, m);
  }
  return out;
}
