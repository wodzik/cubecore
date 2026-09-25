/**
 * Solve-time statistics, WCA / csTimer style. Times in ms; a DNF is
 * `DNF` (Infinity) — it counts as the worst time, so one DNF in an ao5 is
 * trimmed away, two make the average a DNF.
 *
 *   ao(times, 5)            // average of the last 5, best and worst dropped
 *   bestAo(times, 12)       // best rolling average of 12 in the session
 *   sessionStats(times)     // { count, best, worst, mean, mo3, ao5, ao12, ao100, bestAo5, bestAo12 }
 */

export const DNF = Number.POSITIVE_INFINITY;

/** How many times an average of `n` drops at each end: 1 for ao5 / ao12, 5 % above that (ao50: 3, ao100: 5). */
export const trimCount = (n: number): number => (n <= 12 ? 1 : Math.ceil(n * 0.05));

/** Average of the `n` times ending at `end` (default: the last n); null if there aren't enough, DNF if too many DNFs. */
export function ao(times: readonly number[], n: number, end = times.length): number | null {
  if (n < 3 || end < n) return null;
  const sorted = times.slice(end - n, end).sort((a, b) => a - b);
  const t = trimCount(n);
  const kept = sorted.slice(t, n - t);
  if (kept.some((x) => x === DNF)) return DNF;
  return kept.reduce((s, x) => s + x, 0) / kept.length;
}

/** Mean of the last `n` (nothing dropped; any DNF makes it a DNF) — mo3. */
export function mo(times: readonly number[], n: number, end = times.length): number | null {
  if (end < n || n < 1) return null;
  const last = times.slice(end - n, end);
  return last.some((x) => x === DNF) ? DNF : last.reduce((s, x) => s + x, 0) / n;
}

/** Best rolling average of `n` over the whole session. */
export function bestAo(times: readonly number[], n: number): number | null {
  let best: number | null = null;
  for (let end = n; end <= times.length; end++) {
    const a = ao(times, n, end)!;
    if (best === null || a < best) best = a;
  }
  return best;
}

export interface SessionStats {
  count: number;
  /** Solves that weren't DNFs. */
  finished: number;
  best: number | null;
  worst: number | null;
  /** Mean of the finished solves. */
  mean: number | null;
  mo3: number | null;
  ao5: number | null;
  ao12: number | null;
  ao100: number | null;
  bestAo5: number | null;
  bestAo12: number | null;
}

export function sessionStats(times: readonly number[]): SessionStats {
  const done = times.filter((t) => t !== DNF);
  return {
    count: times.length,
    finished: done.length,
    best: done.length ? Math.min(...done) : null,
    worst: done.length ? Math.max(...done) : null,
    mean: done.length ? done.reduce((s, x) => s + x, 0) / done.length : null,
    mo3: mo(times, 3),
    ao5: ao(times, 5),
    ao12: ao(times, 12),
    ao100: ao(times, 100),
    bestAo5: bestAo(times, 5),
    bestAo12: bestAo(times, 12),
  };
}
