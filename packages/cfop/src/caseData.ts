/**
 * OLL and PLL cases as data — numbering, names and groups as on
 * speedcubedb.com (OLL 1–57, PLL Aa…Z). `alg` is one standard algorithm per
 * case (speedcubedb's main one); recognition is built from it, so any
 * algorithm for the case works with the recogniser.
 */

export interface LastLayerCase {
  /** "OLL 27", "T"… */
  id: string;
  /** speedcubedb group ("Dot Case", "Adj Swap"…). */
  group: string;
  /** A standard algorithm (from the case, as held, to oriented / solved up to AUF). */
  alg: string;
}

export const OLL_CASES: readonly LastLayerCase[] = [
  { id: "OLL 1", group: "Dot Case", alg: "R U2 R2 F R F' U2 R' F R F'" },
  { id: "OLL 2", group: "Dot Case", alg: "R U' R2 D' r U r' D R2 U R'" },
  { id: "OLL 3", group: "Dot Case", alg: "R' F2 R2 U2 R' F R U2 R2 F2 R" },
  { id: "OLL 4", group: "Dot Case", alg: "R' F2 R2 U2 R' F' R U2 R2 F2 R" },
  { id: "OLL 5", group: "Square Shapes", alg: "r' U2 R U R' U r" },
  { id: "OLL 6", group: "Square Shapes", alg: "r U2 R' U' R U' r'" },
  { id: "OLL 7", group: "Lightning Shapes", alg: "r U R' U R U2 r'" },
  { id: "OLL 8", group: "Lightning Shapes", alg: "r' U' R U' R' U2 r" },
  { id: "OLL 9", group: "Fish Shapes", alg: "R U R' U' R' F R2 U R' U' F'" },
  { id: "OLL 10", group: "Fish Shapes", alg: "R U R' U R' F R F' R U2 R'" },
  { id: "OLL 11", group: "Lightning Shapes", alg: "r' R2 U R' U R U2 R' U M'" },
  { id: "OLL 12", group: "Lightning Shapes", alg: "M' R' U' R U' R' U2 R U' M" },
  { id: "OLL 13", group: "Knight Move Shapes", alg: "F U R U2 R' U' R U R' F'" },
  { id: "OLL 14", group: "Knight Move Shapes", alg: "R' F R U R' F' R F U' F'" },
  { id: "OLL 15", group: "Knight Move Shapes", alg: "r' U' r R' U' R U r' U r" },
  { id: "OLL 16", group: "Knight Move Shapes", alg: "r U r' R U R' U' r U' r'" },
  { id: "OLL 17", group: "Dot Case", alg: "R U R' U R' F R F' U2 R' F R F'" },
  { id: "OLL 18", group: "Dot Case", alg: "R U2 R2 F R F' U2 M' U R U' r'" },
  { id: "OLL 19", group: "Dot Case", alg: "S' R U R' S U' R' F R F'" },
  { id: "OLL 20", group: "Dot Case", alg: "r U R' U' M2 U R U' R' U' M'" },
  { id: "OLL 21", group: "OCLL", alg: "R U R' U R U' R' U R U2 R'" },
  { id: "OLL 22", group: "OCLL", alg: "R U2 R2 U' R2 U' R2 U2 R" },
  { id: "OLL 23", group: "OCLL", alg: "R2 D R' U2 R D' R' U2 R'" },
  { id: "OLL 24", group: "OCLL", alg: "r U R' U' r' F R F'" },
  { id: "OLL 25", group: "OCLL", alg: "R U2 R D R' U2 R D' R2" },
  { id: "OLL 26", group: "OCLL", alg: "R U2 R' U' R U' R'" },
  { id: "OLL 27", group: "OCLL", alg: "R U R' U R U2 R'" },
  { id: "OLL 28", group: "All Corners Oriented", alg: "r U R' U' M U R U' R'" },
  { id: "OLL 29", group: "Awkward Shapes", alg: "r2 D' r U r' D r2 U' r' U' r" },
  { id: "OLL 30", group: "Awkward Shapes", alg: "r' D' r U' r' D r2 U' r' U r U r'" },
  { id: "OLL 31", group: "P Shapes", alg: "R' U' F U R U' R' F' R" },
  { id: "OLL 32", group: "P Shapes", alg: "S R U R' U' R' F R f'" },
  { id: "OLL 33", group: "T Shapes", alg: "R U R' U' R' F R F'" },
  { id: "OLL 34", group: "C Shapes", alg: "f R f' U' r' U' R U M'" },
  { id: "OLL 35", group: "Fish Shapes", alg: "R U2 R2 F R F' R U2 R'" },
  { id: "OLL 36", group: "W Shapes", alg: "R U R2 F' U' F U R2 U2 R'" },
  { id: "OLL 37", group: "Fish Shapes", alg: "F R' F' R U R U' R'" },
  { id: "OLL 38", group: "W Shapes", alg: "R U R' U R U' R' U' R' F R F'" },
  { id: "OLL 39", group: "Lightning Shapes", alg: "R U R' F' U' F U R U2 R'" },
  { id: "OLL 40", group: "Lightning Shapes", alg: "R' F R U R' U' F' U R" },
  { id: "OLL 41", group: "Awkward Shapes", alg: "R U R' U R U2 R' F R U R' U' F'" },
  { id: "OLL 42", group: "Awkward Shapes", alg: "R' U' R U' R' U2 R F R U R' U' F'" },
  { id: "OLL 43", group: "P Shapes", alg: "R' U' F' U F R" },
  { id: "OLL 44", group: "P Shapes", alg: "f R U R' U' f'" },
  { id: "OLL 45", group: "T Shapes", alg: "F R U R' U' F'" },
  { id: "OLL 46", group: "C Shapes", alg: "R' U' R' F R F' U R" },
  { id: "OLL 47", group: "L Shapes", alg: "F R' F' R U2 R U' R' U R U2 R'" },
  { id: "OLL 48", group: "L Shapes", alg: "F R U R' U' R U R' U' F'" },
  { id: "OLL 49", group: "L Shapes", alg: "r U' r2 U r2 U r2 U' r" },
  { id: "OLL 50", group: "L Shapes", alg: "r' U r2 U' r2 U' r2 U r'" },
  { id: "OLL 51", group: "Line Shapes", alg: "F U R U' R' U R U' R' F'" },
  { id: "OLL 52", group: "Line Shapes", alg: "R' F' U' F U' R U R' U R" },
  { id: "OLL 53", group: "L Shapes", alg: "r' U' R U' R' U R U' R' U2 r" },
  { id: "OLL 54", group: "L Shapes", alg: "r U R' U R U' R' U R U2 r'" },
  { id: "OLL 55", group: "Line Shapes", alg: "R' F U R U' R2 F' R2 U R' U' R" },
  { id: "OLL 56", group: "Line Shapes", alg: "r U r' U R U' R' U R U' R' r U' r'" },
  { id: "OLL 57", group: "All Corners Oriented", alg: "R U R' U' M' U R U' r'" },
];

export const PLL_CASES: readonly LastLayerCase[] = [
  { id: "Aa", group: "Adj Swap", alg: "x R' U R' D2 R U' R' D2 R2 x'" },
  { id: "Ab", group: "Adj Swap", alg: "x R2 D2 R U R' D2 R U' R x'" },
  { id: "E", group: "Opp Swap", alg: "x' R U' R' D R U R' D' R U R' D R U' R' D' x" },
  { id: "F", group: "Adj Swap", alg: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R" },
  { id: "Ga", group: "Adj Swap", alg: "R2 U R' U R' U' R U' R2 D U' R' U R D'" },
  { id: "Gb", group: "Adj Swap", alg: "D R' U' R U D' R2 U R' U R U' R U' R2" },
  { id: "Gc", group: "Adj Swap", alg: "R2 U' R U' R U R' U R2 D' U R U' R' D" },
  { id: "Gd", group: "Adj Swap", alg: "R U R' U' D R2 U' R U' R' U R' U R2 D'" },
  { id: "H", group: "EPLL", alg: "M2 U' M2 U2 M2 U' M2" },
  { id: "Ja", group: "Adj Swap", alg: "x R2 F R F' R U2 r' U r U2 x'" },
  { id: "Jb", group: "Adj Swap", alg: "R U R' F' R U R' U' R' F R2 U' R'" },
  { id: "Na", group: "Opp Swap", alg: "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'" },
  { id: "Nb", group: "Opp Swap", alg: "R' U R U' R' F' U' F R U R' F R' F' R U' R" },
  { id: "Ra", group: "Adj Swap", alg: "R U' R' U' R U R D R' U' R D' R' U2 R'" },
  { id: "Rb", group: "Adj Swap", alg: "R' U2 R U2 R' F R U R' U' R' F' R2" },
  { id: "T", group: "Adj Swap", alg: "R U R' U' R' F R2 U' R' U' R U R' F'" },
  { id: "Ua", group: "EPLL", alg: "M2 U M U2 M' U M2" },
  { id: "Ub", group: "EPLL", alg: "M2 U' M U2 M' U' M2" },
  { id: "V", group: "Opp Swap", alg: "R' U R' U' R D' R' D R' U D' R2 U' R2 D R2" },
  { id: "Y", group: "Opp Swap", alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
  { id: "Z", group: "EPLL", alg: "M' U' M2 U' M2 U' M' U2 M2" },
];
