/**
 * F2L cases as data — numbering and groups as on speedcubedb.com (F2L 1–41:
 * the pair in the top layer or its own slot), one standard algorithm per
 * case for each slot (speedcubedb's main one). Recognition is built from
 * them, so any algorithm for the case works.
 */

import type { F2LSlot } from "./slots";

export interface F2LCase {
  /** "F2L 1"… */
  id: string;
  group: string;
  /** An algorithm per slot (cube held with the cross on D). */
  algs: Readonly<Record<F2LSlot, string>>;
}

export const F2L_CASES: readonly F2LCase[] = [
  { id: "F2L 1", group: "Free Pairs", algs: { FR: "U R U' R'", FL: "F' r U r'", BL: "U L U' L'", BR: "U f R' f'" } },
  { id: "F2L 2", group: "Free Pairs", algs: { FR: "F R' F' R", FL: "U' L' U L", BL: "U' f' L f", BR: "U' R' U R" } },
  { id: "F2L 3", group: "Free Pairs", algs: { FR: "F' U' F", FL: "L' U' L", BL: "y R' U' R y'", BR: "R' U' R" } },
  { id: "F2L 4", group: "Free Pairs", algs: { FR: "R U R'", FL: "F U F'", BL: "L U L'", BR: "f R f'" } },
  { id: "F2L 5", group: "Disconnected Pairs", algs: { FR: "U' R U R' U2 R U' R'", FL: "U R' F r U' r' F' R", BL: "U' L U L' U2 L U' L'", BR: "U' R' F R U R' U' F' R" } },
  { id: "F2L 6", group: "Disconnected Pairs", algs: { FR: "U' r U' R' U R U r'", FL: "U L' U' L U2 L' U L", BL: "U r U' r' U' L U F L'", BR: "U R' U' R U2 R' U R" } },
  { id: "F2L 7", group: "Disconnected Pairs", algs: { FR: "U' R U2 R' U' R U2 R'", FL: "F U R U2 R' U F'", BL: "U' L U2 L' U2 L U' L'", BR: "r U2 R2 U' R2 U' r'" } },
  { id: "F2L 8", group: "Disconnected Pairs", algs: { FR: "d R' U2 R U R' U2 R y", FL: "U L' U2 L U L' U2 L", BL: "l' U2 L2 U L2 U l", BR: "U R' U2 R U R' U2 R" } },
  { id: "F2L 9", group: "Disconnected Pairs", algs: { FR: "U' R U' R' U F' U' F", FL: "U L' U' L U' L' U' L", BL: "y U R' U' R U' R' U' R y'", BR: "U R' U' R U' R' U' R" } },
  { id: "F2L 10", group: "Disconnected Pairs", algs: { FR: "U' R U R' U R U R'", FL: "U L' U L U' F U F'", BL: "U' L U L' U L U L'", BR: "U R' U R U' f R f'" } },
  { id: "F2L 11", group: "Connected Pairs", algs: { FR: "U' R U2 R' U F' U' F", FL: "L' U L U' L' U L U2 L' U L", BL: "U' L U2 L' U f' L' f", BR: "R' U R U' R' U R U2 R' U R" } },
  { id: "F2L 12", group: "Connected Pairs", algs: { FR: "R U' R' U R U' R' U2 R U' R'", FL: "U L' U2 L U' F U F'", BL: "L' U2 L2 U L2 U L", BR: "U R' U2 R U' f R f'" } },
  { id: "F2L 13", group: "Connected Pairs", algs: { FR: "y' U R' U R U' R' U' R y", FL: "U L' U L U' L' U' L", BL: "d L' U L U' L' U' L y", BR: "U R' U R U' R' U' R" } },
  { id: "F2L 14", group: "Connected Pairs", algs: { FR: "U' R U' R' U R U R'", FL: "d' L U' L' U L U L' y'", BL: "U' L U' L' U L U L'", BR: "y U' R U' R' U R U R' y'" } },
  { id: "F2L 15", group: "Connected Pairs", algs: { FR: "R' D' R U' R' D R U R U' R'", FL: "L' U L U2 F U F'", BL: "L U L' U2 L U' L' U L U' L'", BR: "R' U R U2 f R f'" } },
  { id: "F2L 16", group: "Connected Pairs", algs: { FR: "R U' R' U2 F' U' F", FL: "F U' R U' R' U2 F'", BL: "L U' L' U2 f' L' f", BR: "R' U' R U2 R' U R U' R' U R" } },
  { id: "F2L 17", group: "Connected Pairs", algs: { FR: "R U2 R' U' R U R'", FL: "y L U2 L' U' L U L' y'", BL: "L U2 L' U' L U L'", BR: "y' L U2 L' U' L U L' y" } },
  { id: "F2L 18", group: "Connected Pairs", algs: { FR: "y' R' U2 R U R' U' R y", FL: "L' U2 L U L' U' L", BL: "y R' U2 R U R' U' R y'", BR: "R' U2 R U R' U' R" } },
  { id: "F2L 19", group: "Disconnected Pairs", algs: { FR: "U R U2 R' U R U' R'", FL: "U L' U L2 F' L' F L' U L", BL: "U L U2 L' U L U' L'", BR: "y U R U2 R' U R U' R' y'" } },
  { id: "F2L 20", group: "Disconnected Pairs", algs: { FR: "y' U' R' U2 R U' R' U R y", FL: "U' L' U2 L U' L' U L", BL: "y U' R' U2 R U' R' U R y'", BR: "U' R' U2 R U' R' U R" } },
  { id: "F2L 21", group: "Disconnected Pairs", algs: { FR: "U2 R U R' U R U' R'", FL: "l' U l U2 l' U' l", BL: "L U' L' U2 L U L'", BR: "r' U r U2 r' U' r" } },
  { id: "F2L 22", group: "Disconnected Pairs", algs: { FR: "r U' r' U2 r U r'", FL: "L' U L U2 L' U' L", BL: "l U' l' U2 l U l'", BR: "R' U R U2 R' U' R" } },
  { id: "F2L 23", group: "Connected Pairs", algs: { FR: "U R U' R' U' R U' R' U R U' R'", FL: "F' U' L' U L F L' U L", BL: "U L U' L' U' L U' L' U L U' L'", BR: "U R' F R' F' R2 U' R' U R" } },
  { id: "F2L 24", group: "Connected Pairs", algs: { FR: "F U R U' R' F' R U' R'", FL: "U' L' U L U L' U L U' L' U L", BL: "U2 r U R' U R U2 B r'", BR: "R' U' R U2 R' U' R U R' U' R" } },
  { id: "F2L 25", group: "Corner In Slot", algs: { FR: "U' R' F R F' R U R'", FL: "U' L' U L F' r U r'", BL: "L U' L' U' L U' L' U L U L'", BR: "U' R' U M U' R U M'" } },
  { id: "F2L 26", group: "Corner In Slot", algs: { FR: "U R U' R' F R' F' R", FL: "r U r' U' r' F r F'", BL: "L S L' U L S' L'", BR: "U f R f' U' R' U' R" } },
  { id: "F2L 27", group: "Corner In Slot", algs: { FR: "R U' R' U R U' R'", FL: "L' U' L U F' r U r'", BL: "L U' L' U L U' L'", BR: "R' U2 R' F R F' R" } },
  { id: "F2L 28", group: "Corner In Slot", algs: { FR: "R U R' U' F R' F' R", FL: "L' U L U' L' U L", BL: "L U2 L F' L' F L'", BR: "R' U R U' R' U R" } },
  { id: "F2L 29", group: "Corner In Slot", algs: { FR: "R' F R F' U R U' R'", FL: "L' U' L U L' U' L", BL: "y R' U' R U R' U' R y'", BR: "R' U' R U R' U' R" } },
  { id: "F2L 30", group: "Corner In Slot", algs: { FR: "R U R' U' R U R'", FL: "L F' L' F U' L' U L", BL: "L U L' U' L U L'", BR: "y' L U L' U' L U L' y" } },
  { id: "F2L 31", group: "Edge In Slot", algs: { FR: "U' R' F R F' R U' R'", FL: "U L F' L' F L' U L", BL: "L U' L F' L' F L'", BR: "R' U R' F R F' R" } },
  { id: "F2L 32", group: "Edge In Slot", algs: { FR: "U R U' R' U R U' R' U R U' R'", FL: "U' L' U L U' L' U L U' L' U L", BL: "L U L' U' L U L' U' L U L'", BR: "U' R' U R U' R' U R U' R' U R" } },
  { id: "F2L 33", group: "Edge In Slot", algs: { FR: "U' R U' R' U2 R U' R'", FL: "R' D R U' R' D' R", BL: "U' L U' L' U2 L U' L'", BR: "U' R D R' U R D' R'" } },
  { id: "F2L 34", group: "Edge In Slot", algs: { FR: "U R U R' U2 R U R'", FL: "U L' U L U2 L' U L", BL: "U L U L' U2 L U L'", BR: "U R' U R U R' U2 R" } },
  { id: "F2L 35", group: "Edge In Slot", algs: { FR: "U' R U R' U F' U' F", FL: "U2 F U F' U' L' U L", BL: "U' L U L' U f' L' f", BR: "U' f R f' U R' U' R" } },
  { id: "F2L 36", group: "Edge In Slot", algs: { FR: "U F' U' F U' R U R'", FL: "U L' U' L d' L U L' y'", BL: "U f' L' f U' L U L'", BR: "U R' U' R U' f R f'" } },
  { id: "F2L 37", group: "Pieces In Slot", algs: { FR: "R2 U2 F R2 F' U2 R' U R'", FL: "L2 U2 F' L2 F U2 L U' L", BL: "L U' L' l' U2 L2 U L2 U l", BR: "R' U R r U2 R2 U' R2 U' r'" } },
  { id: "F2L 38", group: "Pieces In Slot", algs: { FR: "R U' R' U' R U R' U2 R U' R'", FL: "L' U L U' L' U2 L U' L' U L", BL: "L U L' U' L U2 L' U' L U L'", BR: "R' U' R U2 R' U R U' R' U' R" } },
  { id: "F2L 39", group: "Pieces In Slot", algs: { FR: "R U' R' U R U2 R' U R U' R'", FL: "L' U' L U L' U2 L U L' U' L", BL: "L U L' U2 L U' L' U L U L'", BR: "R' U' R U R' U2 R U R' U' R" } },
  { id: "F2L 40", group: "Pieces In Slot", algs: { FR: "r U' r' U2 r U r' R U R'", FL: "L' U L F R U2 R' F'", BL: "l U' l' U2 l U l' L U L'", BR: "R' U R r' U r U2 r' U' r" } },
  { id: "F2L 41", group: "Pieces In Slot", algs: { FR: "R U' R' r U' r' U2 r U r'", FL: "l' U l U2 l' U' l L' U' L", BL: "f' L f U' L U L' U L U L'", BR: "r' U r U2 r' U' r R' U' R" } },
];
