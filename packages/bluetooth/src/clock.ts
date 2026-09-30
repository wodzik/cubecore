/**
 * Move times you can trust. Browsers deliver Bluetooth notifications late
 * and in bursts (a backgrounded tab, a busy main thread), and moves a GAN
 * cube re-sends after a dropped packet arrive with no local time at all —
 * so "when the notification arrived" can be seconds off. Cubes that report
 * their own clock (GAN gen2+ and others) let us do better: map the cube's
 * clock onto the page's (`performance.now()`) with the smallest observed
 * difference, i.e. the least delayed notification.
 */

export class ClockSync {
  private samples: number[] = [];

  /**
   * @param window how many recent samples the offset is estimated from (the cube clock drifts slowly).
   * @param jump a cube clock that lost time (GAN gen2's 16-bit move intervals roll over after
   *   ~65 s idle): this many samples in a row that agree with each other (within `agree` ms)
   *   and are all over `jumpMs` later than the offset — the cube clock jumped, start again
   *   from them. A burst of late notifications (a backgrounded tab) doesn't agree: its
   *   samples spread over the moves' real intervals.
   */
  constructor(
    private readonly window = 64,
    private readonly jump = { samples: 5, jumpMs: 1000, agree: 200 },
  ) {}

  /** Offset (local − cube) estimated so far, or null before the first sample. */
  get offset(): number | null {
    return this.samples.length ? Math.min(...this.samples) : null;
  }

  /** Feed one event: its cube time and, if it has one, the local time it arrived. */
  observe(cubeTime: number, localTime: number | null): void {
    if (localTime === null) return;
    this.samples.push(localTime - cubeTime);
    if (this.samples.length > this.window) this.samples.shift();
    const { samples: n, jumpMs, agree } = this.jump;
    if (this.samples.length <= n) return;
    const recent = this.samples.slice(-n);
    const best = Math.min(...this.samples.slice(0, -n));
    const lo = Math.min(...recent);
    if (lo - best > jumpMs && Math.max(...recent) - lo <= agree) this.samples = recent;
  }

  /** The cube time on the page's clock (null until an offset is known). */
  toLocal(cubeTime: number): number | null {
    const o = this.offset;
    return o === null ? null : cubeTime + o;
  }

  reset(): void {
    this.samples = [];
  }
}
