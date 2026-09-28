/**
 * Cube rotations with a smart cube's moves: what the solver actually did.
 *
 * A smart cube reports face turns relative to its core (the centres) — so
 * after a y regrip an "R" is what the solver called F, and a slice or wide
 * move arrives as face turns while the core turns with it (S = F' B + z,
 * r = L + x, M2 = R' L R' L + x2 when done as two quarters). With the
 * gyroscope (the core's orientation) both can be read back:
 *
 *   const rec = new GripRecorder(session);       // follows grips as moves come in
 *   …
 *   const r = rec.forMoves(first, count, t0);     // { startRotation, rotations } of those moves
 *   heldTokens(moves, r.startRotation, r.rotations)
 *     // → [R, U, y, F, M2, …] — moves as the solver named them, regrips, slices
 *
 * GripRecorder marks each rotation with the number of moves that had come
 * before it in the session's stream — the order the cube sent them in, far
 * more reliable than comparing times (a gyro reading carries its arrival
 * time; a move its time on the cube's own clock). heldTokens still allows
 * a slice's rotation to come in a little early or late (a cube held loosely
 * while recognising the next case settles late).
 */

import { type Face, applyMoves, solvedState } from "@cubecore/core";
import { type Grip, GripTracker, IDENTITY_GRIP, rotateGrip, rotationBetween } from "./grips";
import type { SmartCubeSession } from "./session";

/** A face turn as reported (physical face letters) and when (ms, any origin — the same as the rotations'). */
export interface TimedMove {
  move: string;
  t: number;
}

/** A cube rotation among a list of moves. */
export interface RotationRecord {
  /** How many of the moves came before it. */
  after: number;
  /** When (ms, the moves' origin). */
  t: number;
  /** "x", "y'", "z2", or two: "x y". */
  move: string;
}

export type HeldToken =
  | { kind: "rotation"; move: string; t: number; after: number }
  | {
      kind: "move";
      /** As the solver named it (a slice / wide move for a group). */
      move: string;
      t: number;
      /** Index of its (first) reported move. */
      index: number;
      /** A slice / wide move made of several reported moves: the last one's index. */
      lastIndex?: number;
    };

/** A reported (physical) move ("L'", "R2") as the holder of `grip` names it. */
export function heldMove(move: string, grip: Grip): string {
  const face = move[0] as Face;
  const canonical = (Object.keys(grip.face) as Face[]).find((c) => grip.face[c] === face);
  return canonical ? canonical + move.slice(1) : move;
}

/**
 * The moves as the solver saw them: re-lettered for the grip each was made
 * in (`startRotation` from white top / green front — U up, F front — then
 * the rotations), rotations between them (back-to-back ones combined: y y =
 * y2, y y' = nothing), and slices / wide moves read from face moves with
 * the core's rotation.
 */
export function heldTokens(moves: readonly TimedMove[], startRotation: string, rotations: readonly RotationRecord[]): HeldToken[] {
  let grip = rotateGrip(IDENTITY_GRIP, startRotation);
  const rots = snapToSlices(moves, grip, [...rotations].sort((a, b) => a.after - b.after || a.t - b.t));
  const tokens: HeldToken[] = [];
  let r = 0;
  for (let i = 0; i <= moves.length; i++) {
    let target = grip;
    let t = 0;
    while (r < rots.length && rots[r].after <= i) {
      target = rotateGrip(target, rots[r].move);
      t = rots[r].t;
      r++;
    }
    const net = rotationBetween(grip, target);
    if (net) tokens.push({ kind: "rotation", move: net, t, after: i });
    grip = target;
    if (i < moves.length) tokens.push({ kind: "move", move: heldMove(moves[i].move, grip), t: moves[i].t, index: i });
  }
  return mergeSlicesAndWides(tokens);
}

// ─── slices and wide moves ──────────────────────────────────────────────

/** A slice / wide move's face moves and its rotation, reported this far apart (ms), are one move. */
const SAME_MOMENT_MS = 500;
/** How far (ms) a rotation is looked for from the face moves of a wide move. */
const SNAP_MS = 600;
/** Face moves one slice / wide move can come as: a half slice turn done as two quarters is four (R' L R' L). */
const MAX_GROUP = 4;
/** A slice's rotation can come in this late (ms) — past a couple of other moves — when the cube wasn't held still. */
const SLICE_LATE_MS = 2500;
const SLICE_SKIP = 2;
const AXIS_FACES: Record<string, [Face, Face]> = { x: ["R", "L"], y: ["U", "D"], z: ["F", "B"] };

const SLICE_WIDE = ["M", "E", "S", "r", "l", "u", "d", "f", "b"].flatMap((f) => [f, `${f}'`, `${f}2`]);
const effect = (alg: string) => applyMoves(solvedState(), alg).join();
const SLICE_WIDE_EFFECT = new Map<string, string>();

/** The slice / wide move the group (held letters and a rotation) amounts to, or null. */
function sliceOrWide(group: readonly string[]): string | null {
  if (SLICE_WIDE_EFFECT.size === 0) for (const m of SLICE_WIDE) SLICE_WIDE_EFFECT.set(effect(m), m);
  return SLICE_WIDE_EFFECT.get(effect(group.join(" "))) ?? null;
}

/**
 * The consecutive run (up to MAX_GROUP) of moves on the axis nearest to
 * `from` going `dir`, skipping at most SLICE_SKIP other moves before it,
 * within SLICE_LATE_MS of the rotation.
 */
function axisRun(moves: readonly TimedMove[], from: number, dir: 1 | -1, onAxis: (j: number) => boolean, t: number): number[] {
  let j = from;
  let skipped = 0;
  while (j >= 0 && j < moves.length && !onAxis(j) && skipped < SLICE_SKIP && Math.abs(moves[j].t - t) <= SLICE_LATE_MS) {
    j += dir;
    skipped++;
  }
  const run: number[] = [];
  while (j >= 0 && j < moves.length && onAxis(j) && run.length < MAX_GROUP && Math.abs(moves[j].t - t) <= SLICE_LATE_MS) {
    if (dir === -1) run.unshift(j);
    else run.push(j);
    j += dir;
  }
  return run;
}

/**
 * A slice's rotation can come in a move or two away from its face moves
 * (F' B U L z): put it right after (or before) the moves on its axis it
 * makes a slice / wide move with — the moves in between, made after the
 * centres had turned, get lettered accordingly. Far from them, only a
 * slice's signature (both faces of the axis) is trusted: one face and a
 * rotation could as well be a face turn and a real regrip.
 */
function snapToSlices(moves: readonly TimedMove[], startGrip: Grip, rotations: RotationRecord[]): RotationRecord[] {
  let grip = startGrip;
  const out = rotations.map((r) => ({ ...r }));
  for (const r of out) {
    const faces = AXIS_FACES[r.move[0]];
    if (faces && !/\s/.test(r.move)) {
      const physical = faces.map((f) => grip.face[f]);
      const onAxis = (j: number) => physical.includes(moves[j].move[0] as Face);
      const letters = (idx: number[]) => idx.map((j) => heldMove(moves[j].move, grip));
      const back = axisRun(moves, r.after - 1, -1, onAxis, r.t);
      const fwd = axisRun(moves, r.after, 1, onAxis, r.t);
      const tries: [number[], number][] = [];
      for (let n = MAX_GROUP; n >= 1; n--) if (back.length >= n) tries.push([back.slice(-n), back.at(-1)! + 1]);
      for (let n = MAX_GROUP; n >= 1; n--) if (fwd.length >= n) tries.push([fwd.slice(0, n), fwd[0]]);
      for (const [idx, after] of tries) {
        const far = idx.some((j) => Math.abs(moves[j].t - r.t) > SNAP_MS);
        if (far && new Set(idx.map((j) => moves[j].move[0])).size < 2) continue;
        if (sliceOrWide([...letters(idx), r.move])) {
          r.after = after;
          // It happened with those moves: its time is theirs.
          r.t = moves[after > idx[0] ? idx.at(-1)! : idx[0]].t;
          break;
        }
      }
    }
    grip = rotateGrip(grip, r.move);
  }
  return out.sort((a, b) => a.after - b.after || a.t - b.t);
}

/** A rotation and the face moves around it that make a slice / wide move → that move. */
export function mergeSlicesAndWides(tokens: readonly HeldToken[]): HeldToken[] {
  const out = [...tokens];
  for (let k = 0; k < out.length; k++) {
    const rot = out[k];
    if (rot.kind !== "rotation" || /\s/.test(rot.move)) continue;
    // The most moves around it first — a slice half turn made of quarters
    // is four (M2: R' L R' L + x2), a slice two, a wide move one.
    const windows: [number, number][] = [];
    for (let n = MAX_GROUP; n >= 1; n--) for (let o = 0; o <= n; o++) windows.push([k - n + o, k + o]);
    for (const [a, b] of windows) {
      if (a < 0 || b >= out.length) continue;
      const group = out.slice(a, b + 1);
      const groupMoves = group.filter((t): t is Extract<HeldToken, { kind: "move" }> => t.kind === "move");
      if (groupMoves.length !== group.length - 1 || groupMoves.some((m) => Math.abs(m.t - rot.t) > SAME_MOMENT_MS)) continue;
      const merged = sliceOrWide(group.map((t) => t.move));
      if (!merged) continue;
      const first = groupMoves[0];
      out.splice(a, b - a + 1, { kind: "move", move: merged, t: first.t, index: first.index, lastIndex: groupMoves.at(-1)!.index });
      k = a;
      break;
    }
  }
  return out;
}

// ─── recording ──────────────────────────────────────────────────────────

export interface GripEvent {
  /** Moves the session had reported before it (its stream position). */
  after: number;
  /** When it was first reached (performance.now()). */
  time: number;
  grip: Grip;
  /** From the grip before ("" for the first reading). */
  rotation: string;
}

export interface GripRecorderOptions {
  /** A grip counts when held within this many degrees of it … */
  maxOffDeg?: number;
  /** … for this long (ms). */
  dwellMs?: number;
  /** Grip changes and move times kept (the latest). */
  keep?: number;
}

/**
 * Follows a session's grips (gyro) alongside its moves; `forMoves` gives
 * the rotations of any stretch of moves — a solve, an attempt.
 */
export class GripRecorder {
  readonly history: GripEvent[] = [];
  private readonly tracker: GripTracker;
  /** Times of the session's latest moves; moveTimes[i] is move number firstMove + i. */
  private moveTimes: number[] = [];
  private firstMove = 0;
  private readonly keep: number;
  private readonly listeners = new Set<(e: GripEvent) => void>();
  private readonly offs: (() => void)[];

  constructor(
    private readonly session: SmartCubeSession,
    options: GripRecorderOptions = {}
  ) {
    this.tracker = new GripTracker(options.maxOffDeg ?? 35, options.dwellMs ?? 150);
    this.keep = options.keep ?? 1000;
    this.offs = [
      session.on("move", (e) => {
        this.moveTimes.push(e.time);
        if (this.moveTimes.length > this.keep) {
          this.moveTimes.shift();
          this.firstMove++;
        }
      }),
      session.on("orientation", (q) => this.reading(q, performance.now())),
    ];
  }

  /** The grip now (null before the gyro has read one). */
  get grip(): Grip | null {
    return this.tracker.grip;
  }

  /** On every grip change (and the first grip). */
  onChange(fn: (e: GripEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Forget the grip (after a recalibration: the next reading starts again). */
  reset(): void {
    this.tracker.reset();
  }

  stop(): void {
    this.offs.forEach((off) => off());
  }

  private reading(q: Parameters<GripTracker["update"]>[0], now: number): void {
    const count = this.session.moveCount;
    const wasEmpty = this.tracker.grip === null;
    const change = this.tracker.update(q, now, count);
    let e: GripEvent | null = null;
    if (wasEmpty && this.tracker.grip) e = { after: count, time: now, grip: this.tracker.grip, rotation: "" };
    else if (change) e = { after: change.mark, time: change.at, grip: change.to, rotation: change.rotation };
    if (!e) return;
    this.history.push(e);
    if (this.history.length > this.keep) this.history.shift();
    this.listeners.forEach((l) => l(e));
  }

  /** The session's number of the (first) move reported at `time` — a move event's time — or null if not kept. Moves can share a time (a slice's two faces). */
  moveNumberAt(time: number): number | null {
    const i = this.moveTimes.indexOf(time);
    return i < 0 ? null : this.firstMove + i;
  }

  /** The grip in effect before move number `n`, or null. */
  gripBefore(n: number): Grip | null {
    let g: Grip | null = null;
    for (const e of this.history) {
      if (e.after > n) break;
      g = e.grip;
    }
    return g;
  }

  /**
   * The rotations of `count` moves from move number `first`: how the cube
   * was held when they started (`startRotation`, from U up / F front) and
   * each rotation among them (`after` counted within them, `t` from
   * `startTime`). Null without a grip then.
   */
  forMoves(first: number, count: number, startTime: number): { startRotation: string; rotations: RotationRecord[] } | null {
    const start = this.gripBefore(first);
    if (!start) return null;
    const rotations = this.history
      .filter((e) => e.rotation && e.after > first && e.after < first + count)
      .map((e) => ({ after: e.after - first, t: Math.max(0, Math.round(e.time - startTime)), move: e.rotation }));
    return { startRotation: rotationBetween(IDENTITY_GRIP, start), rotations };
  }
}
