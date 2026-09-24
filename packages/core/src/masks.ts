/**
 * Masks — which stickers matter. A mask gives each STICKER (by its home
 * facelet, i.e. piece identity) a display state, so it follows the pieces as
 * they move: masking "the cross edges" keeps highlighting them wherever they
 * are, which is what a "watch these pieces" view needs.
 *
 * Masks are defined for the canonical frame (cross on D, last layer on U, Roux
 * blocks on L/R) and mapped to any frame, so they are colour neutral too:
 * `presetMask("oll", frame)` masks the last layer of a cube solved with the
 * cross on any face.
 */

import { CUBIE_OF_FACELET, type Cubie, FACELETS, FACELET_COUNT, type Facelet } from "./geometry";
import { type Frame, IDENTITY_FRAME } from "./frames";
import type { State } from "./state";

/**
 * regular: full colour · dim: darkened colour (context) · ignored: grey (not
 * relevant) · oriented: one "this sticker matters for orientation" colour ·
 * invisible: not drawn.
 */
export type MaskState = "regular" | "dim" | "ignored" | "oriented" | "invisible";
export const MASK_STATES: readonly MaskState[] = ["regular", "dim", "ignored", "oriented", "invisible"];

/** Per home facelet (piece identity) → index into MASK_STATES. */
export type Mask = Uint8Array;

const code = (s: MaskState) => MASK_STATES.indexOf(s);

/** Rule over the CANONICAL home facelet and its cubie. */
export type MaskRule = (facelet: Facelet, cubie: Cubie) => MaskState;

export function buildMask(rule: MaskRule, frame: Frame = IDENTITY_FRAME): Mask {
  const mask = new Uint8Array(FACELET_COUNT);
  for (const f of FACELETS) mask[frame.map[f.index]] = code(rule(f, CUBIE_OF_FACELET[f.index]));
  return mask;
}

export const fullMask = (): Mask => new Uint8Array(FACELET_COUNT); // all "regular" (code 0)

/** Display state of whatever sticker currently sits at facelet position `position`. */
export function maskStateAt(mask: Mask, state: State, position: number): MaskState {
  return MASK_STATES[mask[state[position]]];
}

// ─── Presets (canonical: first layer D, last layer U; Roux blocks L/R) ───

const y = (c: Cubie) => c.pos[1];
const isCenter = (c: Cubie) => c.kind === "center";
const isCrossEdge = (c: Cubie) => c.kind === "edge" && y(c) === -1;
const inLastLayer = (c: Cubie) => y(c) === 1 && !isCenter(c);
const faceUp = (f: Facelet) => f.face === "U";

export type MaskPreset =
  | "full" | "cross" | "first-layer" | "f2l" | "ll" | "oll" | "pll" | "coll" | "ocll" | "ell" | "cll"
  | "eoline" | "zz-f2l" | "roux-fb" | "roux-blocks" | "cmll" | "lse";

const RULES: Record<MaskPreset, MaskRule> = {
  full: () => "regular",
  cross: (f, c) => (isCenter(c) ? "regular" : isCrossEdge(c) ? "regular" : "ignored"),
  "first-layer": (f, c) => (isCenter(c) || y(c) === -1 ? "regular" : "ignored"),
  f2l: (f, c) => (y(c) <= 0 || isCenter(c) ? "regular" : "ignored"),
  ll: () => "regular",
  // Orientation: last-layer pieces show only their top-facing colour.
  oll: (f, c) => isCenter(c) ? "regular" : (inLastLayer(c) ? (faceUp(f) ? "regular" : "ignored") : "dim"),
  // Permutation: everything in colour, the first two layers dimmed.
  pll: (f, c) => (inLastLayer(c) || isCenter(c) ? "regular" : "dim"),
  coll: (f, c) => isCenter(c) ? "regular" : (inLastLayer(c) ? (c.kind === "corner" || faceUp(f) ? "regular" : "ignored") : "dim"),
  ocll: (f, c) => isCenter(c) ? "regular" : (inLastLayer(c) ? (c.kind === "corner" && faceUp(f) ? "regular" : "ignored") : "dim"),
  cll: (f, c) => isCenter(c) ? "regular" : (inLastLayer(c) ? (c.kind === "corner" ? "regular" : "ignored") : "dim"),
  ell: (f, c) => isCenter(c) ? "regular" : (inLastLayer(c) ? (c.kind === "edge" ? "regular" : "ignored") : "dim"),
  // ZZ: every edge shown as good/bad orientation material, the line in colour.
  eoline: (f, c) => (c.kind === "edge" ? (isCrossEdge(c) && c.pos[0] === 0 ? "regular" : "oriented") : isCenter(c) ? "regular" : "ignored"),
  "zz-f2l": (f, c) => (y(c) <= 0 || isCenter(c) ? "regular" : "ignored"),
  "roux-fb": (f, c) => (c.pos[0] === -1 && y(c) <= 0 ? "regular" : isCenter(c) ? "dim" : "ignored"),
  "roux-blocks": (f, c) => (c.pos[0] !== 0 && y(c) <= 0 ? "regular" : isCenter(c) ? "dim" : "ignored"),
  cmll: (f, c) => (c.kind === "corner" && y(c) === 1 ? "regular" : c.pos[0] !== 0 && y(c) <= 0 ? "dim" : "ignored"),
  lse: (f, c) => (c.pos[0] === 0 || (c.kind === "edge" && y(c) === 1) ? "regular" : "dim"),
};

export const MASK_PRESETS = Object.keys(RULES) as MaskPreset[];

export function presetMask(preset: MaskPreset, frame: Frame = IDENTITY_FRAME): Mask {
  return buildMask(RULES[preset], frame);
}
