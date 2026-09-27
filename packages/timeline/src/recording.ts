/**
 * A recorded solve: the scramble and every move with the time it was made
 * (ms since the timer started), plus the final time. Smart cubes report a
 * move when it finishes, so `t` is the moment the move COMPLETED.
 */

import { type Move, parseAlg } from "@cubecore/core";

export interface TimedMove {
  move: Move;
  /** ms since the timer started, when the move completed. Non-decreasing. */
  t: number;
}

export interface Recording {
  scramble: Move[];
  moves: TimedMove[];
  /** Final time in ms (≥ the last move's t). */
  totalMs: number;
}

/** Convenience builder: `recording("R U", [["R", 120], ["U'", 300]], 450)`. */
export function recording(scramble: string, moves: readonly [string, number][], totalMs?: number): Recording {
  const timed: TimedMove[] = moves.map(([m, t]) => {
    const parsed = parseAlg(m);
    if (parsed.length !== 1) throw new Error(`"${m}" is not a single move`);
    return { move: parsed[0], t };
  });
  for (let i = 1; i < timed.length; i++) if (timed[i].t < timed[i - 1].t) throw new Error(`Move ${i} goes back in time`);
  const last = timed.at(-1)?.t ?? 0;
  return { scramble: parseAlg(scramble), moves: timed, totalMs: Math.max(totalMs ?? last, last) };
}
