/**
 * A pretend smart cube with the same events as a real one — for tests,
 * demos and building an app without a cube at hand. `new
 * SmartCubeSession(new SimulatedCube())` behaves like a connected cube.
 */

import { type Move, type State, applyMove, faceletsOf, formatMove, parseAlg, solvedState } from "@cubecore/core";
import type { SmartCubeCommand, SmartCubeEvent } from "smartcube-web-bluetooth";
import type { CubeConnection } from "./session";
import type { Quat } from "./gyro";

export class SimulatedCube implements CubeConnection {
  readonly deviceName = "Simulated cube";
  readonly deviceMAC = "00:00:00:00:00:00";
  readonly protocol = { id: "simulated", name: "Simulated" };
  readonly capabilities = { gyroscope: true, battery: true, facelets: true, hardware: true, reset: true };
  private subscribers = new Set<(e: SmartCubeEvent) => void>();
  private state: State = solvedState();
  private cubeClock = 0;
  /** Simulated Bluetooth latency added to local arrival times (ms). */
  latency = 20;

  readonly events$ = {
    subscribe: (next: (e: SmartCubeEvent) => void) => {
      this.subscribers.add(next);
      return { unsubscribe: () => this.subscribers.delete(next) };
    },
  };

  /** Turn the cube. `delayMs` = how late the notification is (e.g. a backgrounded tab); `dropLocalTime` = a resent move. */
  turn(moves: string | Move, options: { delayMs?: number; dropLocalTime?: boolean } = {}): void {
    for (const m of typeof moves === "string" ? parseAlg(moves) : [moves]) {
      if (!"URFDLB".includes(m.family)) throw new Error("A smart cube only turns faces");
      const quarters = m.amount === 2 ? [{ ...m, amount: 1 as const }, { ...m, amount: 1 as const }] : [m];
      for (const q of quarters) {
        this.state = applyMove(this.state, q);
        const happened = performance.now();
        this.cubeClock = Math.round(happened) + 100_000; // any epoch: only differences matter
        const arrived = happened + this.latency + (options.delayMs ?? 0);
        this.emit({
          type: "MOVE",
          timestamp: arrived,
          face: "URFDLB".indexOf(q.family),
          direction: q.amount === -1 ? 1 : 0,
          move: formatMove(q),
          localTimestamp: options.dropLocalTime ? null : arrived,
          cubeTimestamp: this.cubeClock,
        });
      }
    }
  }

  tilt(quaternion: Quat): void {
    this.emit({ type: "GYRO", timestamp: performance.now(), quaternion });
  }

  /** Change the cube behind the session's back (e.g. a missed move); it only notices on a facelets report. */
  setStateSilently(state: State): void {
    this.state = new Uint8Array(state);
  }

  async sendCommand(command: SmartCubeCommand): Promise<void> {
    const timestamp = performance.now();
    if (command.type === "REQUEST_FACELETS") this.emit({ type: "FACELETS", timestamp, facelets: faceletsOf(this.state) });
    if (command.type === "REQUEST_BATTERY") this.emit({ type: "BATTERY", timestamp, batteryLevel: 87 });
    if (command.type === "REQUEST_HARDWARE") this.emit({ type: "HARDWARE", timestamp, hardwareName: "Simulated", gyroSupported: true });
    if (command.type === "REQUEST_RESET") this.state = solvedState();
  }

  async disconnect(): Promise<void> {
    this.emit({ type: "DISCONNECT", timestamp: performance.now() });
  }

  private emit(e: SmartCubeEvent): void {
    for (const s of [...this.subscribers]) s(e);
  }
}
