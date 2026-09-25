/**
 * Last-six-edges solver (Roux 4a–4c): M and U moves only, with the blocks
 * and CMLL solved. Small enough for an exact table: breadth-first from the
 * stage's goal states over what the stage is about (for EOLR: orientation
 * of the six edges, where UL / UR are, centres, corner AUF — ~15 000
 * combinations), keeping one state of each as a trainer case.
 *
 * States are read with the blocks at home: a smart cube reports an M as
 * R L' with the centres fixed, which to the solver looks like the whole
 * cube turned by x — so the state is first turned back by x^k until the
 * blocks are home (the centres then show the M offset, as on the real cube).
 */

import {
  CORNER_FACELETS,
  EDGE_FACELETS,
  type Frame,
  IDENTITY_FRAME,
  type LseStageDef,
  type Move,
  type State,
  applyMove,
  applyMoves,
  parseAlg,
  reframe,
  solvedState,
  unreframe,
} from "@cubecore/core";

const LSE_MOVES = parseAlg("U U2 U' M M2 M'");
const X_TURNS = ["", "x", "x2", "x'"];
/** Edges the M / U moves never touch (DR DL FR FL BL BR) and the D corners — the blocks. */
const BLOCK_FACELETS = [4, 6, 8, 9, 10, 11].flatMap((e) => EDGE_FACELETS[e]).concat([4, 5, 6, 7].flatMap((c) => CORNER_FACELETS[c]));
/** Six LSE edge positions: UF UB DF DB UL UR. */
const LSE_SLOTS = [1, 3, 5, 7, 2, 0];
const REFERENCE = new Set(EDGE_FACELETS.map((f) => f[0]));
const UL = new Set(EDGE_FACELETS[2]), UR = new Set(EDGE_FACELETS[0]);
const CENTRES = [4, 13, 22, 31, 40, 49];
const U_CORNERS = [0, 1, 2, 3].flatMap((c) => CORNER_FACELETS[c]);

/** The state turned by x^k so the blocks are home, or null if they aren't solved. */
function blocksHome(state: State): State | null {
  for (const x of X_TURNS) {
    const t = x ? applyMoves(state, x) : state;
    if (BLOCK_FACELETS.every((f) => t[f] === f)) return t;
  }
  return null;
}

/** EOLR features of a blocks-home state. */
function eolrKey(s: State): string {
  const eo = LSE_SLOTS.map((j) => (REFERENCE.has(s[EDGE_FACELETS[j][0]]) ? 0 : 1)).join("");
  const at = (piece: Set<number>) => LSE_SLOTS.findIndex((j) => piece.has(s[EDGE_FACELETS[j][0]]));
  return `${eo}|${at(UL)}${at(UR)}|${CENTRES.map((c) => s[c]).join(".")}|${U_CORNERS.map((f) => s[f]).join(".")}`;
}

export interface LseSolveOptions {
  /** Hold the cube this way (colour neutral). */
  frame?: Frame;
  all?: boolean;
  limit?: number;
}

export class LseSolver {
  /** feature → distance and one state with those features */
  private readonly table = new Map<string, { d: number; state: State }>();
  private readonly byDepth: State[][] = [];

  constructor(readonly def: LseStageDef) {
    let frontier: State[] = [];
    for (const g of def.goals) {
      const s = applyMoves(solvedState(), g);
      const k = eolrKey(s);
      if (!this.table.has(k)) {
        this.table.set(k, { d: 0, state: s });
        frontier.push(s);
      }
    }
    for (let d = 0; frontier.length; d++) {
      this.byDepth[d] = frontier;
      const next: State[] = [];
      for (const s of frontier) {
        for (const m of LSE_MOVES) {
          const t = applyMove(s, m);
          const k = eolrKey(t);
          if (!this.table.has(k)) {
            this.table.set(k, { d: d + 1, state: t });
            next.push(t);
          }
        }
      }
      frontier = next;
    }
  }

  /** Deepest level. */
  get maxDepth(): number {
    return this.byDepth.length - 1;
  }

  private canonical(state: State, frame: Frame): State | null {
    return blocksHome(frame === IDENTITY_FRAME ? state : reframe(state, frame));
  }

  /** Fewest M / U moves to the stage (−1 if the blocks and CMLL aren't solved). */
  distance(state: State, options: LseSolveOptions = {}): number {
    const s = this.canonical(state, options.frame ?? IDENTITY_FRAME);
    return s ? (this.table.get(eolrKey(s))?.d ?? -1) : -1;
  }

  /** Optimal solutions in M and U moves (every one with `all`). */
  solve(state: State, options: LseSolveOptions = {}): Move[][] {
    const start = this.canonical(state, options.frame ?? IDENTITY_FRAME);
    if (!start) return [];
    const d0 = this.table.get(eolrKey(start))?.d;
    if (d0 === undefined) return [];
    const limit = options.all ? (options.limit ?? 256) : 1;
    const out: Move[][] = [];
    const walk = (s: State, d: number, path: Move[]): void => {
      if (out.length >= limit) return;
      if (d === 0) return void out.push([...path]);
      for (const m of LSE_MOVES) {
        if (path.length && path[path.length - 1].family === m.family) continue;
        const t = applyMove(s, m);
        if (this.table.get(eolrKey(t))?.d === d - 1) walk(t, d - 1, [...path, m]);
      }
    };
    walk(start, d0, []);
    return out;
  }

  nextMoves(state: State, options: LseSolveOptions = {}): Move[] {
    const seen = new Map<string, Move>();
    for (const s of this.solve(state, { ...options, all: true })) if (s[0]) seen.set(`${s[0].family}${s[0].amount}`, s[0]);
    return [...seen.values()];
  }

  /**
   * A case exactly `depth` M / U moves from the stage, as a state a cube
   * can show with its centres home (turned by x when the case has the M
   * slice off) — ready for a scramble. `frame` puts it on another face.
   */
  sampleState(depth: number, random: () => number = Math.random, frame: Frame = IDENTITY_FRAME): State | null {
    const level = this.byDepth[depth];
    if (!level?.length) return null;
    let s = level[Math.floor(random() * level.length)];
    for (const x of X_TURNS) {
      const t = x ? applyMoves(s, x) : s;
      if (CENTRES.every((c) => t[c] === c)) {
        s = t;
        break;
      }
    }
    return frame === IDENTITY_FRAME ? s : unreframe(s, frame);
  }
}

const lseSolvers = new Map<string, LseSolver>();
export function lseSolver(def: LseStageDef): LseSolver {
  const key = JSON.stringify(def);
  let s = lseSolvers.get(key);
  if (!s) lseSolvers.set(key, (s = new LseSolver(def)));
  return s;
}
