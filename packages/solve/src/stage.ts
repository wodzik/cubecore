/**
 * Optimal solvers for solving stages: cross, xcross, xxcross, EOCross, an F2L
 * slot, the Roux first block — any set of pieces (plus, optionally, the
 * orientation of every edge). Answers: how many moves (`distance`), every
 * optimal solution (`solve`), the optimal next moves from here (`nextMoves`),
 * and random placements at an exact distance (`sample`, for trainer
 * scrambles: "a cross that takes exactly 6").
 *
 * Canonical frame: cross on D, slots FR / FL / BL / BR, Roux first block on
 * L-bottom. Pass `frame` to work on another face (`frameFor("U")` = cross
 * on U) — colour neutral like the rest of cubecore.
 *
 * How: IDA* over the tracked pieces. Each piece is one number (position ×
 * orientations + orientation, 0..23); the heuristic is the max of exact
 * distance tables for groups of up to five pieces (built by breadth-first
 * search on first use, shared between stages — the cross + one slot piece
 * tables are ~8 MB each and take a few hundred ms).
 */

import { type Frame, IDENTITY_FRAME, type Move, type State, reframe, toCubies, transformMoves } from "@cubecore/core";
import { MOVES, MOVE_CC } from "./pieces";

// ─── piece moves ───

const N_MOVES = 18;
/** Next value of an edge (pos × 2 + ori) / corner (pos × 3 + ori) under each move. */
const EDGE_NEXT = new Uint8Array(24 * N_MOVES);
const CORNER_NEXT = new Uint8Array(24 * N_MOVES);
const FLIP_NEXT = new Uint16Array(2048 * N_MOVES);
MOVE_CC.forEach((b, m) => {
  for (let i = 0; i < 12; i++) {
    const from = b.ep[i];
    for (let o = 0; o < 2; o++) EDGE_NEXT[(from * 2 + o) * N_MOVES + m] = i * 2 + ((o + b.eo[i]) % 2);
  }
  for (let i = 0; i < 8; i++) {
    const from = b.cp[i];
    for (let o = 0; o < 3; o++) CORNER_NEXT[(from * 3 + o) * N_MOVES + m] = i * 3 + ((o + b.co[i]) % 3);
  }
  // Flip coordinate (orientation of the edges at positions 0..10; 11 follows): as in two-phase.
  for (let f = 0; f < 2048; f++) {
    const eo = new Array(12).fill(0);
    for (let i = 10, t = f; i >= 0; i--, t >>= 1) eo[i] = t & 1;
    eo[11] = eo.reduce((a, x) => a + x, 0) % 2;
    let g = 0;
    for (let i = 0; i < 11; i++) g = g * 2 + ((eo[b.ep[i]] + b.eo[i]) % 2);
    FLIP_NEXT[f * N_MOVES + m] = g;
  }
});

export interface Piece {
  kind: "edge" | "corner";
  /** Kociemba piece id (core cubies.ts): edges UR UF UL UB DR DF DL DB FR FL BL BR, corners URF UFL ULB UBR DFR DLF DBL DRB. */
  id: number;
}

const home = (p: Piece) => (p.kind === "edge" ? p.id * 2 : p.id * 3);
const next = (p: Piece, value: number, m: number) => (p.kind === "edge" ? EDGE_NEXT : CORNER_NEXT)[value * N_MOVES + m];

// ─── distance tables for groups of pieces ───

const tableCache = new Map<string, Int8Array>();
/** Bump when table contents change, so stored copies are rebuilt. */
const TABLE_VERSION = 1;
const groupKey = (pieces: readonly Piece[]) => `v${TABLE_VERSION}:${pieces.map((p) => `${p.kind[0]}${p.id}`).join(",")}`;

function groupTable(pieces: readonly Piece[]): Int8Array {
  const key = groupKey(pieces);
  const cached = tableCache.get(key);
  if (cached) return cached;
  const k = pieces.length;
  const size = 24 ** k;
  const dist = new Int8Array(size).fill(-1);
  const queue = new Int32Array(size);
  const tables = pieces.map((p) => (p.kind === "edge" ? EDGE_NEXT : CORNER_NEXT));
  const scales = pieces.map((_, i) => 24 ** i);
  const start = pieces.reduce((acc, p, i) => acc + home(p) * scales[i], 0);
  dist[start] = 0;
  let head = 0, tail = 0;
  queue[tail++] = start;
  const vals = new Int32Array(k);
  while (head < tail) {
    const s = queue[head++];
    let t = s;
    for (let i = 0; i < k; i++) {
      const q = (t / 24) | 0;
      vals[i] = t - q * 24;
      t = q;
    }
    const d = dist[s] + 1;
    for (let m = 0; m < N_MOVES; m++) {
      // Only the pieces a move touches change the index: add their differences.
      let idx = s;
      for (let i = 0; i < k; i++) {
        const v = vals[i];
        const nv = tables[i][v * N_MOVES + m];
        if (nv !== v) idx += (nv - v) * scales[i];
      }
      if (dist[idx] < 0) {
        dist[idx] = d;
        queue[tail++] = idx;
      }
    }
  }
  tableCache.set(key, dist);
  return dist;
}

let flipTable: Int8Array | null = null;
function flipDistances(): Int8Array {
  if (flipTable) return flipTable;
  const dist = new Int8Array(2048).fill(-1);
  const queue = [0];
  dist[0] = 0;
  for (let h = 0; h < queue.length; h++) {
    const f = queue[h];
    for (let m = 0; m < N_MOVES; m++) {
      const g = FLIP_NEXT[f * N_MOVES + m];
      if (dist[g] < 0) {
        dist[g] = dist[f] + 1;
        queue.push(g);
      }
    }
  }
  return (flipTable = dist);
}

// ─── stages ───

export interface StageDef {
  name: string;
  pieces: readonly Piece[];
  /** Also orient every edge (EOCross). */
  eo?: boolean;
  /** Groups (indices into `pieces`) with exact tables; the heuristic is their max. */
  groups: readonly (readonly number[])[];
}

const E = (id: number): Piece => ({ kind: "edge", id });
const C = (id: number): Piece => ({ kind: "corner", id });
const CROSS = [E(4), E(5), E(6), E(7)]; // DR DF DL DB

export type Slot = "FR" | "FL" | "BL" | "BR";
const SLOT: Record<Slot, { edge: Piece; corner: Piece }> = {
  FR: { edge: E(8), corner: C(4) },
  FL: { edge: E(9), corner: C(5) },
  BL: { edge: E(10), corner: C(6) },
  BR: { edge: E(11), corner: C(7) },
};

export const STAGES = {
  cross: (): StageDef => ({ name: "cross", pieces: CROSS, groups: [[0, 1, 2, 3]] }),
  eocross: (): StageDef => ({ name: "eocross", pieces: CROSS, eo: true, groups: [[0, 1, 2, 3]] }),
  xcross: (slot: Slot = "FR"): StageDef => ({
    name: `xcross-${slot}`,
    pieces: [...CROSS, SLOT[slot].edge, SLOT[slot].corner],
    groups: [[0, 1, 2, 3, 4], [0, 1, 2, 3, 5]],
  }),
  xxcross: (a: Slot = "FR", b: Slot = "FL"): StageDef => ({
    name: `xxcross-${a}-${b}`,
    pieces: [...CROSS, SLOT[a].edge, SLOT[a].corner, SLOT[b].edge, SLOT[b].corner],
    groups: [[0, 1, 2, 3, 4], [0, 1, 2, 3, 5], [0, 1, 2, 3, 6], [0, 1, 2, 3, 7]],
  }),
  /** One F2L slot on its own (edge + corner in place). */
  slot: (slot: Slot = "FR"): StageDef => ({ name: `slot-${slot}`, pieces: [SLOT[slot].edge, SLOT[slot].corner], groups: [[0, 1]] }),
  /** Roux first block: DL, FL, BL edges and the DLF, DBL corners. */
  "roux-fb": (): StageDef => ({ name: "roux-fb", pieces: [E(6), E(9), E(10), C(5), C(6)], groups: [[0, 1, 2, 3, 4]] }),
  /**
   * Both Roux blocks (first + second: DR, FR, BR edges, DFR, DRB corners) —
   * for second-block practice from a solved first block. From a full
   * scramble the optimum is long (~15+) and the search slow.
   */
  "roux-blocks": (): StageDef => ({
    name: "roux-blocks",
    pieces: [E(6), E(9), E(10), C(5), C(6), E(4), E(8), E(11), C(4), C(7)],
    groups: [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]],
  }),
} as const;

export interface StageSolveOptions {
  /** Hold the cube this way (canonical D → frame.face.D). Default: identity. */
  frame?: Frame;
  /** Longest solution looked for. Default 20. */
  maxDepth?: number;
  /** All optimal solutions (up to `limit`) instead of the first. */
  all?: boolean;
  limit?: number;
}

export class StageSolver {
  private readonly tables: Int8Array[];
  private readonly goal: number[];

  constructor(readonly def: StageDef) {
    this.tables = def.groups.map((g) => groupTable(g.map((i) => def.pieces[i])));
    this.goal = def.pieces.map(home);
    if (def.eo) flipDistances();
  }

  /** Values of the tracked pieces (and flip) in `state`, seen through `frame`. */
  private read(state: State, frame: Frame): { vals: number[]; flip: number; centres: Frame } | null {
    const c = toCubies(reframe(state, frame));
    if (!c) return null;
    const vals = this.def.pieces.map((p) => {
      if (p.kind === "edge") {
        const pos = c.ep.indexOf(p.id);
        return pos * 2 + c.eo[pos];
      }
      const pos = c.cp.indexOf(p.id);
      return pos * 3 + c.co[pos];
    });
    const flip = c.eo.slice(0, 11).reduce((a, x) => a * 2 + x, 0);
    // Pieces are read relative to the centres (after slices / rotations they're not at home): solutions
    // come back in that frame and have to be said in the cube's own terms.
    return { vals, flip, centres: c.frame };
  }

  private h(vals: readonly number[], flip: number): number {
    let best = this.def.eo ? flipTable![flip] : 0;
    this.def.groups.forEach((g, gi) => {
      let idx = 0, scale = 1;
      for (const i of g) {
        idx += vals[i] * scale;
        scale *= 24;
      }
      const d = this.tables[gi][idx];
      if (d > best) best = d;
    });
    return best;
  }

  /** Solutions of length exactly `depth` from values (all, or stop at the first). */
  private search(vals: number[], flip: number, depth: number, all: boolean, limit: number): number[][] {
    const found: number[][] = [];
    const path: number[] = [];
    const k = vals.length;
    const stack = Array.from({ length: depth + 1 }, () => new Array<number>(k).fill(0));
    stack[0] = [...vals];
    const rec = (d: number, remaining: number, f: number, last: number): boolean => {
      const cur = stack[d];
      if (remaining === 0) {
        if (cur.every((v, i) => v === this.goal[i]) && (!this.def.eo || f === 0)) {
          found.push([...path]);
          return !all || found.length >= limit;
        }
        return false;
      }
      if (this.h(cur, f) > remaining) return false;
      const nextVals = stack[d + 1];
      for (let m = 0; m < N_MOVES; m++) {
        const face = Math.floor(m / 3);
        if (last >= 0 && (face === last || face === last - 3)) continue;
        for (let i = 0; i < k; i++) nextVals[i] = next(this.def.pieces[i], cur[i], m);
        path.push(m);
        if (rec(d + 1, remaining - 1, this.def.eo ? FLIP_NEXT[f * N_MOVES + m] : 0, face)) return true;
        path.pop();
      }
      return false;
    };
    rec(0, depth, flip, -1);
    return found;
  }

  private optimal(vals: number[], flip: number, maxDepth: number, all: boolean, limit: number): number[][] {
    for (let d = this.h(vals, flip); d <= maxDepth; d++) {
      const s = this.search(vals, flip, d, all, limit);
      if (s.length) return s;
    }
    return [];
  }

  /** Fewest moves to finish the stage (−1 if not found within maxDepth). */
  distance(state: State, options: StageSolveOptions = {}): number {
    const r = this.read(state, options.frame ?? IDENTITY_FRAME);
    if (!r) return -1;
    const s = this.optimal(r.vals, r.flip, options.maxDepth ?? 20, false, 1);
    return s.length ? s[0].length : -1;
  }

  /** Optimal solutions (face turns, in the cube's own frame). */
  solve(state: State, options: StageSolveOptions = {}): Move[][] {
    const frame = options.frame ?? IDENTITY_FRAME;
    const r = this.read(state, frame);
    if (!r) return [];
    const sols = this.optimal(r.vals, r.flip, options.maxDepth ?? 20, options.all ?? false, options.limit ?? 256);
    return sols.map((s) => {
      let moves = s.map((m) => MOVES[m]);
      if (r.centres !== IDENTITY_FRAME) moves = transformMoves(moves, r.centres);
      return frame === IDENTITY_FRAME ? moves : transformMoves(moves, frame);
    });
  }

  /** The first moves of every optimal solution — "what's a best next move from here?" */
  nextMoves(state: State, options: StageSolveOptions = {}): Move[] {
    const seen = new Map<string, Move>();
    for (const s of this.solve(state, { ...options, all: true })) if (s[0]) seen.set(`${s[0].family}${s[0].amount}`, s[0]);
    return [...seen.values()];
  }

  /**
   * A random placement of the tracked pieces that takes exactly `depth` moves
   * (canonical frame): piece → value (pos × orientations + ori), plus the
   * flip coordinate of all edges for EO stages. Uniform rejection sampling;
   * very short depths fall back to random walks.
   */
  sample(depth: number, random: () => number = Math.random, attempts = 4000): Placement | null {
    const evaluate = (vals: number[], flip: number) => {
      const s = this.optimal(vals, flip, depth, false, 1);
      return s.length ? s[0].length : Infinity;
    };
    const placement = (vals: number[], flip: number): Placement => ({
      pieces: new Map(this.def.pieces.map((p, i) => [p, vals[i]])),
      ...(this.def.eo ? { flip } : {}),
    });
    for (let a = 0; a < attempts; a++) {
      // Uniform placement: distinct positions, random orientations.
      const usedE = new Set<number>(), usedC = new Set<number>();
      const vals = this.def.pieces.map((p) => {
        const n = p.kind === "edge" ? 12 : 8, used = p.kind === "edge" ? usedE : usedC;
        let pos: number;
        do pos = Math.floor(random() * n);
        while (used.has(pos));
        used.add(pos);
        return pos * (p.kind === "edge" ? 2 : 3) + Math.floor(random() * (p.kind === "edge" ? 2 : 3));
      });
      const flip = this.def.eo ? Math.floor(random() * 2048) : 0;
      if (this.def.eo) {
        // The tracked edges' orientations are part of the flip: take them from it.
        const eo = flipBits(flip);
        this.def.pieces.forEach((p, i) => {
          if (p.kind === "edge") vals[i] = (vals[i] >> 1) * 2 + eo[vals[i] >> 1];
        });
      }
      if (evaluate(vals, flip) === depth) return placement(vals, flip);
    }
    // Short depths are rare among uniform placements: walk away from solved instead.
    for (let a = 0; a < attempts; a++) {
      let vals = [...this.goal];
      let flip = 0;
      let last = -1;
      for (let d = 0; d < depth; d++) {
        let m: number;
        do m = Math.floor(random() * N_MOVES);
        while (last >= 0 && (Math.floor(m / 3) === last || Math.floor(m / 3) === last - 3));
        last = Math.floor(m / 3);
        vals = vals.map((v, i) => next(this.def.pieces[i], v, m));
        flip = FLIP_NEXT[flip * N_MOVES + m];
      }
      if (evaluate(vals, this.def.eo ? flip : 0) === depth) return placement(vals, this.def.eo ? flip : 0);
    }
    return null;
  }
}

/** Orientation of the edge at each position (0..11) for a flip coordinate. */
export function flipBits(flip: number): number[] {
  const eo = new Array(12).fill(0);
  for (let i = 10, t = flip; i >= 0; i--, t >>= 1) eo[i] = t & 1;
  eo[11] = eo.reduce((a, x) => a + x, 0) % 2;
  return eo;
}

/** Where some pieces are: piece → value (pos × 2 + ori for edges, pos × 3 + ori for corners); `flip` = orientation of all edges. */
export interface Placement {
  pieces: Map<Piece, number>;
  flip?: number;
}

// ─── keeping tables across sessions ───

/** Somewhere to keep distance tables between sessions (IndexedDB in browsers — see indexedDbTableStore). */
export interface TableStore {
  get(key: string): Promise<Int8Array | null>;
  set(key: string, table: Int8Array): Promise<void>;
}

/** Load the tables these stages need from `store`, or build and save them. Afterwards the solvers start instantly. */
export async function preloadStageTables(stages: readonly StageDef[], store: TableStore): Promise<void> {
  for (const def of stages) {
    for (const g of def.groups) {
      const pieces = g.map((i) => def.pieces[i]);
      const key = groupKey(pieces);
      if (tableCache.has(key)) continue;
      const saved = await store.get(key).catch(() => null);
      if (saved && saved.length === 24 ** pieces.length) tableCache.set(key, saved);
      else await store.set(key, groupTable(pieces)).catch(() => undefined);
    }
  }
}

/** A TableStore in IndexedDB (works in pages and workers). */
export function indexedDbTableStore(dbName = "cubecore-tables"): TableStore {
  const db = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("tables");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const run = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> =>
    db.then(
      (d) =>
        new Promise<T>((resolve, reject) => {
          const r = fn(d.transaction("tables", mode).objectStore("tables"));
          r.onsuccess = () => resolve(r.result as T);
          r.onerror = () => reject(r.error);
        }),
    );
  return {
    get: (key) => run<ArrayBuffer | undefined>("readonly", (s) => s.get(key)).then((b) => (b ? new Int8Array(b) : null)),
    set: (key, table) => run<unknown>("readwrite", (s) => s.put(table.buffer.slice(0), key)).then(() => undefined),
  };
}

const solvers = new Map<string, StageSolver>();
/** A shared solver for a stage definition (tables are shared anyway). */
export function stageSolver(def: StageDef): StageSolver {
  let s = solvers.get(def.name);
  if (!s) solvers.set(def.name, (s = new StageSolver(def)));
  return s;
}
