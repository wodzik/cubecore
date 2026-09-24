/**
 * Kociemba's two-phase algorithm, in TypeScript — solves any state in about
 * 20 face turns, fast enough to make random-state scrambles.
 *
 * Phase 1 brings the cube into G1 = ⟨U, D, R2, L2, F2, B2⟩ (all twists and
 * flips 0, the four middle-layer edges in the middle layer); phase 2 solves
 * it using only G1 moves. Both are IDA* searches over small coordinates with
 * pruning tables:
 *
 *   phase 1: twist (3^7), flip (2^11), slice position (C(12,4) = 495)
 *   phase 2: corner permutation (8!), U/D edge permutation (8!), slice permutation (4!)
 *
 * Tables (~9 MB, move + pruning) are built once, on first use (about a
 * second); build them early with `TwoPhase.create()` or in a worker.
 * Pieces use the Kociemba numbering of core `cubies.ts`.
 */

import { type Move, type State, applyMove, parity, permRank, permUnrank, solvedState, toCubies, transformMoves } from "@cubecore/core";

// ─── cubie level ───

interface CC {
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
}

const FACE_ORDER = ["U", "R", "F", "D", "L", "B"] as const;
/** The 18 face turns, index = face × 3 + (0: quarter, 1: half, 2: prime). */
export const MOVES: readonly Move[] = FACE_ORDER.flatMap((family) => ([1, 2, -1] as const).map((amount) => ({ family, amount })));

/** Pieces after `b` is applied to `a`. */
function mul(a: CC, b: CC): CC {
  return {
    cp: b.cp.map((p) => a.cp[p]),
    co: b.cp.map((p, i) => (a.co[p] + b.co[i]) % 3),
    ep: b.ep.map((p) => a.ep[p]),
    eo: b.ep.map((p, i) => (a.eo[p] + b.eo[i]) % 2),
  };
}

const SOLVED_CC: CC = { cp: [0, 1, 2, 3, 4, 5, 6, 7], co: new Array(8).fill(0), ep: Array.from({ length: 12 }, (_, i) => i), eo: new Array(12).fill(0) };
// Each move as pieces, derived from cubecore's own move geometry (no hand-typed tables).
const MOVE_CC: CC[] = MOVES.map((m) => {
  const c = toCubies(applyMove(solvedState(), m))!;
  return { cp: c.cp, co: c.co, ep: c.ep, eo: c.eo };
});

// ─── coordinates ───

const N_TWIST = 2187, N_FLIP = 2048, N_SLICE = 495, N_PERM8 = 40320, N_SLICEPERM = 24;

const twistOf = (c: CC) => c.co.slice(0, 7).reduce((a, t) => a * 3 + t, 0);
const flipOf = (c: CC) => c.eo.slice(0, 11).reduce((a, f) => a * 2 + f, 0);

const C = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
};
/** Which 4 of the 12 edge positions hold the middle-layer edges (8..11), as a combination rank. */
function sliceOf(c: CC): number {
  let r = 0, k = 0;
  for (let i = 0; i < 12; i++) if (c.ep[i] >= 8) r += C(i, ++k);
  return r;
}
const SOLVED_SLICE = C(8, 1) + C(9, 2) + C(10, 3) + C(11, 4);

function withTwist(t: number): CC {
  const co = new Array(8).fill(0);
  for (let i = 6; i >= 0; i--, t = Math.floor(t / 3)) co[i] = t % 3;
  co[7] = (3 - (co.reduce((a, b) => a + b, 0) % 3)) % 3;
  return { ...SOLVED_CC, co };
}
function withFlip(f: number): CC {
  const eo = new Array(12).fill(0);
  for (let i = 10; i >= 0; i--, f = Math.floor(f / 2)) eo[i] = f % 2;
  eo[11] = eo.reduce((a, b) => a + b, 0) % 2;
  return { ...SOLVED_CC, eo };
}
function withSlice(r: number): CC {
  const positions: number[] = [];
  for (let k = 4, i = 11; k > 0; i--) {
    if (r >= C(i, k)) {
      r -= C(i, k);
      positions.push(i);
      k--;
    }
  }
  const ep = new Array(12).fill(-1);
  positions.sort((a, b) => a - b).forEach((p, j) => (ep[p] = 8 + j));
  let e = 0;
  for (let i = 0; i < 12; i++) if (ep[i] < 0) ep[i] = e++;
  return { ...SOLVED_CC, ep };
}

// Phase 2 only turns with G1 moves.
const P2_MOVES = [0, 1, 2, 9, 10, 11, 4, 13, 7, 16];

// ─── tables ───

interface Tables {
  twistMove: Uint16Array;
  flipMove: Uint16Array;
  sliceMove: Uint16Array;
  cornerMove: Uint16Array; // all 18 moves (phase 1 path is replayed on pieces instead, but cheap to have)
  udEdgeMove: Uint16Array; // P2 moves only
  slicePermMove: Uint8Array; // P2 moves only
  pruneTwist: Int8Array; // slice × twist
  pruneFlip: Int8Array; // slice × flip
  pruneCorner: Int8Array; // slicePerm × corner perm
  pruneEdge: Int8Array; // slicePerm × U/D edge perm
}

function moveTable(n: number, make: (i: number) => CC, coord: (c: CC) => number, moves: readonly number[]): Uint16Array {
  const t = new Uint16Array(n * moves.length);
  for (let i = 0; i < n; i++) {
    const c = make(i);
    moves.forEach((m, j) => (t[i * moves.length + j] = coord(mul(c, MOVE_CC[m]))));
  }
  return t;
}

/** Breadth-first distances over a product of two coordinates. */
function pruneTable(n1: number, n2: number, move1: ArrayLike<number>, move2: ArrayLike<number>, moveCount: number, start: number): Int8Array {
  const dist = new Int8Array(n1 * n2).fill(-1);
  const queue = new Int32Array(n1 * n2);
  let head = 0, tail = 0;
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const s = queue[head++];
    const a = Math.floor(s / n2), b = s % n2, d = dist[s] + 1;
    for (let m = 0; m < moveCount; m++) {
      const next = move1[a * moveCount + m] * n2 + move2[b * moveCount + m];
      if (dist[next] < 0) {
        dist[next] = d;
        queue[tail++] = next;
      }
    }
  }
  return dist;
}

function buildTables(): Tables {
  const all18 = MOVES.map((_, i) => i);
  const twistMove = moveTable(N_TWIST, withTwist, twistOf, all18);
  const flipMove = moveTable(N_FLIP, withFlip, flipOf, all18);
  const sliceMove = moveTable(N_SLICE, withSlice, sliceOf, all18);
  const cornerMove = moveTable(N_PERM8, (i) => ({ ...SOLVED_CC, cp: permUnrank(i, 8) }), (c) => permRank(c.cp), all18);
  const udEdgeMove = moveTable(N_PERM8, (i) => ({ ...SOLVED_CC, ep: [...permUnrank(i, 8), 8, 9, 10, 11] }), (c) => permRank(c.ep.slice(0, 8)), P2_MOVES);
  const slicePermMove = Uint8Array.from(
    moveTable(N_SLICEPERM, (i) => ({ ...SOLVED_CC, ep: [0, 1, 2, 3, 4, 5, 6, 7, ...permUnrank(i, 4).map((e) => e + 8)] }), (c) => permRank(c.ep.slice(8).map((e) => e - 8)), P2_MOVES),
  );
  // Phase-2 pruning walks P2 moves: pick the corner-table columns for them.
  const cornerP2 = new Uint16Array(N_PERM8 * P2_MOVES.length);
  for (let i = 0; i < N_PERM8; i++) P2_MOVES.forEach((m, j) => (cornerP2[i * P2_MOVES.length + j] = cornerMove[i * 18 + m]));
  return {
    twistMove,
    flipMove,
    sliceMove,
    cornerMove,
    udEdgeMove,
    slicePermMove,
    pruneTwist: pruneTable(N_SLICE, N_TWIST, sliceMove, twistMove, 18, SOLVED_SLICE * N_TWIST),
    pruneFlip: pruneTable(N_SLICE, N_FLIP, sliceMove, flipMove, 18, SOLVED_SLICE * N_FLIP),
    pruneCorner: pruneTable(N_SLICEPERM, N_PERM8, slicePermMove, cornerP2, P2_MOVES.length, 0),
    pruneEdge: pruneTable(N_SLICEPERM, N_PERM8, slicePermMove, udEdgeMove, P2_MOVES.length, 0),
  };
}

// ─── search ───

export interface SolveOptions {
  /** Longest acceptable solution (face turns, HTM). Default 21. */
  maxLength?: number;
  /** Give up after this long (ms); returns null if nothing was found by then. Default 5000. */
  timeoutMs?: number;
}

const faceOf = (m: number) => Math.floor(m / 3);
/** Skip a turn of the same face, and the second of two opposite faces in the "wrong" order (U D ok, D U not). */
const redundant = (face: number, last: number) => last >= 0 && (face === last || face === last - 3);

export class TwoPhase {
  private constructor(private readonly t: Tables) {}

  /** Build the tables (about a second) — do it once, early, or in a worker. */
  static create(): TwoPhase {
    return new TwoPhase(buildTables());
  }

  /** A solution for `state` (face turns, applied to `state` they solve it), or null. */
  solve(state: State, options: SolveOptions = {}): Move[] | null {
    const cubies = toCubies(state);
    if (!cubies) return null;
    // Solve the cube as seen with its centres at home, then say the same moves in the cube's own frame.
    const c: CC = { cp: cubies.cp, co: cubies.co, ep: cubies.ep, eo: cubies.eo };
    if (parity(c.cp) !== parity(c.ep) || c.co.reduce((a, b) => a + b, 0) % 3 || c.eo.reduce((a, b) => a + b, 0) % 2) return null;
    const moves = this.search(c, options.maxLength ?? 21, performance.now() + (options.timeoutMs ?? 5000));
    if (!moves) return null;
    return cubies.frame.id === 0 ? moves : transformMoves(moves, cubies.frame);
  }

  private search(c: CC, maxLength: number, deadline: number): Move[] | null {
    const t = this.t;
    const path1: number[] = [];
    const path2: number[] = [];
    let nodes = 0;
    let timedOut = false;

    const phase2 = (corner: number, edge: number, slice: number, depth: number, last: number): boolean => {
      if (depth === 0) return corner === 0 && edge === 0 && slice === 0;
      const h = Math.max(t.pruneCorner[slice * N_PERM8 + corner], t.pruneEdge[slice * N_PERM8 + edge]);
      if (h > depth) return false;
      for (let j = 0; j < P2_MOVES.length; j++) {
        const m = P2_MOVES[j];
        const f = faceOf(m);
        if (redundant(f, last)) continue;
        path2.push(m);
        if (phase2(t.cornerMove[corner * 18 + m], t.udEdgeMove[edge * 10 + j], t.slicePermMove[slice * 10 + j], depth - 1, f)) return true;
        path2.pop();
      }
      return false;
    };

    const startPhase2 = (budget: number): boolean => {
      let g1 = c;
      for (const m of path1) g1 = mul(g1, MOVE_CC[m]);
      const corner = permRank(g1.cp), edge = permRank(g1.ep.slice(0, 8)), slice = permRank(g1.ep.slice(8).map((e) => e - 8));
      const last = path1.length ? faceOf(path1[path1.length - 1]) : -1;
      for (let d = 0; d <= Math.min(budget, 18); d++) if (phase2(corner, edge, slice, d, last)) return true;
      return false;
    };

    const phase1 = (twist: number, flip: number, slice: number, depth: number, last: number, total: number): boolean => {
      if ((++nodes & 4095) === 0 && performance.now() > deadline) timedOut = true;
      if (timedOut) return false;
      if (depth === 0) {
        if (twist !== 0 || flip !== 0 || slice !== SOLVED_SLICE) return false;
        // A phase-1 path ending in a G1 move is a longer copy of one already tried.
        const lm = path1[path1.length - 1];
        if (path1.length && P2_MOVES.includes(lm)) return false;
        return startPhase2(total - path1.length);
      }
      const h = Math.max(t.pruneTwist[slice * N_TWIST + twist], t.pruneFlip[slice * N_FLIP + flip]);
      if (h > depth) return false;
      for (let m = 0; m < 18; m++) {
        const f = faceOf(m);
        if (redundant(f, last)) continue;
        path1.push(m);
        if (phase1(t.twistMove[twist * 18 + m], t.flipMove[flip * 18 + m], t.sliceMove[slice * 18 + m], depth - 1, f, total)) return true;
        path1.pop();
      }
      return false;
    };

    const twist = twistOf(c), flip = flipOf(c), slice = sliceOf(c);
    for (let d1 = 0; d1 <= maxLength; d1++) {
      if (phase1(twist, flip, slice, d1, -1, maxLength)) return [...path1, ...path2].map((m) => MOVES[m]);
      if (timedOut) return null;
    }
    return null;
  }
}
