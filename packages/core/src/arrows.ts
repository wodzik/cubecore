/**
 * Turn arrows — what an arrow over a 3D cube needs to show a move: which
 * layers turn, about which axis, which way and how far, in the CUBE'S OWN
 * coordinates (its centres). A renderer draws one arrow per layer, so a wide
 * r gets two, a rotation three.
 *
 * `frame` is how the cube is held (OrientationTracker / SequenceTracker):
 * after an x in the algorithm, the U you're asked to turn is the physical F,
 * and its arrow belongs there.
 */

import { IDENTITY_FRAME, type Frame } from "./frames";
import { type Axis, apply } from "./geometry";
import { FAMILY, type Move } from "./moves";

export interface TurnArrow {
  axis: Axis;
  /** Layer coordinates along the axis (-1, 0, 1) that turn — one arrow each. */
  layers: number[];
  /** Counter-clockwise quarter turns about +axis: ±1 a single turn, ±2 a double. */
  quarters: 1 | -1 | 2 | -2;
}

export function turnArrow(move: Move, frame: Frame = IDENTITY_FRAME): TurnArrow {
  const def = FAMILY[move.family];
  const unit = [0, 0, 0] as [number, number, number];
  unit[def.axis] = 1;
  const v = apply(frame.matrix, unit);
  const axis = v.findIndex((c) => c !== 0) as Axis;
  const sign = v[axis];
  const q = def.q * (move.amount === -1 ? -1 : move.amount);
  return {
    axis,
    layers: def.layers.map((l) => l * sign),
    quarters: (q * sign) as TurnArrow["quarters"],
  };
}
