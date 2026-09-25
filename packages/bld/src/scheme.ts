/**
 * Letter schemes: a letter for each corner sticker and each edge sticker
 * (24 + 24; centres have none). Positions are facelet indices of the cube as
 * held (U = the up face).
 *
 * Both built-ins letter each face clockwise from its top-left corner / top
 * edge, looking at the face in the usual net (U with B at its top, side
 * faces with U at the top, D with F at its top) — A B C D on the first face,
 * E F G H on the second, … — they differ only in the order of the faces.
 */

import { type Face, FACES } from "@cubecore/core";

export interface LetterScheme {
  name: string;
  /** Letter of each corner sticker position (facelet index → letter). */
  corners: Record<number, string>;
  /** Letter of each edge sticker position. */
  edges: Record<number, string>;
}

/** Within a face (row-major 0..8): corners and edges, clockwise from the top-left. */
const CORNER_CELLS = [0, 2, 8, 6];
const EDGE_CELLS = [1, 5, 7, 3];
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWX";

/** A scheme lettering the faces in `order`, four letters each, clockwise from the top-left. */
export function schemeByFaces(name: string, order: readonly Face[]): LetterScheme {
  const corners: Record<number, string> = {};
  const edges: Record<number, string> = {};
  order.forEach((face, i) => {
    const base = FACES.indexOf(face) * 9;
    for (let j = 0; j < 4; j++) {
      corners[base + CORNER_CELLS[j]] = ALPHABET[i * 4 + j];
      edges[base + EDGE_CELLS[j]] = ALPHABET[i * 4 + j];
    }
  });
  return { name, corners, edges };
}

/** Speffz: U, L, F, R, B, D. */
export const SPEFFZ = schemeByFaces("Speffz", ["U", "L", "F", "R", "B", "D"]);
/** The ruwix.com tutorial's scheme: U, F, R, B, L, D. */
export const RUWIX = schemeByFaces("ruwix", ["U", "F", "R", "B", "L", "D"]);

export const SCHEMES = { speffz: SPEFFZ, ruwix: RUWIX } as const;

/** Letter of any sticker position (corner or edge), or "" for a centre. */
export const letterAt = (scheme: LetterScheme, position: number): string => scheme.corners[position] ?? scheme.edges[position] ?? "";
