/**
 * SmartCubeSession — a connected smart cube as cubecore sees it. Wraps
 * smartcube-web-bluetooth (GAN, MoYu, QiYi, GoCube, Giiker…) and turns its
 * events into cubecore values:
 *
 *   move        each face turn as a Move, with a trustworthy time (see clock.ts)
 *               and whether it arrived late; plus the state after it
 *   state       the tracked cube state — also after a FACELETS report that
 *               disagrees with it (a missed move: the cube knows best)
 *   orientation gyro, calibrated, ready for CubeRenderer.setOrientation
 *   battery, hardware, disconnect
 *
 * Feed the moves to MoveCollapser (written log), OrientationTracker,
 * MethodTracker or a timeline recording as needed.
 */

import { type Move, type State, applyMove, parseAlg, relativeState, solvedState, stateFromFacelets, statesEqual } from "@cubecore/core";
import type { ConnectSmartCubeOptions, SmartCubeCapabilities, SmartCubeCommand, SmartCubeEvent } from "smartcube-web-bluetooth";
import type { Skin } from "@cubecore/skin";
import { ClockSync } from "./clock";
import { skinForCube } from "./cubeSkins";
import { type AxisMap, GAN_AXES, GyroCalibrator, type Quat } from "./gyro";

/** What the session needs from a connection — smartcube-web-bluetooth's, or a SimulatedCube. */
export interface CubeConnection {
  readonly deviceName: string;
  readonly deviceMAC: string;
  readonly protocol: { id: string; name: string };
  readonly capabilities: SmartCubeCapabilities;
  events$: { subscribe(next: (e: SmartCubeEvent) => void): { unsubscribe(): void } };
  sendCommand(command: SmartCubeCommand): Promise<void>;
  disconnect(): Promise<void>;
}

export interface CubeMoveEvent {
  move: Move;
  /** When it happened, on the page's clock (performance.now()). */
  time: number;
  /** The cube's own timestamp, if it sends one. */
  cubeTime: number | null;
  /** Arrived much later than it happened (a backgrounded tab, a resent packet). */
  late: boolean;
  /** The state after this move. */
  state: State;
}

export interface HardwareInfo {
  name?: string;
  softwareVersion?: string;
  hardwareVersion?: string;
  gyroSupported?: boolean;
}

interface Events {
  move: CubeMoveEvent;
  state: { state: State; reason: "move" | "facelets" | "reset" };
  orientation: Quat;
  battery: number;
  hardware: HardwareInfo;
  disconnect: undefined;
}

export interface SessionOptions {
  /** A move is `late` when it arrives this much after it happened. Default 1000 ms. */
  lateMs?: number;
  /** Gyro axes of this cube (default: GAN). */
  axes?: AxisMap;
}

export class SmartCubeSession {
  private listeners = new Map<keyof Events, Set<(e: never) => void>>();
  private _state: State = solvedState();
  private _battery: number | null = null;
  private _hardware: HardwareInfo = {};
  private readonly clock = new ClockSync();
  private readonly gyro: GyroCalibrator;
  private readonly subscription: { unsubscribe(): void };
  private readonly lateMs: number;
  private connected = true;

  /** Ask the browser for a cube and connect (needs a user gesture; Chrome / Edge / Bluefy). */
  static async connect(options?: ConnectSmartCubeOptions, session?: SessionOptions): Promise<SmartCubeSession> {
    const { connectSmartCube } = await import("smartcube-web-bluetooth");
    return new SmartCubeSession(await connectSmartCube(options), session);
  }

  constructor(private readonly connection: CubeConnection, options: SessionOptions = {}) {
    this.lateMs = options.lateMs ?? 1000;
    this.gyro = new GyroCalibrator(options.axes ?? GAN_AXES);
    this.subscription = connection.events$.subscribe((e) => this.onEvent(e));
    if (connection.capabilities.facelets) this.send({ type: "REQUEST_FACELETS" });
    if (connection.capabilities.battery) this.send({ type: "REQUEST_BATTERY" });
    if (connection.capabilities.hardware) this.send({ type: "REQUEST_HARDWARE" });
  }

  get info() {
    const c = this.connection;
    return { name: c.deviceName, mac: c.deviceMAC, protocol: c.protocol, capabilities: c.capabilities };
  }
  get state(): State {
    return this._state;
  }
  get battery(): number | null {
    return this._battery;
  }
  get hardware(): HardwareInfo {
    return this._hardware;
  }
  /** A skin that suits this cube (see cubeSkins.ts; refines once the hardware name arrives). */
  get suggestedSkin(): Skin {
    return skinForCube({ protocol: this.connection.protocol, name: this.connection.deviceName, hardwareName: this._hardware.name });
  }

  get isConnected(): boolean {
    return this.connected;
  }

  on<K extends keyof Events>(type: K, listener: (e: Events[K]) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(listener as (e: never) => void);
    return () => set.delete(listener as (e: never) => void);
  }

  /** "Held as shown now" for the gyro. */
  calibrate(): void {
    this.gyro.calibrate();
  }

  /**
   * Tell the session (and the cube, if it can) that the cube is solved now.
   * Cubes that can't reset their own state (QiYi, …) keep reporting it: the
   * next facelets report becomes the reference ("solved" as marked) and
   * later reports are read relative to it — so they don't undo the mark.
   */
  markSolved(): void {
    if (this.connection.capabilities.reset) this.send({ type: "REQUEST_RESET" });
    this.setState(solvedState(), "reset");
    if (this.connection.capabilities.facelets) {
      this.rebase = true;
      this.send({ type: "REQUEST_FACELETS" });
    }
  }

  requestState(): void {
    this.send({ type: "REQUEST_FACELETS" });
  }
  requestBattery(): void {
    this.send({ type: "REQUEST_BATTERY" });
  }

  async disconnect(): Promise<void> {
    this.subscription.unsubscribe();
    await this.connection.disconnect();
    this.onEvent({ type: "DISCONNECT", timestamp: performance.now() });
  }

  private send(command: SmartCubeCommand): void {
    this.connection.sendCommand(command).catch(() => undefined);
  }

  private emit<K extends keyof Events>(type: K, e: Events[K]): void {
    for (const l of this.listeners.get(type) ?? []) (l as (e: Events[K]) => void)(e);
  }

  /** The cube's own state that counts as solved (after "mark solved" on a cube that didn't reset), or null. */
  private base: State | null = null;
  /** "Mark solved" was pressed: the next facelets report sets `base`. */
  private rebase = false;

  private setState(state: State, reason: "move" | "facelets" | "reset"): void {
    this._state = state;
    this.emit("state", { state, reason });
  }

  private onEvent(e: SmartCubeEvent): void {
    switch (e.type) {
      case "MOVE": {
        const [move] = parseAlg(e.move.replace(/’/g, "'"));
        if (!move) return;
        const arrived = e.localTimestamp ?? e.timestamp;
        let time = arrived;
        if (e.cubeTimestamp !== null) {
          this.clock.observe(e.cubeTimestamp, e.localTimestamp);
          time = this.clock.toLocal(e.cubeTimestamp) ?? arrived;
        }
        const state = applyMove(this._state, move);
        this._state = state;
        this.emit("move", { move, time, cubeTime: e.cubeTimestamp, late: e.timestamp - time > this.lateMs, state });
        this.emit("state", { state, reason: "move" });
        break;
      }
      case "FACELETS": {
        const reported = stateFromFacelets(e.facelets);
        if (!reported) return;
        if (this.rebase) {
          // First report after "mark solved": the cube's own state then (moves since the mark taken off) is the new "solved".
          this.base = baseOf(reported, this._state);
          this.rebase = false;
          return;
        }
        const s = this.base ? relativeState(reported, this.base) : reported;
        if (!statesEqual(s, this._state)) this.setState(s, "facelets");
        break;
      }
      case "GYRO":
        this.emit("orientation", this.gyro.orientation(e.quaternion));
        break;
      case "BATTERY":
        this._battery = e.batteryLevel;
        this.emit("battery", e.batteryLevel);
        break;
      case "HARDWARE":
        this._hardware = { name: e.hardwareName, softwareVersion: e.softwareVersion, hardwareVersion: e.hardwareVersion, gyroSupported: e.gyroSupported };
        this.emit("hardware", this._hardware);
        break;
      case "DISCONNECT":
        if (!this.connected) return;
        this.connected = false;
        this.subscription.unsubscribe();
        this.emit("disconnect", undefined);
        break;
    }
  }
}

/**
 * The cube's own state at the mark: `reported` is it with the moves since
 * (`sinceMark`, a state from solved) done — so base[x] = reported[inverse(sinceMark)[x]].
 */
function baseOf(reported: State, sinceMark: State): State {
  const inverse = new Uint8Array(sinceMark.length);
  sinceMark.forEach((v, i) => (inverse[v] = i));
  return Uint8Array.from(inverse, (_, x) => reported[inverse[x]]);
}
