/**
 * Live move log for a smart cube: turns arrive one quarter at a time, and the
 * log shows them the way a cuber writes them — R, R becomes R2, three R's
 * become R' — while R R' stays two moves (a slip and its fix both happened).
 * Same rule as `collapseRepeats`, applied as the moves come in.
 */

import { type Move, amountQuarters, toAmount } from "./moves";

export interface TimedMove {
  move: Move;
  /** Time of the latest turn merged into it (ms, your clock). */
  time: number;
}

/** What the last push did to the log — enough to update a list in the UI without re-rendering it all. */
export type LogChange = "append" | "merge" | "remove";

export class MoveCollapser {
  private log: (TimedMove & { unit: Move; count: number })[] = [];

  /** @param windowMs merge only turns at most this far apart (default: always, like a written solve). */
  constructor(private readonly windowMs = Infinity) {}

  get moves(): readonly TimedMove[] {
    return this.log.map(({ move, time }) => ({ move, time }));
  }

  push(move: Move, time: number): LogChange {
    const last = this.log[this.log.length - 1];
    if (last && last.unit.family === move.family && last.unit.amount === move.amount && time - last.time <= this.windowMs) {
      last.count++;
      last.time = time;
      const amount = toAmount(amountQuarters(move.amount) * last.count);
      if (amount === null) {
        this.log.pop(); // four quarter turns: nothing happened
        return "remove";
      }
      last.move = { family: move.family, amount };
      return "merge";
    }
    this.log.push({ move, time, unit: move, count: 1 });
    return "append";
  }

  clear(): void {
    this.log = [];
  }
}
