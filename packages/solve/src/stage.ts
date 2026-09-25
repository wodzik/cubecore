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

import { FRAMES, type Frame, IDENTITY_FRAME, type Move, type Piece, type StageDef, type State, applyMoves, parseAlg, reframe, solvedState, toCubies, transformMoves } from "@cubecore/core";

const SOLVED_STATE = solvedState();
/** Set by scramble.ts (randomState lives there; avoids an import cycle). */
let randomStateHook: ((random: () => number) => State) | null = null;
export const setRandomStateHook = (f: (random: () => number) => State) => void (randomStateHook = f);

export type { Piece, StageDef } from "@cubecore/core";
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

const home = (p: Piece) => (p.kind === "edge" ? p.id * 2 : p.id * 3);
const next = (p: Piece, value: number, m: number) => (p.kind === "edge" ? EDGE_NEXT : CORNER_NEXT)[value * N_MOVES + m];

// ─── distance tables for groups of pieces ───

const tableCache = new Map<string, Int8Array>();
/** Bump when table contents change, so stored copies are rebuilt. */
const TABLE_VERSION = 1;
const groupKey = (pieces: readonly Piece[], goals?: readonly (readonly number[])[]) =>
  `v${TABLE_VERSION}:${pieces.map((p) => `${p.kind[0]}${p.id}`).join(",")}` + (goals ? `|g:${goals.map((g) => g.join(".")).join(";")}` : "");

/**
 * Exact distances for a group of pieces: breadth-first from the goal —
 * the pieces at home, or (`goals`) every given placement of the group at once.
 */
function groupTable(pieces: readonly Piece[], goals?: readonly (readonly number[])[]): Int8Array {
  const key = groupKey(pieces, goals);
  const cached = tableCache.get(key);
  if (cached) return cached;
  const k = pieces.length;
  const size = 24 ** k;
  const dist = new Int8Array(size).fill(-1);
  const queue = new Int32Array(size);
  const tables = pieces.map((p) => (p.kind === "edge" ? EDGE_NEXT : CORNER_NEXT));
  const scales = pieces.map((_, i) => 24 ** i);
  const starts = (goals ?? [pieces.map(home)]).map((vals) => vals.reduce((acc, v, i) => acc + v * scales[i], 0));
  let head = 0, tail = 0;
  for (const start of starts) {
    if (dist[start] === 0) continue;
    dist[start] = 0;
    queue[tail++] = start;
  }
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

/** Values of all the stage's pieces in each of its goal states (`def.goals`), or undefined for "at home". */
function goalPlacements(def: StageDef): number[][] | undefined {
  return def.goals?.map((alg) => {
    let vals = def.pieces.map(home);
    for (const mv of parseAlg(alg)) {
      const m = MOVES.findIndex((x) => x.family === mv.family && x.amount === mv.amount);
      if (m < 0) throw new Error(`Stage goals take face turns only: ${alg}`);
      vals = vals.map((v, i) => next(def.pieces[i], v, m));
    }
    return vals;
  });
}

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

  /** Goal placements (values of all pieces), when the stage has several (`def.goals`). */
  private readonly goalSet: Set<string> | null;
  /** Move indices the search may use (`def.moves`; the tables stay the all-moves ones — still a valid lower bound). */
  private readonly allowed: number[];

  constructor(readonly def: StageDef) {
    this.goal = def.pieces.map(home);
    const goals = goalPlacements(def);
    this.goalSet = goals ? new Set(goals.map((g) => g.join(","))) : null;
    this.allowed = MOVES.map((m, i) => (!def.moves || def.moves.includes(m.family as never) ? i : -1)).filter((i) => i >= 0);
    this.tables = def.groups.map((g) => groupTable(g.map((i) => def.pieces[i]), goals?.map((vals) => g.map((i) => vals[i]))));
    if (def.eo) flipDistances();
  }

  private isGoal(vals: readonly number[]): boolean {
    return this.goalSet ? this.goalSet.has(vals.join(",")) : vals.every((v, i) => v === this.goal[i]);
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
        if (this.isGoal(cur) && (!this.def.eo || f === 0)) {
          found.push([...path]);
          return !all || found.length >= limit;
        }
        return false;
      }
      if (this.h(cur, f) > remaining) return false;
      const nextVals = stack[d + 1];
      for (const m of this.allowed) {
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

  /**
   * The frames to try: `frame`, or for an x-neutral stage every frame with
   * the same L and R (the block on the L colour with any bottom colour).
   */
  private frames(frame: Frame): readonly Frame[] {
    return this.def.neutral === "x" ? FRAMES.filter((f) => f.face.L === frame.face.L && f.face.R === frame.face.R) : [frame];
  }

  private distanceIn(state: State, frame: Frame, maxDepth: number): number {
    const r = this.read(state, frame);
    if (!r) return -1;
    const s = this.optimal(r.vals, r.flip, maxDepth, false, 1);
    return s.length ? s[0].length : -1;
  }

  /** Fewest moves to finish the stage (−1 if not found within maxDepth). An x-neutral stage takes the best block. */
  distance(state: State, options: StageSolveOptions = {}): number {
    const ds = this.frames(options.frame ?? IDENTITY_FRAME)
      .map((f) => this.distanceIn(state, f, options.maxDepth ?? 20))
      .filter((d) => d >= 0);
    return ds.length ? Math.min(...ds) : -1;
  }

  /** Optimal solutions (face turns, in the cube's own frame); for an x-neutral stage, those of the best blocks. */
  solve(state: State, options: StageSolveOptions = {}): Move[][] {
    const frames = this.frames(options.frame ?? IDENTITY_FRAME);
    const best = frames.length > 1 ? this.distance(state, options) : -1;
    const out: Move[][] = [];
    const seen = new Set<string>();
    for (const frame of frames) {
      if (frames.length > 1 && this.distanceIn(state, frame, options.maxDepth ?? 20) !== best) continue;
      const r = this.read(state, frame);
      if (!r) continue;
      const sols = this.optimal(r.vals, r.flip, options.maxDepth ?? 20, options.all ?? false, options.limit ?? 256);
      for (const sol of sols) {
        let moves = sol.map((m) => MOVES[m]);
        if (r.centres !== IDENTITY_FRAME) moves = transformMoves(moves, r.centres);
        if (frame !== IDENTITY_FRAME) moves = transformMoves(moves, frame);
        const key = moves.map((m) => `${m.family}${m.amount}`).join(" ");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(moves);
      }
      if (!options.all && out.length) break;
    }
    return out;
  }

  /**
   * A whole random state whose stage takes exactly `depth` moves — for
   * x-neutral stages, where the best block depends on pieces outside the
   * tracked set. Uniform where levels are common; short levels come from
   * random walks, the rarest deep ones one move beyond a shallower case.
   */
  sampleState(depth: number, random: () => number = Math.random, draw: (random: () => number) => State = () => randomStateHook!(random), attempts = 3000): State | null {
    for (let a = 0; a < attempts; a++) {
      const s = draw(random);
      if (this.distance(s, { maxDepth: depth }) === depth) return s;
    }
    const faceMoves = MOVES;
    for (let a = 0; a < attempts; a++) {
      let s = SOLVED_STATE;
      let last = -1;
      for (let d = 0; d < depth + 2; d++) {
        let m: number;
        do m = Math.floor(random() * N_MOVES);
        while (last >= 0 && Math.floor(m / 3) === last);
        last = Math.floor(m / 3);
        s = applyMoves(s, [faceMoves[m]]);
        if (d + 1 >= depth && this.distance(s, { maxDepth: depth }) === depth) return s;
      }
    }
    if (depth > 1) {
      for (let a = 0; a < 50; a++) {
        const shallower = this.sampleState(depth - 1, random, draw, 300);
        if (!shallower) break;
        for (const m of [...faceMoves].sort(() => random() - 0.5)) {
          const s = applyMoves(shallower, [m]);
          if (this.distance(s, { maxDepth: depth }) === depth) return s;
        }
      }
    }
    return null;
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
    // Known cases for levels too rare to draw at run time (see StageDef.seeds) — straight away.
    const seeds = this.def.seeds?.[depth];
    if (seeds?.length) {
      const [valsText, flipText] = seeds[Math.floor(random() * seeds.length)].split(":");
      const vals = valsText.split(".").map(Number);
      const flip = Number(flipText ?? 0);
      if (evaluate(vals, flip) === depth) return placement(vals, flip);
    }
    for (let a = 0; a < attempts; a++) {
      // Uniform placement: distinct positions, random orientations.
      const keep = new Set(this.def.keep ?? []);
      const usedE = new Set<number>(this.def.pieces.filter((p, i) => keep.has(i) && p.kind === "edge").map((p) => p.id));
      const usedC = new Set<number>(this.def.pieces.filter((p, i) => keep.has(i) && p.kind === "corner").map((p) => p.id));
      const vals = this.def.pieces.map((p, i) => {
        if (keep.has(i)) return home(p); // kept solved (e.g. the first block while practising the second square)
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
    // The deepest levels can be too rare to hit (EOCross at 10): every such placement is one move beyond a
    // placement one shallower, so step outwards from those (fine as a trainer case, not exactly uniform).
    if (depth > 1) {
      for (let a = 0; a < 200; a++) {
        const shallower = this.sample(depth - 1, random, 200);
        if (!shallower) break;
        const vals0 = this.def.pieces.map((p) => shallower.pieces.get(p)!);
        const flip0 = shallower.flip ?? 0;
        const order = Array.from({ length: N_MOVES }, (_, i) => i).sort(() => random() - 0.5);
        for (const m of order) {
          const vals = vals0.map((v, i) => next(this.def.pieces[i], v, m));
          const flip = this.def.eo ? FLIP_NEXT[flip0 * N_MOVES + m] : 0;
          if (evaluate(vals, flip) === depth) return placement(vals, flip);
        }
      }
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
    const goals = goalPlacements(def);
    for (const g of def.groups) {
      const pieces = g.map((i) => def.pieces[i]);
      const groupGoals = goals?.map((vals) => g.map((i) => vals[i]));
      const key = groupKey(pieces, groupGoals);
      if (tableCache.has(key)) continue;
      const saved = await store.get(key).catch(() => null);
      if (saved && saved.length === 24 ** pieces.length) tableCache.set(key, saved);
      else await store.set(key, groupTable(pieces, groupGoals)).catch(() => undefined);
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
  // Keyed by the whole definition: two stages may share a name (a neutral and a fixed first block).
  const key = JSON.stringify(def);
  let s = solvers.get(key);
  if (!s) solvers.set(key, (s = new StageSolver(def)));
  return s;
}
