/**
 * Roux — first block, second block, CMLL, EO, UL/UR, L4E — checks, method and
 * masks. Canonical: first block on L, second on R, both on the bottom layer.
 *
 * M slices move the U/F/D/B centres, so blocks are checked by comparing
 * pieces to each other (and to the L/R centres, which M never moves) — still
 * no absolute colours, so any scheme and any orientation works.
 */

import {
  type Cubie,
  FACELETS,
  type Face,
  type Frame,
  IDENTITY_FRAME,
  type Mask,
  type MaskRule,
  type Method,
  type State,
  buildMask,
  checks as C,
  colorAt,
} from "@cubecore/core";

const { cubieAt, faceletOn, centerIdx, opposite, upToAuf } = C;

const FB = { dl: cubieAt(-1, -1, 0), fl: cubieAt(-1, 0, 1), bl: cubieAt(-1, 0, -1), dfl: cubieAt(-1, -1, 1), dbl: cubieAt(-1, -1, -1) };
const SB = { dr: cubieAt(1, -1, 0), fr: cubieAt(1, 0, 1), br: cubieAt(1, 0, -1), dfr: cubieAt(1, -1, 1), dbr: cubieAt(1, -1, -1) };

function uniformOn(s: State, cubies: readonly Cubie[], face: Face): number | null {
  const colors = cubies.map((c) => faceletOn(c, face)).filter((f): f is number => f !== undefined).map((f) => colorAt(s, f));
  return colors.every((c) => c === colors[0]) ? colors[0] : null;
}

/**
 * A 1×2×3 Roux block on the `side` (L or R) of the bottom layer: its side
 * stickers match that side's centre, and its bottom / front / back stickers
 * are each one colour (the centres there may be off by M, so they aren't used).
 * Returns the block's colours, or null if it isn't built.
 */
function rouxBlock(s: State, side: "L" | "R"): { bottom: number; front: number; back: number } | null {
  const b = side === "L" ? FB : SB;
  const pieces = Object.values(b);
  const sideColor = colorAt(s, centerIdx(side));
  if (!pieces.every((c) => colorAt(s, faceletOn(c, side)!) === sideColor)) return null;
  const bottom = uniformOn(s, pieces, "D");
  const front = uniformOn(s, pieces, "F");
  const back = uniformOn(s, pieces, "B");
  if (bottom === null || front === null || back === null) return null;
  // The three colours must form a real block (e.g. bottom ≠ front's opposite) — true for real pieces
  // once every sticker agrees, but guard against a colour appearing twice.
  if (new Set([bottom, front, back, sideColor]).size !== 4) return null;
  return { bottom, front, back };
}

export const firstBlock = (s: State) => rouxBlock(s, "L") !== null;

export function secondBlock(s: State): boolean {
  const fb = rouxBlock(s, "L");
  const sb = rouxBlock(s, "R");
  return fb !== null && sb !== null && fb.bottom === sb.bottom && fb.front === sb.front && fb.back === sb.back;
}

const CMLL_CORNERS = { ufl: cubieAt(-1, 1, 1), ubl: cubieAt(-1, 1, -1), ufr: cubieAt(1, 1, 1), ubr: cubieAt(1, 1, -1) };

function cmllAligned(s: State): boolean {
  const fb = rouxBlock(s, "L");
  if (!fb) return false;
  const top = opposite(fb.bottom);
  const { ufl, ubl, ufr, ubr } = CMLL_CORNERS;
  const col = (c: Cubie, face: Face) => colorAt(s, faceletOn(c, face)!);
  return (
    [ufl, ubl, ufr, ubr].every((c) => col(c, "U") === top) &&
    col(ufl, "L") === colorAt(s, centerIdx("L")) &&
    col(ubl, "L") === colorAt(s, centerIdx("L")) &&
    col(ufr, "R") === colorAt(s, centerIdx("R")) &&
    col(ubr, "R") === colorAt(s, centerIdx("R")) &&
    col(ufl, "F") === fb.front &&
    col(ufr, "F") === fb.front &&
    col(ubl, "B") === fb.back &&
    col(ubr, "B") === fb.back
  );
}

/** CMLL: both blocks, and the top corners solved relative to them (up to AUF). */
export const cmll = (s: State) => secondBlock(s) && upToAuf(s, cmllAligned);

const LSE_EDGES = [cubieAt(0, 1, 1), cubieAt(0, 1, -1), cubieAt(-1, 1, 0), cubieAt(1, 1, 0), cubieAt(0, -1, 1), cubieAt(0, -1, -1)];

/** LSE edge orientation: every last-six edge has its top/bottom-coloured sticker on U or D. */
export function lseEo(s: State): boolean {
  if (!cmll(s)) return false;
  const bottom = rouxBlock(s, "L")!.bottom;
  const ud = [bottom, opposite(bottom)];
  return LSE_EDGES.every((e) => {
    const f = e.facelets.find((x) => ud.includes(colorAt(s, x)));
    return f !== undefined && (FACELETS[f].face === "U" || FACELETS[f].face === "D");
  });
}

/** LSE 4b: UL and UR edges in place, with the corners aligned. */
export function ulUr(s: State): boolean {
  if (!lseEo(s)) return false;
  return upToAuf(s, (t) => {
    if (!cmllAligned(t)) return false;
    const top = opposite(rouxBlock(t, "L")!.bottom);
    const ul = cubieAt(-1, 1, 0);
    const ur = cubieAt(1, 1, 0);
    return (
      colorAt(t, faceletOn(ul, "U")!) === top &&
      colorAt(t, faceletOn(ur, "U")!) === top &&
      colorAt(t, faceletOn(ul, "L")!) === colorAt(t, centerIdx("L")) &&
      colorAt(t, faceletOn(ur, "R")!) === colorAt(t, centerIdx("R"))
    );
  });
}

export const ROUX: Method = {
  id: "roux",
  name: "Roux",
  stages: [
    { id: "fb", label: "First block", done: firstBlock },
    { id: "sb", label: "Second block", done: secondBlock },
    { id: "cmll", label: "CMLL", done: cmll },
    { id: "eo", label: "EO", done: lseEo },
    { id: "ulur", label: "UL/UR", done: ulUr },
    { id: "l4e", label: "L4E", done: C.isSolved },
  ],
};

// ─── masks (canonical: blocks on L/R, bottom layer) ───

export type RouxMask = "fb" | "blocks" | "cmll" | "lse" | "eo" | "ulur";

const y = (c: Cubie) => c.pos[1];

export const ROUX_MASKS: Record<RouxMask, MaskRule> = {
  fb: (f, c) => (c.pos[0] === -1 && y(c) <= 0 ? "regular" : c.kind === "center" ? "dim" : "ignored"),
  blocks: (f, c) => (c.pos[0] !== 0 && y(c) <= 0 ? "regular" : c.kind === "center" ? "dim" : "ignored"),
  cmll: (f, c) => (c.kind === "corner" && y(c) === 1 ? "regular" : c.pos[0] !== 0 && y(c) <= 0 ? "dim" : "ignored"),
  lse: (f, c) => (c.pos[0] === 0 || (c.kind === "edge" && y(c) === 1) ? "regular" : "dim"),
  // LSE step by step: EO shows the six edges as orientation material; UL/UR puts those two in colour.
  eo: (f, c) => (c.kind === "center" ? "regular" : lse6(c) ? "oriented" : "dim"),
  ulur: (f, c) => (c.kind === "center" ? "regular" : c.kind === "edge" && y(c) === 1 && c.pos[0] !== 0 ? "regular" : lse6(c) ? "ignored" : "dim"),
};

/** The last six edges: the M slice plus UL and UR. */
function lse6(c: Cubie): boolean {
  return c.kind === "edge" && (c.pos[0] === 0 || y(c) === 1);
}

export const rouxMask = (name: RouxMask, frame: Frame = IDENTITY_FRAME): Mask => buildMask(ROUX_MASKS[name], frame);
