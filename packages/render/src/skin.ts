/**
 * Skin — how the cube looks, as plain data (serialisable, presets below).
 * Everything the renderer draws comes from here, per theme.
 */

import type { MaskState } from "@cubecore/core";
import type { StickerPaths, StickerShape } from "./shapes";

export interface Skin {
  /** Plastic colour. */
  body: string;
  /** Cubie size relative to the 1-unit grid (1 = no gap between cubies). */
  cubieSize: number;
  /** Rounding of the cubie edges, 0..0.5. */
  cubieRadius: number;
  stickers: {
    /** Colour of each colour class, U R F D L B home-face order. */
    colors: readonly [string, string, string, string, string, string];
    /** Side of a sticker relative to a cubie face, 0..1. */
    size: number;
    /** Corner radius relative to the sticker, 0..0.5 (0.5 = circle) — used when `shape` is not given. */
    radius: number;
    /** Per-piece-kind corner radii (see shapes.ts) — overrides `radius`. */
    shape?: StickerShape;
    /** Custom outlines as SVG path data — override `shape` per piece kind. */
    paths?: StickerPaths;
    /** How far a tile stands out from the plastic (cubie units) — stickerless tiles are thicker. */
    thickness?: number;
  };
  /**
   * A picture on one sticker, e.g. a brand logo on a centre. It follows that
   * sticker (by home facelet index). `image` is a URL, data: URL or an SVG
   * string. `blend: "multiply"` lets a logo drawn on white sit on any colour.
   * Brand logos are trademarks — apps supply their own, the library ships none.
   */
  logo?: { sticker: number; image: string; size: number; blend?: "normal" | "multiply" };
  /** Colours for masked stickers. `dim` pulls the sticker colour towards the body by `dimAmount`. */
  mask: { ignored: string; oriented: string; dimAmount: number };
  /** Floating "back" stickers showing the hidden faces. */
  hints: { enabled: boolean; distance: number; opacity: number; ignoredOpacity: number };
  background: string | null;
}

const WESTERN = ["#ffffff", "#e8322f", "#1fb24a", "#ffd500", "#ff8a00", "#1e5eff"] as const;

export const SKINS = {
  /** Black plastic, rounded stickers — a typical modern speed cube. */
  standard: {
    body: "#101010",
    cubieSize: 0.97,
    cubieRadius: 0.1,
    stickers: { colors: WESTERN, size: 0.86, radius: 0.18 },
    mask: { ignored: "#5a5a5a", oriented: "#39c7d4", dimAmount: 0.55 },
    hints: { enabled: false, distance: 1.4, opacity: 0.75, ignoredOpacity: 0.35 },
    background: null,
  },
  /** Stickerless look: tiles fill the face, small radius, dark grey core. */
  stickerless: {
    body: "#1c1c1c",
    cubieSize: 0.97,
    cubieRadius: 0.08,
    stickers: { colors: WESTERN, size: 0.94, radius: 0.1 },
    mask: { ignored: "#4a4a4a", oriented: "#39c7d4", dimAmount: 0.55 },
    hints: { enabled: false, distance: 1.4, opacity: 0.75, ignoredOpacity: 0.35 },
    background: null,
  },
  /**
   * GAN-style stickerless: tiles almost fill each cubie face; corner tiles
   * round off the corner facing the centre, edge tiles round their inner side
   * into a tongue, centre tiles are nearly round. Add a logo with `logo`.
   */
  gan: {
    body: "#0a0a0a",
    cubieSize: 0.985,
    cubieRadius: 0.06,
    stickers: {
      colors: ["#f7f7f5", "#f5303a", "#1fc25a", "#ffe01a", "#ff8a1f", "#1f73ea"],
      size: 0.955,
      radius: 0.08,
      shape: { corner: { inner: 0.34, outer: 0.07 }, edge: { inner: 0.3, outer: 0.07 }, center: 0.36 },
      thickness: 0.012,
    },
    mask: { ignored: "#5a5a5a", oriented: "#39c7d4", dimAmount: 0.55 },
    hints: { enabled: false, distance: 1.4, opacity: 0.75, ignoredOpacity: 0.35 },
    background: null,
  },
} satisfies Record<string, Skin>;

export function stickerColor(skin: Skin, colorClass: number, state: MaskState): string | null {
  const base = skin.stickers.colors[colorClass];
  switch (state) {
    case "regular":
      return base;
    case "dim":
      return mix(base, skin.body, skin.mask.dimAmount);
    case "ignored":
      return skin.mask.ignored;
    case "oriented":
      return skin.mask.oriented;
    case "invisible":
      return null;
  }
}

export function mix(hex: string, towards: string, amount: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(towards);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, "0")).join("");
}
