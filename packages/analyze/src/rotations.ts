/** A whole-cube rotation for each frame ("x2", "z y'"…): hold the cube like this to see it as the frame does. */

import { type Frame, toFaceTurns } from "@cubecore/core";

const ROTATIONS: Map<number, string> = (() => {
  const out = new Map<number, string>();
  for (const tilt of ["", "x", "x2", "x'", "z", "z'"]) {
    for (const turn of ["", "y", "y2", "y'"]) {
      const alg = `${tilt} ${turn}`.trim();
      const frame = toFaceTurns(alg).frame;
      if (!out.has(frame.id)) out.set(frame.id, alg);
    }
  }
  return out;
})();

export const rotationFor = (frame: Frame): string => ROTATIONS.get(frame.id) ?? "";
