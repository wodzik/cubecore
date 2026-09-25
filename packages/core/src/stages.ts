/**
 * Solving stages as plain data — which pieces a stage puts where — so
 * method packages can describe their trainer stages (cross, XCross, Roux
 * first square…) without depending on a solver; @cubecore/solve runs them.
 *
 * Canonical frame: cross / first layer on D, F2L slots FR FL BL BR, Roux
 * first block on L-bottom. Pieces use the Kociemba ids of core cubies.ts
 * (edges UR UF UL UB DR DF DL DB FR FL BL BR, corners URF UFL ULB UBR DFR
 * DLF DBL DRB).
 */

export interface Piece {
  kind: "edge" | "corner";
  /** Kociemba piece id. */
  id: number;
}

export interface StageDef {
  name: string;
  pieces: readonly Piece[];
  /** Also orient every edge (EOCross). */
  eo?: boolean;
  /** Groups (indices into `pieces`) with exact distance tables; the heuristic is their max. At most 5 pieces each. */
  groups: readonly (readonly number[])[];
  /**
   * The stage is done in any of these states — algorithms applied to a
   * solved cube (canonical frame), e.g. a pair "one insert away". Default:
   * the pieces at home.
   */
  goals?: readonly string[];
  /** Indices into `pieces` kept solved in trainer cases (e.g. the first block while practising the second square). */
  keep?: readonly number[];
  /**
   * The block may be built with any of the four x rotations (Roux first
   * block / square: any bottom colour on the L side) — the distance is the
   * best of them. Trainer cases are then drawn from whole random states.
   */
  neutral?: "x";
  /**
   * Known cases for levels too rare to draw at run time (EOCross at 10: a
   * few in a million): depth → placements "v.v.v…:flip" (each piece's
   * value in `pieces` order, position × orientations + orientation; flip
   * for EO stages). Found once offline; the rest of the cube stays random.
   */
  seeds?: Readonly<Record<number, readonly string[]>>;
  /**
   * Faces the solution may turn (default all six) — e.g. ["R", "U", "L"]
   * for ZZ's F2L, which keeps every edge oriented.
   */
  moves?: readonly ("U" | "R" | "F" | "D" | "L" | "B")[];
}

export const edgePiece = (id: number): Piece => ({ kind: "edge", id });
export const cornerPiece = (id: number): Piece => ({ kind: "corner", id });

/** Named pieces (canonical positions). */
export const PIECE = {
  UR: edgePiece(0), UF: edgePiece(1), UL: edgePiece(2), UB: edgePiece(3),
  DR: edgePiece(4), DF: edgePiece(5), DL: edgePiece(6), DB: edgePiece(7),
  FR: edgePiece(8), FL: edgePiece(9), BL: edgePiece(10), BR: edgePiece(11),
  URF: cornerPiece(0), UFL: cornerPiece(1), ULB: cornerPiece(2), UBR: cornerPiece(3),
  DFR: cornerPiece(4), DLF: cornerPiece(5), DBL: cornerPiece(6), DRB: cornerPiece(7),
} as const;

/**
 * A last-six-edges stage (Roux): moves are M and U only, the blocks and
 * CMLL stay solved; done in any of `goals` (algorithms from a solved cube),
 * compared on what the stage is about:
 * `features: "eolr"` — edge orientation of the six edges, where UL and UR
 * are, centres and corner AUF (the other four edges' order is the next
 * step's business); `"lse"` — everything (the whole of LSE).
 */
export interface LseStageDef {
  name: string;
  kind: "lse";
  features: "eolr" | "lse";
  goals: readonly string[];
}

export type AnyStageDef = StageDef | LseStageDef;
export const isLseStage = (def: AnyStageDef): def is LseStageDef => (def as LseStageDef).kind === "lse";
