/**
 * Random-state scrambles: draw a random reachable state (optionally with
 * some pieces kept solved or oriented), solve it with the two-phase solver,
 * and use the inverse of the solution — every state is equally likely, like
 * WCA scrambles.
 *
 * Constraints are written for the canonical frame (first layer D, last layer
 * U, Roux blocks on L/R), so presets read naturally; `frame` then puts the
 * same case on any face — colour neutral, e.g. "LL scramble with the cross
 * on white": `randomScramble({ preset: "ll", frame: frameFor("U") })`.
 */

import {
  CORNER_FACELETS,
  CUBIE_OF_FACELET,
  type Cubie,
  EDGE_FACELETS,
  type Frame,
  IDENTITY_FRAME,
  type Move,
  type State,
  applyMoves,
  fromCubies,
  parity,
  solvedState,
  unreframe,
} from "@cubecore/core";
import { type Placement, type StageDef, flipBits, stageSolver } from "./stage";
import { type SolveOptions, TwoPhase } from "./twophase";

export type PiecePredicate = (cubie: Cubie) => boolean;

export interface RandomStateOptions {
  /** Pieces kept solved (in place, oriented). */
  solved?: PiecePredicate;
  /** Pieces put exactly here (e.g. a cross sampled at a given distance), and optionally all edges' orientation. */
  place?: Placement;
  /** Pieces kept oriented, but permuted among themselves. */
  oriented?: PiecePredicate;
  /** Random source in [0, 1). Default Math.random. */
  random?: () => number;
}

const cornerCubie = (j: number) => CUBIE_OF_FACELET[CORNER_FACELETS[j][0]];
const edgeCubie = (j: number) => CUBIE_OF_FACELET[EDGE_FACELETS[j][0]];

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** A uniformly random reachable state (centres at home) honouring the constraints. */
export function randomState(options: RandomStateOptions = {}): State {
  const random = options.random ?? Math.random;
  const solved = options.solved ?? (() => false);
  const oriented = options.oriented ?? (() => false);
  const placed = { edge: new Map<number, number>(), corner: new Map<number, number>() };
  for (const [piece, value] of options.place?.pieces ?? []) placed[piece.kind].set(piece.id, value);
  const flip = options.place?.flip;

  const place = (kind: "edge" | "corner", n: number, cubieOf: (j: number) => Cubie, twists: number) => {
    const perm = new Array(n).fill(-1);
    const ori = new Array(n).fill(0);
    const taken = new Set<number>();
    // Placed pieces, then solved ones, at their fixed positions.
    for (const [id, value] of placed[kind]) {
      const pos = Math.floor(value / twists);
      perm[pos] = id;
      ori[pos] = value % twists;
      taken.add(id);
    }
    for (let j = 0; j < n; j++) {
      if (taken.has(j) || !solved(cubieOf(j))) continue;
      perm[j] = j;
      taken.add(j);
    }
    const free = perm.map((p, pos) => (p < 0 ? pos : -1)).filter((pos) => pos >= 0);
    const pieces = shuffle(Array.from({ length: n }, (_, j) => j).filter((j) => !taken.has(j)), random);
    free.forEach((pos, k) => (perm[pos] = pieces[k]));
    if (kind === "edge" && flip !== undefined) {
      const eo = flipBits(flip);
      free.forEach((pos) => (ori[pos] = eo[pos]));
    } else {
      // Pieces free to twist / flip; the last of them absorbs the sum rule.
      const turnable = free.filter((pos) => !oriented(cubieOf(perm[pos])));
      for (const pos of turnable) ori[pos] = Math.floor(random() * twists);
      if (turnable.length) {
        const last = turnable[turnable.length - 1];
        const rest = ori.reduce((a, b, i) => (i === last ? a : a + b), 0);
        ori[last] = (twists - (rest % twists)) % twists;
      }
    }
    return { perm, ori, free };
  };

  const corners = place("corner", 8, cornerCubie, 3);
  const edges = place("edge", 12, edgeCubie, 2);
  // Permutation parities must match: swap two free edges (or corners) if they don't.
  if (parity(corners.perm) !== parity(edges.perm)) {
    const swap = (p: { perm: number[]; ori: number[]; free: number[] }) => {
      const [a, b] = p.free;
      [p.perm[a], p.perm[b]] = [p.perm[b], p.perm[a]];
      [p.ori[a], p.ori[b]] = [p.ori[b], p.ori[a]];
    };
    if (edges.free.length >= 2) swap(edges);
    else if (corners.free.length >= 2) swap(corners);
  }
  return fromCubies({ frame: IDENTITY_FRAME, cp: corners.perm, co: corners.ori, ep: edges.perm, eo: edges.ori });
}

// ─── presets (canonical: first layer D, last layer U; Roux blocks on L/R) ───

const y = (c: Cubie) => c.pos[1];
const isCrossEdge = (c: Cubie) => c.kind === "edge" && y(c) === -1;
const inF2L = (c: Cubie) => y(c) <= 0;
const inFR = (c: Cubie) => c.pos[0] === 1 && c.pos[2] === 1 && y(c) <= 0;

export type ScramblePreset = "full" | "f2l" | "ls" | "ll" | "zbll" | "pll" | "ell" | "cmll";

export const SCRAMBLE_PRESETS: Record<ScramblePreset, { label: string; solved?: PiecePredicate; oriented?: PiecePredicate }> = {
  full: { label: "Random state" },
  f2l: { label: "F2L (cross solved)", solved: isCrossEdge },
  ls: { label: "Last slot (FR) + last layer", solved: (c) => inF2L(c) && !inFR(c) },
  ll: { label: "Last layer (OLL + PLL)", solved: inF2L },
  zbll: { label: "ZBLL (last-layer edges oriented)", solved: inF2L, oriented: (c) => c.kind === "edge" },
  pll: { label: "PLL (last layer oriented)", solved: inF2L, oriented: () => true },
  ell: { label: "ELL (corners solved)", solved: (c) => inF2L(c) || c.kind === "corner" },
  cmll: { label: "CMLL (Roux blocks solved)", solved: (c) => c.pos[0] !== 0 && y(c) <= 0 },
};

export interface ScrambleOptions extends RandomStateOptions, SolveOptions {
  preset?: ScramblePreset;
  /** Put the case on another face: canonical D (cross / first block bottom) goes to `frame.face.D`. */
  frame?: Frame;
  /** A solver to reuse (default: one shared instance, built on first use). */
  solver?: TwoPhase;
  /**
   * Where the cube is now (e.g. a smart cube's state after the last attempt):
   * the scramble then goes from here to the random target — no need to solve
   * the cube first. Default: solved.
   */
  from?: State;
}

let shared: TwoPhase | null = null;
/** The shared solver (tables built on first call, about half a second). */
export const sharedSolver = (): TwoPhase => (shared ??= TwoPhase.create());

/** A random-state scramble: the moves, and the state they lead to (from `from`, default solved). */
export function randomScramble(options: ScrambleOptions = {}): { moves: Move[]; state: State } {
  const preset = SCRAMBLE_PRESETS[options.preset ?? "full"];
  for (;;) {
    let target = randomState({ solved: options.solved ?? preset.solved, oriented: options.oriented ?? preset.oriented, random: options.random });
    if (options.frame && options.frame !== IDENTITY_FRAME) target = unreframe(target, options.frame);
    const result = scrambleTo(target, options);
    if (result) return result;
  }
}

/** Moves from `options.from` (default solved) to `target`; null if the solver gave up or there is nothing to do. */
export function scrambleTo(target: State, options: Pick<ScrambleOptions, "from" | "solver" | "maxLength" | "timeoutMs"> = {}): { moves: Move[]; state: State } | null {
  const solver = options.solver ?? sharedSolver();
  const from = options.from ?? solvedState();
  const moves = solver.solveBetween(from, target, options);
  if (!moves || !moves.length) return null;
  return { moves, state: applyMoves(from, moves) };
}

// ─── trainer scrambles ───

export interface StageScrambleOptions extends Omit<ScrambleOptions, "preset" | "solved" | "oriented" | "place"> {
  /** The stage and how many moves its optimal solution must take. */
  stage: StageDef;
  length: number;
}

/**
 * A trainer scramble: a random-state scramble whose `stage` (cross, xcross,
 * EOCross…) takes exactly `length` moves at best — on any face (`frame`),
 * from wherever the cube is (`from`). Null if no such case was found.
 */
export function stageScramble(options: StageScrambleOptions): { moves: Move[]; state: State } | null {
  const solver = stageSolver(options.stage);
  for (let attempt = 0; attempt < 20; attempt++) {
    const place = solver.sample(options.length, options.random);
    if (!place) return null;
    let target = randomState({ place, random: options.random });
    if (options.frame && options.frame !== IDENTITY_FRAME) target = unreframe(target, options.frame);
    const result = scrambleTo(target, options);
    // Defence in depth: the scrambled cube must really be `length` away.
    if (result && solver.distance(result.state, { frame: options.frame }) === options.length) return result;
  }
  return null;
}
