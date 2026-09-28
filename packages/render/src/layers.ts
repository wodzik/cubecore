/**
 * Pure geometry for animation (no three.js): which cubies a move turns, about
 * which axis, and by what angle. Shared by the renderer and its tests.
 *
 * Animation model: while move m animates from state S, the renderer shows S's
 * colours with m's layer rotated by `progress × angle`; at progress 1 it
 * switches to S·m with nothing rotated. The two pictures coincide, so there is
 * no pop — and the scene never has to track which physical cubie is where.
 */

import { FAMILY, type Move, type Vec3, writtenQuarters } from "@cubecore/core";

export interface LayerTurn {
  /** 0 = x, 1 = y, 2 = z. */
  axis: 0 | 1 | 2;
  /** Radians, counter-clockwise about +axis (right-hand rule). */
  angle: number;
  /** Does this move turn the cubie at `pos`? */
  turns(pos: Vec3): boolean;
}

export function layerTurn(move: Move): LayerTurn {
  const def = FAMILY[move.family];
  // A family's clockwise turn is `def.q` CCW quarters about +axis; the turn as written multiplies it
  // (U2' goes the other way than U2 — the state is the same, the hands aren't).
  const quarters = def.q * writtenQuarters(move);
  return {
    axis: def.axis,
    angle: (quarters * Math.PI) / 2,
    turns: (pos) => def.layers.includes(pos[def.axis]),
  };
}

/** Default animation length for a move, scaled by how far it turns (half turns take longer). */
export function defaultDuration(move: Move, quarterMs = 120): number {
  const q = Math.abs(writtenQuarters(move));
  return q === 1 ? quarterMs : quarterMs * (1 + 0.5 * (q - 1));
}
