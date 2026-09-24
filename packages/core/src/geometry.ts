/**
 * Cube geometry — facelet positions in 3D, computed once. Every move, frame
 * and block definition is derived from these positions instead of hand-typed
 * permutation tables, so the tables can't contain typos.
 *
 * Coordinates: x → right, y → up, z → towards the viewer (front).
 * Faces are ordered U R F D L B (Kociemba order); facelet index =
 * face * 9 + row * 3 + col, rows/cols as seen when looking straight at the
 * face in the usual net (U with F below it, D with F above it, the four side
 * faces with U on top).
 */

export type Face = "U" | "R" | "F" | "D" | "L" | "B";
export const FACES: readonly Face[] = ["U", "R", "F", "D", "L", "B"];

export type Vec3 = readonly [number, number, number];

export const FACE_NORMAL: Record<Face, Vec3> = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};

/** Cubie position of facelet (row, col) on `face`. */
function faceletPosition(face: Face, row: number, col: number): Vec3 {
  switch (face) {
    case "U":
      return [col - 1, 1, row - 1];
    case "R":
      return [1, 1 - row, 1 - col];
    case "F":
      return [col - 1, 1 - row, 1];
    case "D":
      return [col - 1, -1, 1 - row];
    case "L":
      return [-1, 1 - row, col - 1];
    case "B":
      return [1 - col, 1 - row, -1];
  }
}

export interface Facelet {
  index: number;
  face: Face;
  /** Position of the cubie this sticker is on. */
  pos: Vec3;
  /** Outward normal (the direction the sticker faces). */
  normal: Vec3;
}

export const FACELETS: readonly Facelet[] = FACES.flatMap((face, f) =>
  Array.from({ length: 9 }, (_, i) => ({
    index: f * 9 + i,
    face,
    pos: faceletPosition(face, Math.floor(i / 3), i % 3),
    normal: FACE_NORMAL[face],
  })),
);

export const FACELET_COUNT = 54;

const key = (pos: Vec3, normal: Vec3) => `${pos.join(",")}|${normal.join(",")}`;
const BY_POS_NORMAL = new Map(FACELETS.map((f) => [key(f.pos, f.normal), f.index]));

/** Facelet index at a cubie position facing `normal`, or -1. */
export function faceletAt(pos: Vec3, normal: Vec3): number {
  return BY_POS_NORMAL.get(key(pos, normal)) ?? -1;
}

/** Index of the centre facelet of a face. */
export const centerOf = (face: Face): number => FACES.indexOf(face) * 9 + 4;

export function faceOfNormal(n: Vec3): Face {
  return FACES.find((f) => FACE_NORMAL[f].every((c, i) => c === n[i]))!;
}

// ─── Rotations ───

export type Axis = 0 | 1 | 2; // x, y, z

/** One counter-clockwise quarter turn about the +axis (right-hand rule). */
function quarter(v: Vec3, axis: Axis): Vec3 {
  const [x, y, z] = v;
  switch (axis) {
    case 0:
      return [x, -z, y];
    case 1:
      return [z, y, -x];
    case 2:
      return [-y, x, z];
  }
}

/** Rotate by `q` counter-clockwise quarter turns (any integer) about +axis. */
export function rotate(v: Vec3, axis: Axis, q: number): Vec3 {
  let out = v;
  for (let i = 0; i < ((q % 4) + 4) % 4; i++) out = quarter(out, axis);
  return out;
}

/** 3×3 integer matrix (rows) — used for cube orientations (frames). */
export type Mat3 = readonly [Vec3, Vec3, Vec3];

export const IDENTITY: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function rotationMatrix(axis: Axis, q: number): Mat3 {
  const cols = [rotate([1, 0, 0], axis, q), rotate([0, 1, 0], axis, q), rotate([0, 0, 1], axis, q)];
  return [
    [cols[0][0], cols[1][0], cols[2][0]],
    [cols[0][1], cols[1][1], cols[2][1]],
    [cols[0][2], cols[1][2], cols[2][2]],
  ];
}

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const row = (i: number): Vec3 => [0, 1, 2].map((j) => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]) as unknown as Vec3;
  return [row(0), row(1), row(2)];
}

// ─── Cubies ───

export type CubieKind = "corner" | "edge" | "center";

export interface Cubie {
  pos: Vec3;
  kind: CubieKind;
  /** Facelet indices on this cubie. */
  facelets: number[];
}

export const CUBIES: readonly Cubie[] = (() => {
  const map = new Map<string, Cubie>();
  for (const f of FACELETS) {
    const k = f.pos.join(",");
    let c = map.get(k);
    if (!c) {
      const nonZero = f.pos.filter((v) => v !== 0).length;
      c = { pos: f.pos, kind: nonZero === 3 ? "corner" : nonZero === 2 ? "edge" : "center", facelets: [] };
      map.set(k, c);
    }
    c.facelets.push(f.index);
  }
  return [...map.values()];
})();

/** The cubie a facelet position belongs to. */
export const CUBIE_OF_FACELET: readonly Cubie[] = (() => {
  const out: Cubie[] = [];
  for (const c of CUBIES) for (const f of c.facelets) out[f] = c;
  return out;
})();
