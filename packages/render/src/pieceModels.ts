/**
 * Piece models — pure maths for placing one model per piece kind on all 26
 * cubies (no three.js here; the renderer and the glTF exporter use it).
 *
 * Convention for model authors (glTF / GLB, 1 unit = one cubie, centred on
 * the cubie's centre, Y up, Z towards the viewer — same axes as cubecore):
 *
 *   corner  modelled as the UFR corner: at +x +y +z, stickers on U, F and R
 *   edge    modelled as the UF edge:    at  0 +y +z, stickers on U and F
 *   center  modelled as the U centre:   at  0 +y  0, sticker on U
 *
 * Meshes whose material is named `sticker-U`, `sticker-F`, `sticker-R` are
 * the coloured parts (recoloured by state and mask); everything else — the
 * `body`, screws, logos you bake in — is drawn as authored. The renderer
 * rotates each model onto every position of its kind and maps its sticker
 * materials to the facelets there.
 */

import { CUBIES, type Cubie, FACE_NORMAL, FRAMES, type Face, type Mat3, type Vec3, apply, faceletAt } from "@cubecore/core";

export type ModelKind = "corner" | "edge" | "center";

/** Where each kind's model is authored, and which of its faces carry stickers. */
export const CANONICAL: Record<ModelKind, { pos: Vec3; faces: readonly Face[] }> = {
  corner: { pos: [1, 1, 1], faces: ["U", "F", "R"] },
  edge: { pos: [0, 1, 1], faces: ["U", "F"] },
  center: { pos: [0, 1, 0], faces: ["U"] },
};

export interface PiecePlacement {
  cubie: Cubie;
  kind: ModelKind;
  /** Rotation taking the canonical piece onto this cubie (rows; canonical → cube coordinates). */
  rotation: Mat3;
  /** Model sticker face (canonical letter) → facelet index at this cubie. */
  stickers: Partial<Record<Face, number>>;
}

const same = (a: Vec3, b: Vec3) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** How the model of `cubie`'s kind sits on it. */
export function placePiece(cubie: Cubie): PiecePlacement {
  const kind = cubie.kind as ModelKind;
  const canon = CANONICAL[kind];
  // The first of the 24 cube rotations that brings the canonical piece here (identity first).
  const frame = FRAMES.find((f) => same(apply(f.matrix, canon.pos), cubie.pos))!;
  const stickers: Partial<Record<Face, number>> = {};
  for (const face of canon.faces) stickers[face] = faceletAt(cubie.pos, apply(frame.matrix, FACE_NORMAL[face]));
  return { cubie, kind, rotation: frame.matrix, stickers };
}

/** Placements of all 26 cubies. */
export const PLACEMENTS: readonly PiecePlacement[] = CUBIES.map(placePiece);

/** `sticker-U` → "U"; anything else → null. */
export function stickerFaceOf(materialName: string | undefined): Face | null {
  const m = /^sticker-([URFDLB])$/i.exec(materialName ?? "");
  return m ? (m[1].toUpperCase() as Face) : null;
}
