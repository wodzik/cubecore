/**
 * Live move log for a smart cube. Turns arrive one quarter at a time, and the
 * log writes them the way a cuber would — counting everything that happened:
 *
 *   R, R        → R2         (a double flick is one move)
 *   R, R, R     → R2 R       (never folded back into R')
 *   R, R'       → R R'       (a slip and its fix: two moves, not zero)
 *   R, L'       → M          (opposite faces turned together the same way: a slice;
 *   U, D'       → E           in either order, only when they arrive together —
 *   F', B       → S           see `sliceWindowMs`)
 *   R, L', R, L' → M2
 *
 * Merges only look at the end of the log, so an entry never changes once
 * something else follows it.
 */

import { decompose } from "./physical";
import { type Move, amountQuarters, toAmount } from "./moves";

export interface LoggedMove {
  move: Move;
  /** Time of the latest turn merged into it (ms, your clock). */
  time: number;
}

export interface CollapserOptions {
  /** Merge R, R into R2 only when at most this far apart. Default: always. */
  repeatWindowMs?: number;
  /** Merge opposite faces into a slice only when at most this far apart. Default 200 ms. */
  sliceWindowMs?: number;
}

/** What a push did to the log: drop `removed` entries from its end, then append `added`. */
export interface LogChange {
  removed: number;
  added: LoggedMove[];
}

const SLICES: Move[] = (["M", "E", "S"] as const).flatMap((family) => ([1, -1, 2] as const).map((amount) => ({ family, amount })));
const same = (a: Move, b: Move) => a.family === b.family && a.amount === b.amount;

/** The slice two face turns make together (R + L' → M), or null. */
export function sliceOf(a: Move, b: Move): Move | null {
  for (const slice of SLICES) {
    const [x, y] = decompose(slice).turns;
    if ((same(a, x) && same(b, y)) || (same(a, y) && same(b, x))) return slice;
  }
  return null;
}

/** Two identical quarter turns → the half turn; anything else → null. */
function doubled(a: Move, b: Move): Move | null {
  if (!same(a, b) || a.amount === 2) return null;
  return { family: a.family, amount: toAmount(amountQuarters(a.amount) * 2)! };
}

export class MoveCollapser {
  private log: LoggedMove[] = [];
  private readonly repeatWindow: number;
  private readonly sliceWindow: number;

  constructor(options: CollapserOptions = {}) {
    this.repeatWindow = options.repeatWindowMs ?? Infinity;
    this.sliceWindow = options.sliceWindowMs ?? 200;
  }

  get moves(): readonly LoggedMove[] {
    return this.log.map(({ move, time }) => ({ move, time }));
  }

  push(move: Move, time: number): LogChange {
    const before = this.log.length;
    this.log.push({ move, time });
    let touched = 1; // entries at the end that may differ from what the caller last saw
    for (;;) {
      const n = this.log.length;
      if (n < 2) break;
      const a = this.log[n - 2], b = this.log[n - 1];
      const gap = b.time - a.time;
      const merged = (gap <= this.repeatWindow && doubled(a.move, b.move)) || (gap <= this.sliceWindow && sliceOf(a.move, b.move));
      if (!merged) break;
      this.log.splice(n - 2, 2, { move: merged, time: b.time });
      touched = Math.max(touched, before - (n - 2) + 1);
    }
    const keep = this.log.length - Math.min(touched, this.log.length);
    const removed = before - keep;
    return { removed, added: this.log.slice(keep).map(({ move, time }) => ({ move, time })) };
  }

  clear(): void {
    this.log = [];
  }
}

/** The same rules on a finished list (all turns taken as simultaneous-enough for slices unless times are given). */
export function collapseMoves(moves: readonly Move[], times?: readonly number[], options?: CollapserOptions): Move[] {
  const c = new MoveCollapser(options);
  moves.forEach((m, i) => c.push(m, times?.[i] ?? 0));
  return c.moves.map((m) => m.move);
}
