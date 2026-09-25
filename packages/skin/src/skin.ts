/**
 * Skin — how the cube looks, as plain data (serialisable, presets below).
 * Everything the renderer draws comes from here, per theme.
 */

import type { MaskState } from "@cubecore/core";
import type { Decal, FeatureUse } from "./attachments";
import type { PieceKind, StickerPaths, StickerShape } from "./shapes";

export interface Skin {
  /** Plastic colour. */
  body: string;
  /**
   * Plastic between the tiles in 2D pictures (@cubecore/image); null =
   * see-through (the page shows in the gaps). Default: `body`. Light
   * plastic with light tiles (white on ivory) blurs together in 2D.
   */
  pictureBody?: string | null;
  /** Cubie size relative to the 1-unit grid (1 = no gap between cubies). */
  cubieSize: number;
  /** Rounding of the cubie edges, 0..0.5. */
  cubieRadius: number;
  /**
   * Shrinks the black body under the tiles (cubie units per side): thick
   * stickerless tiles then form the piece's outside and the core shows only
   * deep in the gaps. Tiles reach down to meet it. Default 0.
   */
  bodyInset?: number;
  /**
   * Stickerless piece bodies shaped like their tiles instead of a box: under
   * each tile the plastic continues `depth` deep into the cubie, narrowing
   * by `taper` (the front of a piece is larger than its back; a centre piece
   * is as round as its tile), around a rounded core `core` × the cubie size.
   * Cubie units.
   */
  pieces?: {
    depth: number;
    taper: number;
    core: number;
    /**
     * Coloured plastic: the piece under each tile takes the tile's colour (a
     * corner is three coloured parts, an edge two, a centre one — like
     * stickerless cubes moulded in colour); the core stays `body`.
     */
    colored?: boolean;
    /**
     * "skirt" (default): plastic `depth` deep under each tile; "solid": the
     * same shape run down to the piece's centre, so the piece is filled with
     * colour — the tapered walls meet inside it, the nearer tile's outermost,
     * so inner faces split along the diagonals (a corner in three colours, an
     * edge in two). Needs `colored`.
     */
    fill?: "skirt" | "solid";
  };
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
    /**
     * Per piece kind: a different tile size / thickness — e.g. a centre cap
     * that is smaller and stands out more than the other tiles. Unset values
     * fall back to `size` / `thickness`. `dome`: a top that is flat inside a
     * circle (`flat` × the tile's reach) and falls `drop` lower at the corners.
     */
    kinds?: Partial<Record<PieceKind, { size?: number; thickness?: number; dome?: { flat: number; drop: number } }>>;
    /** Radius of the rounded top edge of a tile (cubie units, ≤ thickness). Default 0 (sharp). */
    bevel?: number;
    /**
     * "flat" — unlit, exact colours (printed-sticker look, default);
     * "plastic" — lit with a soft highlight, so thick bevelled tiles read as moulded plastic.
     */
    material?: "flat" | "plastic";
    /** Plastic finish: 0 = glossy (UV coated) … 1 = matte. Default 0.4. */
    roughness?: number;
    /**
     * Sticker finish as on real cubes (implies lit plastic):
     * "matte" — soft, diffuse, no sharp highlight;
     * "uv" — UV-coated: a clear glossy coat with sharp reflections.
     * Overrides `roughness`.
     */
    finish?: "matte" | "uv";
    /**
     * Stickerless: rounding of the cube's outer edges (cubie units). The two
     * tiles meeting there each curve over half of it, so colour runs round
     * the edge. Default 0 (a sharp edge).
     */
    edgeRadius?: number;
    /**
     * Stickerless: tile sides on the cube's outer edge reach the edge, so two
     * faces' colours meet directly on edges and corners (no black line there);
     * gaps remain only between neighbouring pieces on a face.
     */
    fillOuter?: boolean;
  };
  /**
   * Images on stickers — logos, symbols, printed patterns (see
   * attachments.ts). They follow their sticker. Brand logos are trademarks:
   * apps supply their own, the library ships none.
   */
  decals?: readonly Decal[];
  /** Extra geometry on stickers — holes, charging slots, your own types (see `defineFeature`). */
  features?: readonly FeatureUse[];
  /**
   * Your own 3D pieces (glTF / GLB URLs) instead of the built-in geometry —
   * see @cubecore/render pieceModels.ts for the convention (UFR corner, UF
   * edge, U centre; materials sticker-U / sticker-F / sticker-R are
   * recoloured). Kinds left out keep the built-in pieces; until a model has
   * loaded (or if it fails), the built-in pieces are drawn. Stickers /
   * outlines above still drive the 2D pictures.
   */
  models?: {
    corner?: string;
    edge?: string;
    center?: string;
    /** Uniform scale if the models aren't in cubie units. Default 1. */
    scale?: number;
    /** Height of the sticker surface above the cubie's face (for decals / features). Default: stickers.thickness. */
    surface?: number;
  };
  /** Colours for masked stickers. `dim` pulls the sticker colour towards the body by `dimAmount`. */
  mask: { ignored: string; oriented: string; dimAmount: number };
  /**
   * Floating "back" stickers showing the hidden faces. `colors`: a palette of
   * their own (e.g. white hints turned blue-grey so they show on a light page).
   */
  hints: { enabled: boolean; distance: number; opacity: number; ignoredOpacity: number; colors?: readonly [string, string, string, string, string, string] };
  background: string | null;
  /**
   * Adjustments for light and dark pages — whatever reads badly on one of
   * them (grey masked stickers, white back stickers, the background). Pick
   * one with `themed(skin, theme)`; renderers / pictures / the player take a
   * `theme` option.
   */
  themes?: { light?: SkinTheme; dark?: SkinTheme };
}

export interface SkinTheme {
  body?: string;
  background?: string | null;
  mask?: Partial<Skin["mask"]>;
  hints?: Partial<Skin["hints"]>;
}

export type Theme = "light" | "dark";

/** The skin as it should look on a `theme` page (its `themes` overrides applied). */
export function themed(skin: Skin, theme: Theme): Skin {
  const t = skin.themes?.[theme];
  if (!t) return skin;
  return {
    ...skin,
    ...(t.body !== undefined ? { body: t.body } : {}),
    ...(t.background !== undefined ? { background: t.background } : {}),
    mask: { ...skin.mask, ...t.mask },
    hints: { ...skin.hints, ...t.hints },
  };
}

/** Back-sticker colour: the hint palette if the skin has one, else the sticker's own. */
export function hintColor(skin: Skin, colorClass: number, state: MaskState): string | null {
  const own = skin.hints.colors?.[colorClass];
  return own && state === "regular" ? own : stickerColor(skin, colorClass, state);
}

const WESTERN = ["#ffffff", "#e8322f", "#1fb24a", "#ffd500", "#ff8a00", "#1e5eff"] as const;

/**
 * Presets are tuned for dark pages; on light ones the greys of masked
 * stickers go lighter and a white back sticker becomes blue-grey (on white it
 * would vanish — cubing.js #394).
 */
const LIGHT_PAGE: SkinTheme = {
  mask: { ignored: "#c4c7cd" },
  hints: { opacity: 0.85, ignoredOpacity: 0.55, colors: ["#6f7b8a", "#e8322f", "#1fb24a", "#e0bb00", "#ff8a00", "#1e5eff"] },
};

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
    themes: { light: LIGHT_PAGE },
  },
  /** Stickerless look: tiles fill the face, small radius, dark grey core. */
  stickerless: {
    body: "#1c1c1c",
    cubieSize: 0.99,
    cubieRadius: 0.08,
    bodyInset: 0.015,
    stickers: { colors: WESTERN, size: 0.975, radius: 0.1, fillOuter: true, thickness: 0.03, bevel: 0.012, edgeRadius: 0.03, material: "plastic" },
    mask: { ignored: "#4a4a4a", oriented: "#39c7d4", dimAmount: 0.55 },
    hints: { enabled: false, distance: 1.4, opacity: 0.75, ignoredOpacity: 0.35 },
    background: null,
    themes: { light: LIGHT_PAGE },
  },
  /**
   * GAN-style stickerless: tiles almost fill each cubie face; corner tiles
   * round off the corner facing the centre, edge tiles round their inner side
   * into a tongue, centre tiles are nearly round. Add a logo as a decal.
   */
  gan: {
    body: "#0a0a0a",
    cubieSize: 0.99,
    cubieRadius: 0.06,
    bodyInset: 0.02,
    pieces: { depth: 0.3, taper: 0.07, core: 0.6 },
    stickers: {
      colors: ["#f7f7f5", "#f5303a", "#1fc25a", "#ffe01a", "#ff8a1f", "#1f73ea"],
      size: 0.97,
      radius: 0.08,
      shape: { corner: { inner: 0.34, outer: 0.07 }, edge: { inner: 0.3, outer: 0.07 }, center: 0.36 },
      thickness: 0.035,
      bevel: 0.016,
      edgeRadius: 0.03,
      material: "plastic",
      fillOuter: true,
    },
    mask: { ignored: "#5a5a5a", oriented: "#39c7d4", dimAmount: 0.55 },
    hints: { enabled: false, distance: 1.4, opacity: 0.75, ignoredOpacity: 0.35 },
    background: null,
    themes: { light: LIGHT_PAGE },
  },
  /**
   * GAN i4-style smart cube (from product photos): light translucent-grey
   * internals showing in minimal gaps, thick matte tiles with soft edges, the
   * cube's edges rounded so colour runs round them, squarish centres with
   * four adjustment holes. The brand logo is up to the app (a decal).
   */
  ganI4: {
    body: "#cfd3d9",
    cubieSize: 0.992,
    cubieRadius: 0.07,
    bodyInset: 0.02,
    pieces: { depth: 0.3, taper: 0.07, core: 0.6 },
    stickers: {
      colors: ["#f3f2ee", "#f2323d", "#24c95c", "#ffe03a", "#ff7b22", "#2d6cf0"],
      size: 0.978,
      radius: 0.1,
      shape: { corner: { inner: 0.18, outer: 0.06 }, edge: { inner: 0.22, outer: 0.06 }, center: 0.22 },
      thickness: 0.04,
      bevel: 0.018,
      edgeRadius: 0.05,
      material: "plastic",
      roughness: 0.55,
      fillOuter: true,
    },
    // Tension-adjustment holes near the corners of every centre cap.
    features: [{ select: { kinds: ["center"] }, type: "holes", params: { radius: 0.045, at: [[0.64, 0.64], [-0.64, 0.64], [-0.64, -0.64], [0.64, -0.64]] } }],
    mask: { ignored: "#6a6d72", oriented: "#39c7d4", dimAmount: 0.55 },
    hints: { enabled: false, distance: 1.4, opacity: 0.75, ignoredOpacity: 0.35 },
    background: null,
    themes: { light: LIGHT_PAGE },
  },
  /**
   * GAN 356 M (stickerless): square corner tiles, edge tiles with a round
   * "tongue" towards the centre, near-round centres; thin glossy tiles.
   * Shapes, sizes and colours measured from "GAN CUBE 356s M air" by Amyyu
   * (https://sketchfab.com/3d-models/gan-cube-356s-m-air-dd4768b8fe2841c78e418230e5d9e192,
   * CC BY 4.0). No logo — that's up to the app (a decal).
   */
  gan356m: {
    body: "#1e2023",
    cubieSize: 0.992,
    cubieRadius: 0.05,
    bodyInset: 0.015,
    pieces: { depth: 0.3, taper: 0.06, core: 0.6 },
    stickers: {
      colors: ["#fafafa", "#e10b2a", "#008526", "#ffe700", "#f58d1f", "#00319d"],
      size: 0.99,
      radius: 0.015,
      shape: { corner: { inner: 0.016, outer: 0.014 }, edge: { inner: 0.375, outer: 0.015 }, center: 0.285 },
      thickness: 0.014,
      kinds: { center: { size: 0.979, thickness: 0.04 } }, // the centre cap: a little smaller, standing out more
      bevel: 0.006,
      edgeRadius: 0.02,
      material: "plastic",
      roughness: 0.3,
      fillOuter: true,
    },
    mask: { ignored: "#5a5a5a", oriented: "#39c7d4", dimAmount: 0.55 },
    hints: { enabled: false, distance: 1.4, opacity: 0.75, ignoredOpacity: 0.35 },
    background: null,
    themes: { light: LIGHT_PAGE },
  },
  /**
   * QiYi QY-SC smart cube (from photos): stickerless, moulded in colour
   * (a corner is three coloured parts, an edge two) around an ivory core;
   * thick "pillow" tiles with minimal gaps — corner tiles nearly square,
   * edge tiles rounded towards the centre, a smaller raised squircle
   * centre. The brand logo is up to the app (a decal).
   */
  qiyiSC: {
    body: "#ebe7da",
    pictureBody: null, // ivory plastic would blur with the white tiles in 2D
    cubieSize: 0.992,
    cubieRadius: 0.07,
    bodyInset: 0.02,
    // A fuller inside than other skins (the core nearly fills each piece): no see-through channels.
    pieces: { depth: 0.32, taper: 0.06, core: 0.55, colored: true, fill: "solid" },
    stickers: {
      colors: ["#ebe8df", "#d8061a", "#0bc21a", "#ffe51c", "#fd7501", "#1a72f5"],
      size: 0.985,
      radius: 0.04,
      shape: { corner: { inner: 0.06, outer: 0.03 }, edge: { inner: 0.25, outer: 0.03 }, center: 0.2 },
      thickness: 0.035,
      bevel: 0.022,
      // The centre cap: a little smaller, a round plateau level with the other tiles, its corners ~1.5 mm lower.
      kinds: { center: { size: 0.965, dome: { flat: 0.76, drop: 0.09 } } }, // plateau level with the other tiles
      edgeRadius: 0.05,
      material: "plastic",
      roughness: 0.35,
      fillOuter: true,
    },
    mask: { ignored: "#5a5a5a", oriented: "#39c7d4", dimAmount: 0.55 },
    hints: { enabled: false, distance: 1.4, opacity: 0.75, ignoredOpacity: 0.35 },
    background: null,
    themes: { light: LIGHT_PAGE },
  },
} satisfies Record<string, Skin>;

/** Tile side of a piece kind, relative to a cubie face (`stickers.kinds` or `stickers.size`). */
export const tileSize = (skin: Skin, kind: PieceKind): number => skin.stickers.kinds?.[kind]?.size ?? skin.stickers.size;
/** How far a piece kind's tiles stand out (`stickers.kinds` or `stickers.thickness`). */
export const tileThickness = (skin: Skin, kind: PieceKind): number => skin.stickers.kinds?.[kind]?.thickness ?? skin.stickers.thickness ?? 0;

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

/** The same skin with other sticker colours (U R F D L B home-face order) — e.g. a Japanese scheme or a custom one. */
export function withColors(skin: Skin, colors: readonly [string, string, string, string, string, string]): Skin {
  return { ...skin, stickers: { ...skin.stickers, colors } };
}
