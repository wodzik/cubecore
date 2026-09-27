/**
 * Old Pochmann memorisation. Starting from the buffer, follow where each
 * sticker belongs: the sticker in the buffer belongs at A → remember A; the
 * sticker at A belongs at B → remember B; … until the buffer's own piece
 * comes back. Pieces left unsolved start new cycles (a cycle break: shoot
 * to one of their stickers, follow, and finish on that piece again) — which
 * also covers flipped edges and twisted corners in place.
 *
 * Executing: each letter is one swap of the buffer piece with the lettered
 * sticker's piece (edges: T-perm with setup moves, corners: Y-perm). An odd
 * number of edge letters means parity (an extra algorithm between edges and
 * corners).
 *
 * Buffers: UR for edges, ULB for corners (the usual OP buffers).
 */

import { CORNER_FACELETS, EDGE_FACELETS, type Move, type State, applyMove, applyMoves, parseAlg, relativeState, solvedState } from "@cubecore/core";
import { type LetterScheme, RUWIX } from "./scheme";

/** Edge buffer: the U sticker of UR. */
export const EDGE_BUFFER = 5;
/** Corner buffer: the U sticker of ULB. */
export const CORNER_BUFFER = 0;

export interface Memo {
  /** Letters to remember, edges first. */
  edges: string[];
  corners: string[];
  /** The sticker position of each letter (what to shoot to). */
  edgeTargets: number[];
  cornerTargets: number[];
  /** Odd number of edge letters: do the parity algorithm between edges and corners. */
  parity: boolean;
}

export interface MemoOptions {
  scheme?: LetterScheme;
  /**
   * How the cube is held while solving, as rotations from its own U on top /
   * F in front — e.g. "x2 y'" = yellow on top, orange in front for a cube
   * with white U and green F. Letters go by the positions as held.
   */
  rotation?: string | readonly Move[];
  edgeBuffer?: number;
  cornerBuffer?: number;
}

/** Sticker positions of each piece, rotated so a given sticker comes first (clockwise for corners). */
function pieces(groups: readonly (readonly number[])[]): { pieceOf: Map<number, number>; from: (sticker: number) => number[] } {
  const pieceOf = new Map<number, number>();
  groups.forEach((g, i) => g.forEach((f) => pieceOf.set(f, i)));
  const from = (sticker: number) => {
    const g = groups[pieceOf.get(sticker)!];
    const k = g.indexOf(sticker);
    return [...g.slice(k), ...g.slice(0, k)];
  };
  return { pieceOf, from };
}
const EDGES = pieces(EDGE_FACELETS);
const CORNERS = pieces(CORNER_FACELETS);

/** Targets (sticker positions) for one kind of piece. */
function trace(state: State, kind: typeof EDGES, buffer: number, order: readonly number[]): number[] {
  const piece = (f: number) => kind.pieceOf.get(f)!;
  const bufferPiece = piece(buffer);
  const solved = (p: number) => kind.from(order.find((f) => piece(f) === p)!).every((f) => state[f] === f);
  const visited = new Set([bufferPiece]);
  const targets: number[] = [];
  // The first cycle, from the buffer.
  let t = state[buffer];
  while (piece(t) !== bufferPiece) {
    targets.push(t);
    visited.add(piece(t));
    t = state[t];
  }
  // Cycle breaks: unsolved pieces not reached yet, in letter order.
  for (const start of order) {
    const p = piece(start);
    if (visited.has(p) || solved(p)) continue;
    targets.push(start);
    visited.add(p);
    t = state[start];
    while (piece(t) !== p) {
      targets.push(t);
      visited.add(piece(t));
      t = state[t];
    }
    targets.push(t);
  }
  return targets;
}

/** Sticker positions of a kind, in the scheme's letter order (cycle breaks go to the lowest letter). */
const letterOrder = (letters: Record<number, string>) =>
  Object.keys(letters)
    .map(Number)
    .sort((a, b) => letters[a].localeCompare(letters[b]));

const CENTRES = [4, 13, 22, 31, 40, 49];

/** The 24 whole-cube rotations as states (a solved cube turned in your hands). */
const ROTATIONS: State[] = (() => {
  const out = [solvedState()];
  const seen = new Set([out[0].join(",")]);
  const turns = parseAlg("x y");
  for (let i = 0; i < out.length; i++) {
    for (const t of turns) {
      const next = applyMove(out[i], t);
      const key = next.join(",");
      if (!seen.has(key)) {
        seen.add(key);
        out.push(next);
      }
    }
  }
  return out;
})();

/**
 * The state with positions and sticker names as held: turned by `rotation`
 * if given, and with the centres where they are now counted as home (a
 * state after rotations, e.g. "… x2 y'", reads the way the cube is now held).
 */
export function asHeld(state: State, rotation?: string | readonly Move[]): State {
  const s = rotation ? applyMoves(state, rotation) : new Uint8Array(state);
  const turned = ROTATIONS.find((r) => CENTRES.every((c) => r[c] === s[c]));
  return turned ? relativeState(s, turned) : s;
}

/** The letters to remember for `state`. */
export function memo(input: State, options: MemoOptions = {}): Memo {
  const state = asHeld(input, options.rotation);
  const scheme = options.scheme ?? RUWIX;
  const edgeTargets = trace(state, EDGES, options.edgeBuffer ?? EDGE_BUFFER, letterOrder(scheme.edges));
  const cornerTargets = trace(state, CORNERS, options.cornerBuffer ?? CORNER_BUFFER, letterOrder(scheme.corners));
  return {
    edges: edgeTargets.map((f) => scheme.edges[f]),
    corners: cornerTargets.map((f) => scheme.corners[f]),
    edgeTargets,
    cornerTargets,
    parity: edgeTargets.length % 2 === 1,
  };
}

/** Letters in pairs, the usual way to write memo: "QU SR NX IV PR DE". */
export const formatMemo = (letters: readonly string[]): string =>
  letters.reduce((out, l, i) => out + (i > 0 && i % 2 === 0 ? " " : "") + l, "");

/**
 * The effect of one letter on the pieces of its kind: the buffer piece and
 * the target's piece swap, the buffer sticker going to the target sticker
 * (what the setup + T-perm / Y-perm + undo do to that kind of piece).
 */
export function swapToTarget(state: State, kind: "edge" | "corner", target: number, buffer = kind === "edge" ? EDGE_BUFFER : CORNER_BUFFER): State {
  const k = kind === "edge" ? EDGES : CORNERS;
  const b = k.from(buffer), t = k.from(target);
  const out = new Uint8Array(state);
  b.forEach((bf, i) => {
    out[t[i]] = state[bf];
    out[bf] = state[t[i]];
  });
  return out;
}

/** Sticker positions of edges / corners (to compare only one kind of piece). */
export const EDGE_POSITIONS: readonly number[] = EDGE_FACELETS.flat();
export const CORNER_POSITIONS: readonly number[] = CORNER_FACELETS.flat();

export const samePieces = (a: State, b: State, positions: readonly number[]): boolean => positions.every((p) => a[p] === b[p]);

/** Two sticker positions on the same edge / corner. */
export const samePiece = (kind: "edge" | "corner", a: number, b: number): boolean => {
  const k = kind === "edge" ? EDGES : CORNERS;
  return k.pieceOf.get(a) === k.pieceOf.get(b);
};

/** The whole-cube rotation state with these centres (a solved cube as held), or null. */
export const rotationState = (rotation: string | readonly Move[]): State => applyMoves(solvedState(), rotation);
