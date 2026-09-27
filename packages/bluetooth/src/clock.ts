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

  /** @param window how many recent samples the offset is estimated from (the cube clock drifts slowly). */
  constructor(private readonly window = 64) {}

  /** Offset (local − cube) estimated so far, or null before the first sample. */
  get offset(): number | null {
    return this.samples.length ? Math.min(...this.samples) : null;
  }

  /** Feed one event: its cube time and, if it has one, the local time it arrived. */
  observe(cubeTime: number, localTime: number | null): void {
    if (localTime === null) return;
    this.samples.push(localTime - cubeTime);
    if (this.samples.length > this.window) this.samples.shift();
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
