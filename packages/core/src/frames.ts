/**
 * Frames — the 24 ways to hold a cube — and "views": a state re-indexed so
 * that a chosen frame looks like the canonical orientation.
 *
 * Every method check in cubecore is written once, for the canonical frame
 * (e.g. "the cross is on D, the Roux first block is on L"). To be colour and
 * orientation neutral, the checks run on `view(state, frame)` for each frame:
 * a frame whose view passes tells you WHERE the cross / block actually is.
 * Colours are never compared to fixed values — only to each other and to
 * centres — so any colour scheme works.
 */

import { FACELETS, FACELET_COUNT, FACES, type Face, type Mat3, IDENTITY, apply, faceOfNormal, faceletAt, multiply, rotationMatrix, FACE_NORMAL } from "./geometry";
import type { State } from "./state";
import type { Amount, Move, MoveFamily } from "./moves";

export interface Frame {
  /** Stable id 0..23 (0 = identity). */
  id: number;
  /** Physical face that plays the canonical `face` in this frame. */
  face: Record<Face, Face>;
  /** view[i] = state[map[i]] — canonical facelet i ↔ physical facelet map[i]. */
  map: Uint8Array;
  matrix: Mat3;
}

function buildFrames(): Frame[] {
  const matrices: Mat3[] = [IDENTITY];
  const seen = new Set([IDENTITY.flat().join(",")]);
  for (let i = 0; i < matrices.length; i++) {
    for (const axis of [0, 1, 2] as const) {
      const m = multiply(rotationMatrix(axis, 1), matrices[i]);
      const k = m.flat().join(",");
      if (!seen.has(k)) {
        seen.add(k);
        matrices.push(m);
      }
    }
  }
  return matrices.map((matrix, id) => {
    const map = new Uint8Array(FACELET_COUNT);
    for (const f of FACELETS) map[f.index] = faceletAt(apply(matrix, f.pos), apply(matrix, f.normal));
    const face = Object.fromEntries(FACES.map((fc) => [fc, faceOfNormal(apply(matrix, FACE_NORMAL[fc]))])) as Record<Face, Face>;
    return { id, face, map, matrix };
  });
}

export const FRAMES: readonly Frame[] = buildFrames();
export const IDENTITY_FRAME = FRAMES[0];

/** The state as seen from `frame` — canonical checks can run on it directly. */
export function view(state: State, frame: Frame): State {
  const out = new Uint8Array(FACELET_COUNT);
  for (let i = 0; i < FACELET_COUNT; i++) out[i] = state[frame.map[i]];
  return out;
}

/** Short human label, e.g. "D-bottom, F-front" style: canonical D and F mapped to physical faces. */
export function frameLabel(frame: Frame): string {
  return `${frame.face.D}${frame.face.F}`;
}

/** Frames whose canonical `face` sits on the physical face `physical`. */
export function framesWith(face: Face, physical: Face): Frame[] {
  return FRAMES.filter((f) => f.face[face] === physical);
}

// ─── Re-expressing moves in another frame ───


const FACE_FAMILY: Record<Face, MoveFamily> = { U: "U", R: "R", F: "F", D: "D", L: "L", B: "B" };
const WIDE_FAMILY: Record<Face, MoveFamily> = { U: "u", R: "r", F: "f", D: "d", L: "l", B: "b" };
/** Slice / rotation named by the face it turns like, plus whether that's inverted. */
const SLICE_BY_FACE: Record<Face, [MoveFamily, boolean]> = { L: ["M", false], R: ["M", true], D: ["E", false], U: ["E", true], F: ["S", false], B: ["S", true] };
const ROTATION_BY_FACE: Record<Face, [MoveFamily, boolean]> = { R: ["x", false], L: ["x", true], U: ["y", false], D: ["y", true], F: ["z", false], B: ["z", true] };
const FACE_OF_FAMILY: Partial<Record<MoveFamily, Face>> = { U: "U", R: "R", F: "F", D: "D", L: "L", B: "B", u: "U", r: "R", f: "F", d: "D", l: "L", b: "B" };
const FOLLOWS: Partial<Record<MoveFamily, Face>> = { M: "L", E: "D", S: "F", x: "R", y: "U", z: "F" };

const inv = (a: Amount): Amount => (a === 2 ? 2 : (-a as Amount));

/**
 * The same physical motion described from another orientation: a move written
 * for the canonical frame, performed on a cube held as `frame`. E.g. with the
 * frame that puts canonical D on physical F, "R U R'" (cross on D) becomes the
 * moves that do the same thing to a cross on F.
 */
export function transformMoves(moves: readonly Move[], frame: Frame): Move[] {
  return moves.map((m) => {
    const face = FACE_OF_FAMILY[m.family];
    if (face) {
      const target = frame.face[face];
      return { family: (m.family === m.family.toUpperCase() ? FACE_FAMILY : WIDE_FAMILY)[target], amount: m.amount };
    }
    const follows = FOLLOWS[m.family]!;
    const [family, flipped] = (m.family === "x" || m.family === "y" || m.family === "z" ? ROTATION_BY_FACE : SLICE_BY_FACE)[frame.face[follows]];
    return { family, amount: flipped ? inv(m.amount) : m.amount };
  });
}
