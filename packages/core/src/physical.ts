/**
 * What a smart cube actually sees. A Bluetooth cube reports only turns of its
 * six faces, measured against its own centres: no rotations, no slices, no
 * wide turns. An algorithm written with them is, physically, face turns plus
 * a change in how the cube is held:
 *
 *   r   = L  + x        (the two turning layers = the opposite face the other way, plus a rotation)
 *   M   = R L' + x'
 *   r U = L F           (after r the cube is held x: the U you turn is the physical F)
 *
 * `toFaceTurns` converts an algorithm to the face turns a smart cube would
 * report; `OrientationTracker` does it move by move and always knows how the
 * cube is held — where each centre is after an algorithm with M slices or
 * rotations (Roux LSE, rotations between F2L pairs…).
 *
 * Orientation is a Frame (see frames.ts): canonical = the algorithm's view
 * (U = up in your hands), physical = the cube's own centres.
 */

import { FRAMES, type Frame, IDENTITY_FRAME } from "./frames";
import { type Axis, FACE_NORMAL, type Face, type Mat3, apply, faceOfNormal, multiply, rotationMatrix } from "./geometry";
import { FAMILY, type Move, type MoveFamily, toAmount } from "./moves";
import { parseAlg } from "./notation";

const FACE_ON_AXIS: Record<Axis, Record<number, Face>> = {
  0: { 1: "R", [-1]: "L" },
  1: { 1: "U", [-1]: "D" },
  2: { 1: "F", [-1]: "B" },
};

const key = (m: Mat3) => m.flat().map((v) => (v === 0 ? 0 : v)).join(","); // no -0
const byMatrix = new Map(FRAMES.map((f) => [key(f.matrix), f]));
const frameOf = (m: Mat3): Frame => byMatrix.get(key(m))!;
const transpose = (m: Mat3): Mat3 => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
];

/** Signed quarter turns (CCW about +axis) of a move. */
const quartersOf = (m: Move) => FAMILY[m.family].q * (m.amount === -1 ? -1 : m.amount === 2 ? 2 : 1);

/** A face turn of `quarters` CCW about +axis on the layer at `layer` (±1), as a Move of that face. */
function faceTurn(axis: Axis, layer: number, quarters: number): Move | null {
  const face = FACE_ON_AXIS[axis][layer];
  const amount = toAmount(quarters * FAMILY[face].q); // q is ±1, so dividing = multiplying
  return amount === null ? null : { family: face as MoveFamily, amount };
}

/**
 * One move in the holder's view → the face turns (in the holder's view) and
 * the rotation of the whole cube it implies. A move turning the middle layer
 * is the same as rotating the cube that way and turning the other layers back.
 */
export function decompose(move: Move): { turns: Move[]; rotation: { axis: Axis; quarters: number } | null } {
  const def = FAMILY[move.family];
  const q = quartersOf(move);
  if (!def.layers.includes(0)) {
    return { turns: def.layers.map((l) => faceTurn(def.axis, l, q)).filter((m): m is Move => m !== null), rotation: null };
  }
  const others = [-1, 1].filter((l) => !def.layers.includes(l));
  return { turns: others.map((l) => faceTurn(def.axis, l, -q)).filter((m): m is Move => m !== null), rotation: { axis: def.axis, quarters: q } };
}

/**
 * Follows an algorithm move by move: which physical face each turn is, and how
 * the cube is held afterwards. Feed it the moves of what you ask the solver to
 * do; compare `push` results with what the smart cube reports.
 */
export class OrientationTracker {
  private m: Mat3;

  constructor(start: Frame = IDENTITY_FRAME) {
    this.m = start.matrix;
  }

  /** How the cube is held: `frame.face.U` is the physical face (centre) now on top, etc. */
  get frame(): Frame {
    return frameOf(this.m);
  }

  /** Physical face (by its centre) in each position of the holder's view. */
  get centers(): Record<Face, Face> {
    return this.frame.face;
  }

  /** The physical face turns this move is — what a smart cube would report. */
  push(move: Move | string): Move[] {
    const moves = typeof move === "string" ? parseAlg(move) : [move];
    const out: Move[] = [];
    for (const mv of moves) {
      const { turns, rotation } = decompose(mv);
      for (const t of turns) {
        // Holder-view face → the physical face in that position (same turning direction: rotations are proper).
        const physical = faceOfNormal(apply(this.m, FACE_NORMAL[t.family as Face]));
        out.push({ family: physical as MoveFamily, amount: t.amount });
      }
      // Turning the cube by R (holder's view) moves the body: body = M · R⁻¹ · view.
      if (rotation) this.m = multiply(this.m, transpose(rotationMatrix(rotation.axis, rotation.quarters)));
    }
    return out;
  }
}

/** An algorithm as the face turns a smart cube reports, and how the cube is held at the end. */
export function toFaceTurns(alg: readonly Move[] | string, start: Frame = IDENTITY_FRAME): { moves: Move[]; frame: Frame } {
  const t = new OrientationTracker(start);
  const moves = (typeof alg === "string" ? parseAlg(alg) : alg).flatMap((m) => t.push(m));
  return { moves, frame: t.frame };
}

