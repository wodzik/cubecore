/**
 * The cube as pieces: corner / edge permutation and orientation in the
 * standard (Kociemba) numbering, plus how the centres are turned (a Frame).
 * The compact state codec and the two-phase solver work on this; everything
 * else in cubecore uses the 54-sticker State.
 *
 * Corners URF UFL ULB UBR DFR DLF DBL DRB, edges UR UF UL UB DR DF DL DB FR FL
 * BL BR. Corner twist counts how far the U/D sticker is turned from the U/D
 * position (0..2, clockwise); an edge is flipped (1) when its first sticker —
 * the U/D one, or F/B for the middle-layer edges — isn't in the first place.
 */

import { FRAMES, type Frame, view } from "./frames";
import type { State } from "./state";

/** Facelets of each corner position, U/D sticker first, then clockwise. */
export const CORNER_FACELETS: readonly (readonly [number, number, number])[] = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
];
/** Facelets of each edge position, the reference sticker first. */
export const EDGE_FACELETS: readonly (readonly [number, number])[] = [
  [5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25],
  [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14],
];

export interface CubieState {
  /** How the centres are turned (FRAMES id 0 = at home). */
  frame: Frame;
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
}

const centresHome = (s: State) => [0, 1, 2, 3, 4, 5].every((f) => s[f * 9 + 4] === f * 9 + 4);

/** Pieces of a state, or null if it isn't made of real pieces. */
export function toCubies(state: State): CubieState | null {
  const frame = FRAMES.find((f) => centresHome(view(state, f)));
  if (!frame) return null;
  const s = view(state, frame);
  const cp: number[] = [], co: number[] = [], ep: number[] = [], eo: number[] = [];
  for (const pos of CORNER_FACELETS) {
    const st = pos.map((f) => s[f]);
    const j = CORNER_FACELETS.findIndex((home) => home.includes(st[0]));
    if (j < 0) return null;
    const home = CORNER_FACELETS[j];
    const k = st.indexOf(home[0]);
    if (k < 0 || st[(k + 1) % 3] !== home[1] || st[(k + 2) % 3] !== home[2]) return null;
    cp.push(j);
    co.push(k);
  }
  for (const pos of EDGE_FACELETS) {
    const st = pos.map((f) => s[f]);
    const j = EDGE_FACELETS.findIndex((home) => home.includes(st[0]));
    if (j < 0) return null;
    const home = EDGE_FACELETS[j];
    const flip = st[0] === home[0] ? 0 : 1;
    if (st[1 - flip] !== home[1]) return null;
    ep.push(j);
    eo.push(flip);
  }
  if (new Set(cp).size !== 8 || new Set(ep).size !== 12) return null;
  return { frame, cp, co, ep, eo };
}

export function fromCubies(c: CubieState): State {
  const s = new Uint8Array(54);
  for (let f = 0; f < 6; f++) s[f * 9 + 4] = f * 9 + 4;
  CORNER_FACELETS.forEach((pos, i) => {
    for (let n = 0; n < 3; n++) s[pos[(n + c.co[i]) % 3]] = CORNER_FACELETS[c.cp[i]][n];
  });
  EDGE_FACELETS.forEach((pos, i) => {
    for (let n = 0; n < 2; n++) s[pos[(n + c.eo[i]) % 2]] = EDGE_FACELETS[c.ep[i]][n];
  });
  // `s` is the state seen with centres at home; put it back into the cube's own positions.
  const state = new Uint8Array(54);
  for (let i = 0; i < 54; i++) state[c.frame.map[i]] = s[i];
  return state;
}

/** Parity of a permutation (0 even, 1 odd). */
export function parity(p: readonly number[]): number {
  let odd = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) odd ^= 1;
  return odd;
}

/** Reachable by turning (not a reassembled cube): twist sum ≡ 0 mod 3, flips even, equal parities. */
export function isSolvable(c: CubieState): boolean {
  return c.co.reduce((a, b) => a + b, 0) % 3 === 0 && c.eo.reduce((a, b) => a + b, 0) % 2 === 0 && parity(c.cp) === parity(c.ep);
}

// ─── ranks (for coordinates and the codec) ───

/** Lehmer rank of a permutation of 0..n-1: 0 .. n!-1. */
export function permRank(p: readonly number[]): number {
  let r = 0;
  const n = p.length;
  for (let i = 0; i < n; i++) {
    let smaller = 0;
    for (let j = i + 1; j < n; j++) if (p[j] < p[i]) smaller++;
    r = r * (n - i) + smaller;
  }
  return r;
}

export function permUnrank(rank: number, n: number): number[] {
  const digits: number[] = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    digits[i] = rank % (n - i);
    rank = Math.floor(rank / (n - i));
  }
  const pool = Array.from({ length: n }, (_, i) => i);
  return digits.map((d) => pool.splice(d, 1)[0]);
}

// ─── facelet strings ───

const FACE_LETTERS = "URFDLB";

/**
 * A state from a 54-letter facelet string (Kociemba order U1…U9 R1… F1… D1…
 * L1… B1…, each letter the face whose colour is there) — what smart cubes
 * report and many tools exchange. Colours are read against the centres, so
 * any letters work as long as each centre has its own. Null if the string
 * isn't a reachable cube.
 */
export function stateFromFacelets(text: string): State | null {
  if (text.length !== 54) return null;
  const centreOf = new Map<string, number>();
  for (let f = 0; f < 6; f++) centreOf.set(text[f * 9 + 4], f);
  if (centreOf.size !== 6) return null;
  const colour = (i: number) => centreOf.get(text[i]);
  const cls = (facelet: number) => Math.floor(facelet / 9); // home colour class of a facelet
  const cp: number[] = [], co: number[] = [], ep: number[] = [], eo: number[] = [];
  for (const pos of CORNER_FACELETS) {
    const cols = pos.map(colour);
    let found = false;
    for (let j = 0; j < 8 && !found; j++) {
      const home = CORNER_FACELETS[j].map(cls);
      for (let k = 0; k < 3; k++) {
        if (cols[k] === home[0] && cols[(k + 1) % 3] === home[1] && cols[(k + 2) % 3] === home[2]) {
          cp.push(j);
          co.push(k);
          found = true;
          break;
        }
      }
    }
    if (!found) return null;
  }
  for (const pos of EDGE_FACELETS) {
    const cols = pos.map(colour);
    const j = EDGE_FACELETS.findIndex((home) => {
      const h = home.map(cls);
      return (cols[0] === h[0] && cols[1] === h[1]) || (cols[0] === h[1] && cols[1] === h[0]);
    });
    if (j < 0) return null;
    ep.push(j);
    eo.push(cols[0] === cls(EDGE_FACELETS[j][0]) ? 0 : 1);
  }
  const c: CubieState = { frame: FRAMES[0], cp, co, ep, eo };
  if (new Set(cp).size !== 8 || new Set(ep).size !== 12 || !isSolvable(c)) return null;
  return fromCubies(c);
}

/** The 54-letter facelet string of a state (each letter = the colour class's home face). */
export function faceletsOf(state: State): string {
  return Array.from(state, (sticker) => FACE_LETTERS[Math.floor(sticker / 9)]).join("");
}
