/**
 * CMLL cases as data — names and groups as on speedcubedb.com (O, H, Pi,
 * U, T, Sune, Anti Sune, L; 42 cases). `alg` is one standard algorithm per
 * case; recognition is built from it, so any algorithm for the case works.
 */

export interface CmllCase {
  /** "Sune Left Bar", "H Columns"… */
  id: string;
  group: string;
  alg: string;
}

export const CMLL_CASES: readonly CmllCase[] = [
  { id: "O Adjacent", group: "Solved", alg: "R U R' F' R U R' U' R' F R2 U' R'" },
  { id: "O Diagonal", group: "Solved", alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
  { id: "H Columns", group: "H", alg: "U R U R' U R U' R' U R U2 R'" },
  { id: "H Rows", group: "H", alg: "F R U R' U' R U R' U' R U R' U' F'" },
  { id: "H Column", group: "H", alg: "R' F2 D R2 U R2 D' F2 R" },
  { id: "H Row", group: "H", alg: "U2 r U' r2 D' r U' r' D r2 U r'" },
  { id: "Pi Right Bar", group: "Pi", alg: "F R U R' U' R U R' U' F'" },
  { id: "Pi Down Slash", group: "Pi", alg: "U F R' F' R U2 R U' R' U R U2 R'" },
  { id: "Pi X", group: "Pi", alg: "R' F2 D R2 U' R2 D' F2 R" },
  { id: "Pi Up Slash", group: "Pi", alg: "R U2 R' U' R U R' U2 R' F R F'" },
  { id: "Pi Columns", group: "Pi", alg: "U' r U' r2 D' r U r' D r2 U r'" },
  { id: "Pi Left Bar", group: "Pi", alg: "U' R' U' R' F R F' R U' R' U2 R" },
  { id: "U Up Slash", group: "U", alg: "U2 R2 D R' U2 R D' R' U2 R'" },
  { id: "U Down Slash", group: "U", alg: "R2 D' R U2 R' D R U2 R" },
  { id: "U Bottom Row", group: "U", alg: "R' U' R U' R' U2 R2 U R' U R U2 R'" },
  { id: "U Rows", group: "U", alg: "U' F R2 D R' U R D' R2 U' F'" },
  { id: "U X", group: "U", alg: "U2 r U' r' U r' D' r U' r' D r" },
  { id: "U Upper Row", group: "U", alg: "U' F R U R' U' F'" },
  { id: "T Left Bar", group: "T", alg: "U' R U R' U' R' F R F'" },
  { id: "T Right Bar", group: "T", alg: "U L' U' L U L F' L' F" },
  { id: "T Rows", group: "T", alg: "R U2 R' U' R U' R2 U2 R U R' U R" },
  { id: "T Bottom Row", group: "T", alg: "r' U r U2 R2 F R F' R" },
  { id: "T Top Row", group: "T", alg: "r' D' r U r' D r U' r U r'" },
  { id: "T Columns", group: "T", alg: "U2 r U' r2 D' r U2 r' D r2 U r'" },
  { id: "Sune Left Bar", group: "Sune", alg: "U R U R' U R U2 R'" },
  { id: "Sune X", group: "Sune", alg: "U L' U2 L U2 r U' r' F" },
  { id: "Sune Up Slash", group: "Sune", alg: "U F R' F' R U2 R U2 R'" },
  { id: "Sune Columns", group: "Sune", alg: "U R U R' U' R' F R F' R U R' U R U2 R'" },
  { id: "Sune Right Bar", group: "Sune", alg: "U' R U R' U R' F R F' R U2 R'" },
  { id: "Sune Down Slash", group: "Sune", alg: "U r U' r' F R' F' R" },
  { id: "Anti Sune Right Bar", group: "Anti Sune", alg: "U R' U' R U' R' U2 R" },
  { id: "Anti Sune Columns", group: "Anti Sune", alg: "U2 R U R2 F' r F R U' r2 F r" },
  { id: "Anti Sune Down Slash", group: "Anti Sune", alg: "U' F' L F L' U2 L' U2 L" },
  { id: "Anti Sune X", group: "Anti Sune", alg: "U' R U2 R' U2 R' F R F'" },
  { id: "Anti Sune Up Slash", group: "Anti Sune", alg: "U' R' F R F' r U r'" },
  { id: "Anti Sune Left Bar", group: "Anti Sune", alg: "U R U2 R' F R' F' R U' R U' R'" },
  { id: "L Best", group: "L", alg: "U' F' r U r' U' r' F r" },
  { id: "L Good", group: "L", alg: "U2 F R' F' R U R U' R'" },
  { id: "L Pure", group: "L", alg: "R U R' U R U' R' U R U' R' U R U2 R'" },
  { id: "L Front Commutator", group: "L", alg: "U2 R U2 R D R' U2 R D' R2" },
  { id: "L Diagonal", group: "L", alg: "U2 R U2 R2 F R F' R U2 R'" },
  { id: "L Back Commutator", group: "L", alg: "U R' U2 R' D' R U2 R' D R2" },
];
