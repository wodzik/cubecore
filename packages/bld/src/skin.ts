/**
 * A skin with the scheme's letters on the stickers. Each sticker carries the
 * letter of its HOME position and keeps it wherever it goes — so the letter
 * showing in the buffer is the next letter to remember.
 *
 *   player.skin = letterSkin(SKINS.standard);                       // colours + letters
 *   player.skin = letterSkin(SKINS.standard, { alwaysShow: true });   // letters stay on masked (grey) stickers too
 */

import { FACELETS, FACE_BASIS, type Move, applyMoves, solvedState } from "@cubecore/core";
import type { Decal, Skin } from "@cubecore/skin";
import { type LetterScheme, RUWIX, letterAt } from "./scheme";

export interface LetterSkinOptions {
  scheme?: LetterScheme;
  /** Letter colour. Default near-black with a white edge (reads on every sticker colour). */
  color?: string;
  outline?: string | null;
  /** Letter size as a fraction of the tile. Default 0.62. */
  size?: number;
  /** Keep the letters on stickers a mask greys out (a "letters only" cube). Default false. */
  alwaysShow?: boolean;
  /** How the cube is held (as in `memo`): letters by the positions as held, upright for the holder. */
  rotation?: string | readonly Move[];
}

const escape = (s: string) => s.replace(/[<&"]/g, (c) => ({ "<": "&lt;", "&": "&amp;", '"': "&quot;" })[c]!);

/** The SVG of one letter (square, transparent). */
export function letterSvg(letter: string, color = "#111111", outline: string | null = "#ffffff"): string {
  const stroke = outline ? ` stroke="${escape(outline)}" stroke-width="7" paint-order="stroke" stroke-linejoin="round"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="78" fill="${escape(color)}"${stroke}>${escape(letter)}</text></svg>`;
}

const same = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
const minus = (a: readonly number[], b: readonly number[]) => a.map((v, i) => v - b[i]);
const neg = (a: readonly number[]) => a.map((v) => -v);

export function letterSkin(base: Skin, options: LetterSkinOptions = {}): Skin {
  const scheme = options.scheme ?? RUWIX;
  // Held position of each sticker (a solved cube turned as held), and how its face is turned for the holder.
  const rot = options.rotation ? applyMoves(solvedState(), options.rotation) : solvedState();
  const heldAt = new Map<number, number>();
  rot.forEach((sticker, pos) => heldAt.set(sticker, pos));
  const decals: Decal[] = [];
  for (const f of FACELETS) {
    const held = heldAt.get(f.index)!;
    const letter = letterAt(scheme, held);
    if (!letter) continue;
    // The sticker's own "right" (centre → right edge of its face), as seen on the held face.
    const face = Math.floor(f.index / 9) * 9;
    const right = minus(FACELETS[heldAt.get(face + 5)!].pos, FACELETS[heldAt.get(face + 4)!].pos);
    const { a, b } = FACE_BASIS[FACELETS[held].face];
    const rotate = same(right, a) ? 0 : same(right, b) ? 3 : same(right, neg(a)) ? 2 : 1;
    decals.push({
      select: { stickers: [f.index] },
      rotate,
      image: letterSvg(letter, options.color, options.outline === undefined ? "#ffffff" : options.outline),
      size: options.size ?? 0.62,
      onlyRegular: !options.alwaysShow,
    });
  }
  return { ...base, decals: [...(base.decals ?? []), ...decals] };
}
