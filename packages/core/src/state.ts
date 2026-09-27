/**
 * Cube state: 54 stickers, each carrying the index of its HOME facelet in the
 * solved cube (so pieces keep their identity — masks and rendering follow
 * them). A sticker's colour class is its home face: `colorOf(id) = id / 9`.
 *
 * Nothing here assumes a colour scheme or an orientation: "solved" means
 * every face shows a single colour class, whichever it is. Real colours are
 * the renderer's business (colour class → colour of a scheme).
 */

import { CUBIES, CUBIE_OF_FACELET, FACELETS, FACELET_COUNT, FACES, type Face, centerOf } from "./geometry";
import { type Move, type Permutation, movePermutation } from "./moves";
import { parseAlg } from "./notation";

export type State = Uint8Array;

/** Colour class 0..5 = the home face (U R F D L B order) of a sticker. */
export type ColorClass = number;

export function solvedState(): State {
  return Uint8Array.from({ length: FACELET_COUNT }, (_, i) => i);
}

export const colorOf = (sticker: number): ColorClass => (sticker / 9) | 0;

/** Colour class shown at facelet position `i`. */
export const colorAt = (state: State, i: number): ColorClass => colorOf(state[i]);

/** Colour class of the centre currently on `face`. */
export const centerColor = (state: State, face: Face): ColorClass => colorAt(state, centerOf(face));

export function applyPermutation(state: State, perm: Permutation): State {
  const out = new Uint8Array(FACELET_COUNT);
  for (let i = 0; i < FACELET_COUNT; i++) out[i] = state[perm[i]];
  return out;
}

export function applyMove(state: State, move: Move): State {
  return applyPermutation(state, movePermutation(move));
}

export function applyMoves(state: State, moves: readonly Move[] | string): State {
  let s = state;
  for (const m of typeof moves === "string" ? parseAlg(moves) : moves) s = applyMove(s, m);
  return s;
}

export function statesEqual(a: State, b: State): boolean {
  for (let i = 0; i < FACELET_COUNT; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Every face shows one colour (any orientation, any scheme). */
export function isSolved(state: State): boolean {
  for (let f = 0; f < 6; f++) {
    const c = colorAt(state, f * 9 + 4);
    for (let i = 0; i < 9; i++) if (colorAt(state, f * 9 + i) !== c) return false;
  }
  return true;
}

// ─── Colour strings (Kociemba-style facelet strings) ───

/**
 * 54 letters in U R F D L B facelet order, each naming the face whose home
 * colour the sticker has — e.g. the solved cube is "UUUUUUUUURRR…BBB".
 * This is what smart cubes and most solvers exchange.
 */
export function toFaceletString(state: State): string {
  let s = "";
  for (let i = 0; i < FACELET_COUNT; i++) s += FACES[colorAt(state, i)];
  return s;
}

/**
 * Build a state from a facelet string. Stickers get their identity by matching
 * each piece's colour set to its home piece; throws if the colours don't form a
 * real cube (wrong counts or a piece that doesn't exist).
 */
export function fromFaceletString(text: string): State {
  if (text.length !== FACELET_COUNT) throw new Error(`Expected ${FACELET_COUNT} facelets, got ${text.length}`);
  const colors = [...text].map((c) => {
    const i = FACES.indexOf(c as Face);
    if (i < 0) throw new Error(`Unknown facelet "${c}"`);
    return i;
  });
  const homeBySet = new Map<string, number>();
  for (const c of CUBIES) homeBySet.set(c.facelets.map((f) => colorOf(f)).sort().join(","), CUBIES.indexOf(c));
  const state = new Uint8Array(FACELET_COUNT);
  const used = new Set<number>();
  for (const cubie of CUBIES) {
    const set = cubie.facelets.map((f) => colors[f]).sort().join(",");
    const homeIdx = homeBySet.get(set);
    if (homeIdx === undefined) throw new Error(`No piece has colours ${set}`);
    if (used.has(homeIdx)) throw new Error(`Piece with colours ${set} appears twice`);
    used.add(homeIdx);
    const home = CUBIES[homeIdx];
    for (const f of cubie.facelets) state[f] = home.facelets.find((h) => colorOf(h) === colors[f])!;
  }
  return state;
}

// ─── Mutable wrapper for hot paths ───

export class CubeState {
  private s: State;
  constructor(initial: State = solvedState()) {
    this.s = new Uint8Array(initial);
  }
  get state(): State {
    return this.s;
  }
  apply(moves: Move | readonly Move[] | string): this {
    if (typeof moves === "string" || Array.isArray(moves)) this.s = applyMoves(this.s, moves as readonly Move[] | string);
    else this.s = applyMove(this.s, moves as Move);
    return this;
  }
  reset(state: State = solvedState()): this {
    this.s = new Uint8Array(state);
    return this;
  }
  isSolved(): boolean {
    return isSolved(this.s);
  }
  clone(): CubeState {
    return new CubeState(this.s);
  }
}

// Re-exported for convenience.
export { CUBIE_OF_FACELET, FACELETS };

/**
 * The state whose solution is the way from `from` to `to`: solving it gives
 * moves M with applyMoves(from, M) = to. Lets any solver (and so any
 * scramble generator) work from wherever the physical cube is now — a smart
 * cube between attempts doesn't have to be solved first.
 */
export function relativeState(from: State, to: State): State {
  const toInverse = new Uint8Array(FACELET_COUNT);
  for (let i = 0; i < FACELET_COUNT; i++) toInverse[to[i]] = i;
  const out = new Uint8Array(FACELET_COUNT);
  for (let j = 0; j < FACELET_COUNT; j++) out[j] = toInverse[from[j]];
  return out;
}
